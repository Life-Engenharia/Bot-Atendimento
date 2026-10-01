export type AdministrativeResponse = {
  to: string;
  state: 'ADMIN_MENU' | 'ADMIN_CONFIRMATION' | 'ADMIN_UPDATED' | 'ADMIN_DENIED';
  text: string;
};

export type OperationalSetting = {
  key: 'responsaveis' | 'escalas' | 'horarios' | 'roteamento';
  value: Record<string, string>;
};

export interface OperationalConfigurationStore {
  appendSetting(setting: OperationalSetting, actor: string): Promise<void>;
  listSettings(): Promise<OperationalSetting[]>;
  replaceSetting(
    key: OperationalSetting['key'],
    values: Record<string, string>[],
    actor: string,
  ): Promise<void>;
}

const menu = [
  '⚙️ Configuração operacional',
  '',
  'Use este painel para ajustar a operação sem alterar o código.',
  '',
  '1. Responsáveis — quem atende cada área',
  '2. Escalas — principal, backup e período de cobertura',
  '3. Horários — quando cada área atende',
  '4. Roteamento — para qual área cada solicitação segue',
  '5. Transferências — como os encaminhamentos são registrados',
  '',
  'Responda com o número da opção. Nenhuma alteração será aplicada sem CONFIRMAR.',
].join('\n');

export class AdministrativeMenuService {
  private readonly pending = new Map<string, OperationalSetting>();

  constructor(
    private readonly adminPhone: string,
    private readonly store: OperationalConfigurationStore,
  ) {}

  async handle(phone: string, text?: string): Promise<AdministrativeResponse | undefined> {
    const command = normalize(text);
    if (phone !== this.adminPhone) return undefined;
    if (command === '/config' || command === 'config')
      return this.response(phone, 'ADMIN_MENU', menu);
    if (command === '1')
      return this.response(
        phone,
        'ADMIN_MENU',
        '👤 Cadastro de responsável\n\nInforme o nome, telefone e área.\n\nExemplo:\nRESPONSAVEL Ana Silva | 5511999999999 | comercial',
      );
    if (command === '2')
      return this.response(
        phone,
        'ADMIN_MENU',
        '📅 Configuração de escala\n\nInforme área, dias, horário, responsável principal e backup.\n\nExemplo:\nESCALA comercial | seg-sex | 08:00 | 18:00 | 5511999999999 | 5511988888888',
      );
    if (command === '3')
      return this.response(
        phone,
        'ADMIN_MENU',
        '🕒 Horário de atendimento\n\nInforme área, dias e período.\n\nExemplo:\nHORARIO comercial | seg-sex | 08:00 | 18:00',
      );
    if (command === '4')
      return this.response(
        phone,
        'ADMIN_MENU',
        '➡️ Regra de roteamento\n\nInforme o tipo de solicitação e a área de destino.\n\nExemplo:\nROTA solicitacao_sem_classificacao | humano',
      );
    if (command === '5')
      return this.response(
        phone,
        'ADMIN_MENU',
        '🔁 Histórico de transferências\n\nCada encaminhamento registra origem, destino, motivo, autor e horário. Casos que o bot não entende seguem automaticamente para a fila humana.',
      );

    if (command === 'confirmar') {
      const pending = this.pending.get(phone);
      if (!pending)
        return this.response(
          phone,
          'ADMIN_MENU',
          'Não há nenhuma alteração aguardando confirmação. Envie /config para abrir o painel.',
        );
      await this.store.appendSetting(pending, phone);
      this.pending.delete(phone);
      return this.response(
        phone,
        'ADMIN_UPDATED',
        '✅ Alteração salva e registrada na auditoria. Envie /config para fazer outro ajuste.',
      );
    }

    const setting = parseSetting(text);
    if (!setting)
      return this.response(
        phone,
        'ADMIN_MENU',
        'Não reconheci esse formato. Envie /config, escolha uma opção e copie o exemplo apresentado.',
      );
    this.pending.set(phone, setting);
    return this.response(phone, 'ADMIN_CONFIRMATION', confirmationMessage(setting));
  }

  private response(
    to: string,
    state: AdministrativeResponse['state'],
    text: string,
  ): AdministrativeResponse {
    return { to, state, text };
  }
}

function parseSetting(text?: string): OperationalSetting | undefined {
  const [instruction, ...parts] = (text ?? '').split('|').map((part) => part.trim());
  const [command, firstValue] = instruction.split(/\s+/, 2);
  const values = [firstValue, ...parts].filter(Boolean);
  if (command?.toLocaleLowerCase('pt-BR') === 'responsavel' && values.length === 3)
    return {
      key: 'responsaveis',
      value: { nome: values[0], telefone: onlyDigits(values[1]), area: values[2] },
    };
  if (command?.toLocaleLowerCase('pt-BR') === 'escala' && values.length === 6)
    return {
      key: 'escalas',
      value: {
        area: values[0],
        dias: values[1],
        inicio: values[2],
        fim: values[3],
        principal: onlyDigits(values[4]),
        backup: onlyDigits(values[5]),
      },
    };
  if (command?.toLocaleLowerCase('pt-BR') === 'horario' && values.length === 4)
    return {
      key: 'horarios',
      value: { area: values[0], dias: values[1], inicio: values[2], fim: values[3] },
    };
  if (command?.toLocaleLowerCase('pt-BR') === 'rota' && values.length === 2)
    return { key: 'roteamento', value: { solicitacao: values[0], destino: values[1] } };
  return undefined;
}

function confirmationMessage(setting: OperationalSetting): string {
  const labels: Record<OperationalSetting['key'], string> = {
    responsaveis: 'responsável',
    escalas: 'escala',
    horarios: 'horário',
    roteamento: 'regra de roteamento',
  };
  const details = Object.entries(setting.value)
    .map(([key, value]) => `• ${key}: ${value}`)
    .join('\n');
  return `Revise a ${labels[setting.key]}:\n\n${details}\n\nResponda CONFIRMAR para salvar ou /config para cancelar.`;
}

function normalize(value?: string): string {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR');
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}
