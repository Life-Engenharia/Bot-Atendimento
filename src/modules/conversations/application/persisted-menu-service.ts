import {
  SupabaseConversationStore,
  StoredConversation,
} from '../../../infra/supabase/conversation-store.js';
import {
  commercialServiceByOption,
  commercialServiceMenu,
} from '../../commercial/domain/commercial-services.js';
import {
  AdministrativeMenuService,
  AdministrativeResponse,
} from '../../internal_operations/application/administrative-menu-service.js';
import { IncomingMessage, WebhookResult } from '../../webhook/application/webhook-processor.js';
import { MenuResponse } from './menu-service.js';
import { TriageAnalyzer } from './triage-analyzer.js';
import { ResponseRefiner } from './response-refiner.js';
import { identifyEquipment } from '../domain/equipment-catalog.js';
import { MediaIngestionService } from './media-ingestion-service.js';

type BotResponse = MenuResponse | AdministrativeResponse;

export type OutboundSender = {
  sendText(to: string, body: string): Promise<{ messageId: string }>;
};

const consentMessage =
  'Olá! Tudo bem? Eu sou a assistente virtual da Life Engenharia. Posso te ajudar a organizar sua solicitação e encaminhá-la para o time responsável.\n\nPara isso, vou registrar as informações desta conversa. Podemos continuar?\n\n1. Sim, vamos lá\n2. Prefiro falar com uma pessoa';
const routeMenu =
  'Perfeito! Como posso te ajudar hoje?\n\n1. Quero contratar um serviço ou pedir um orçamento\n2. Já sou cliente Life e preciso de assistência técnica\n3. Quero falar com uma pessoa';
const humanMessage =
  'Claro! Vou encaminhar sua solicitação para uma pessoa da equipe Life. Assim que possível, ela seguirá com você por aqui.';

export class PersistedMenuService {
  constructor(
    private readonly store: SupabaseConversationStore,
    private readonly administrativeMenu?: AdministrativeMenuService,
    private readonly triageAnalyzer?: TriageAnalyzer,
    private readonly outboundSender?: OutboundSender,
    private readonly responseRefiner?: ResponseRefiner,
    private readonly mediaIngestionService?: MediaIngestionService,
  ) { }

  async process(
    messages: IncomingMessage[],
  ): Promise<WebhookResult & { responses: BotResponse[] }> {
    let processed = 0;
    let duplicates = 0;
    const acceptedMessages: IncomingMessage[] = [];
    const responses: BotResponse[] = [];
    for (const message of messages) {
      const accepted = await this.store.acceptInbound(message);
      if (!accepted) {
        duplicates += 1;
        continue;
      }
      processed += 1;
      acceptedMessages.push(message);
      await this.mediaIngestionService?.ingest(accepted.conversation, message.media);
      const administrativeResponse = await this.administrativeMenu?.handle(
        message.from,
        message.text,
      );
      responses.push(administrativeResponse ?? (await this.handle(message, accepted.conversation)));
    }
    return { processed, duplicates, acceptedMessages, responses };
  }

  private async handle(
    message: IncomingMessage,
    conversation: StoredConversation,
  ): Promise<MenuResponse> {
    const text = normalize(message.text);
    let responseText: string;
    if (conversation.state === 'consent') {
      if (!text && message.media?.length) {
        responseText = `Recebi ${describeMedia(message.media)}. ${consentMessage}`;
      } else if (!text) responseText = consentMessage;
      else if (isHuman(text) || text === '2') {
        conversation.state = 'human';
        conversation.route = 'human';
        responseText = humanMessage;
        await this.store.recordHandoff(conversation, 'customer_requested', 'customer');
        await this.store.audit('menu.handoff_requested', 'customer', { phone: message.from });
      } else if (isConsent(text)) {
        conversation.state = 'route';
        const suggestedRoute = inferRoute(conversation.context.initialIntent)
          ?? await this.tryClassify(conversation.context.initialIntent ?? '');
        if (suggestedRoute) {
          conversation.context.suggestedRoute = suggestedRoute;
          responseText = suggestedRoute === 'technical'
            ? 'Pelo que você descreveu, parece que precisa de assistência técnica. Posso seguir com essa triagem? Responda SIM para continuar ou escolha outra opção abaixo.\n\n1. Orçamento ou serviço\n2. Assistência técnica\n3. Falar com uma pessoa'
            : 'Pelo que você descreveu, parece que busca um serviço ou orçamento. Posso seguir por esse caminho? Responda SIM para continuar ou escolha outra opção abaixo.\n\n1. Orçamento ou serviço\n2. Assistência técnica\n3. Falar com uma pessoa';
        } else responseText = routeMenu;
        await this.store.audit('menu.consent_accepted', 'customer', { phone: message.from });
      } else {
        conversation.context.initialIntent = message.text?.trim();
        const equipment = identifyEquipment(message.text);
        if (equipment) {
          conversation.context.equipmentDomain = equipment.domain;
          conversation.context.identifiedEquipment = equipment.label;
        }
        const intentAcknowledgement = equipment
          ? `Entendi que você precisa de apoio técnico com ${equipment.label}. `
          : inferRoute(message.text) === 'technical'
          ? 'Entendi que você precisa de apoio técnico. '
          : inferRoute(message.text) === 'commercial'
            ? 'Entendi que você quer falar sobre um serviço ou orçamento. '
            : 'Entendi que você precisa de atendimento. ';
        responseText =
          `${intentAcknowledgement}Para organizar sua solicitação e encaminhá-la ao time responsável, preciso registrar as informações desta conversa. Podemos continuar?\n\n1. Sim, vamos lá\n2. Prefiro falar com uma pessoa\n\nResponda 1 para autorizar o registro e continuar, ou 2 para falar com uma pessoa.`;
      }
    } else if (conversation.state === 'route') {
      if (isHuman(text) || text === '3') {
        conversation.state = 'human';
        conversation.route = 'human';
        responseText = humanMessage;
        await this.store.recordHandoff(conversation, 'customer_requested', 'customer');
        await this.store.audit('menu.handoff_requested', 'customer', { phone: message.from });
      } else if (
        text === 'sim' && conversation.context.suggestedRoute === 'commercial'
      ) {
        conversation.state = 'collecting';
        conversation.route = 'commercial';
        delete conversation.context.suggestedRoute;
        responseText = commercialServiceMenu();
      } else if (text === 'sim' && conversation.context.suggestedRoute === 'technical') {
        conversation.state = 'collecting';
        conversation.route = 'technical';
        delete conversation.context.suggestedRoute;
        responseText = `Entendi. Vou organizar as informações para a equipe técnica, sem orientar nenhuma intervenção no equipamento.\n\n${technicalQuestion('contactName')}`;
      } else if ((text === 'não' || text === 'nao') && conversation.context.suggestedRoute) {
        delete conversation.context.suggestedRoute;
        responseText = routeMenu;
      } else if (
        text === '1' ||
        text.includes('orçamento') ||
        text.includes('orcamento') ||
        text.includes('contratar')
      ) {
        conversation.state = 'collecting';
        conversation.route = 'commercial';
        responseText = commercialServiceMenu();
        await this.store.audit('menu.commercial_selected', 'customer', { phone: message.from });
      } else if (text === '2' || text.includes('assistência') || text.includes('assistencia')) {
        conversation.state = 'collecting';
        conversation.route = 'technical';
        responseText =
          `Entendi. Vou fazer algumas perguntas rápidas para organizar o chamado. Por segurança, não mexa no equipamento nem em painéis energizados; a equipe técnica vai validar as informações antes de orientar qualquer ação.\n\n${technicalQuestion('contactName')}`;
        await this.store.audit('menu.technical_selected', 'customer', { phone: message.from });
      } else {
        const analysis = await this.tryClassify(text);
        if (analysis === 'commercial') {
          conversation.state = 'collecting';
          conversation.route = 'commercial';
          responseText = commercialServiceMenu();
          await this.store.audit('menu.ai_commercial_selected', 'openai', { phone: message.from });
        } else if (analysis === 'technical') {
          conversation.state = 'collecting';
          conversation.route = 'technical';
          responseText =
            `Entendi. Vou fazer algumas perguntas rápidas para organizar o chamado. Por segurança, não mexa no equipamento nem em painéis energizados; a equipe técnica vai validar as informações antes de orientar qualquer ação.\n\n${technicalQuestion('contactName')}`;
          await this.store.audit('menu.ai_technical_selected', 'openai', { phone: message.from });
        } else {
          conversation.state = 'human';
          conversation.route = 'human';
          responseText =
            'Não consegui identificar sua solicitação com segurança. Vou encaminhar esta conversa para uma pessoa da equipe Life.';
          await this.store.recordHandoff(conversation, 'classification_unresolved', 'bot');
          await this.store.audit('menu.classification_unresolved', 'bot', { phone: message.from });
        }
      }
    } else if (
      conversation.state === 'collecting' &&
      conversation.route === 'commercial' &&
      !conversation.context.service
    ) {
      const service = commercialServiceByOption(text);
      if (!service) responseText = 'Escolha uma opção de 1 a 10 para informar o serviço desejado.';
      else {
        conversation.context.service = service;
        responseText = `Perfeito, você selecionou ${service}. Em qual cidade e unidade será o atendimento?`;
        await this.store.audit('commercial.service_selected', 'customer', {
          phone: message.from,
          service,
        });
      }
    } else if (conversation.state === 'collecting' && conversation.route === 'technical') {
      if (conversation.context.impactConfirmation) {
        if (!/(parcial|parado|totalmente|funcionando)/i.test(message.text ?? '')) {
          responseText = 'Para registrar corretamente, responda se o equipamento está TOTALMENTE PARADO, PARCIALMENTE OPERANTE ou FUNCIONANDO.';
        } else {
          conversation.context.operationalImpact = message.text?.trim();
          delete conversation.context.impactConfirmation;
          responseText = technicalQuestion('contingency');
        }
      } else {
      const nextField = nextTechnicalField(conversation);
      if (!nextField) throw new Error('Não há campo técnico pendente.');
      if (!message.text?.trim()) responseText = technicalQuestion(nextField);
      else {
        if (nextField === 'operationalImpact' && hasImpactConflict(conversation.context.symptom, message.text)) {
          conversation.context.impactConfirmation = message.text.trim();
          responseText = 'Só para confirmar a urgência: você informou que o equipamento “apagou de vez”, mas agora mencionou operação parcial. Ele está TOTALMENTE PARADO, PARCIALMENTE OPERANTE ou já voltou a FUNCIONAR?';
        } else {
        conversation.context[nextField] = message.text.trim();
        if (nextField === 'contractReference' && hasNoLifeHistory(message.text)) {
          conversation.route = 'commercial';
          conversation.context.service = 'Assistência avulsa';
          responseText = 'Entendi. Como não há contrato ou histórico Life identificado, vou encaminhar como assistência avulsa para o Comercial, sem perder os dados que você já informou. Informe o CNPJ ou responda “pessoa física”.';
          await this.store.audit('technical.assistance_avulsa_routed', 'rules', { phone: message.from });
        } else {
          const following = nextTechnicalField(conversation);
          if (following) responseText = technicalQuestion(following, conversation);
          else {
            const priority = suggestTechnicalPriority(conversation);
            conversation.state = 'review';
            responseText = technicalSummary(conversation, priority);
            await this.store.audit('technical.review_ready', 'rules', { phone: message.from, priority: priority.level, reason: priority.reason });
          }
        }
        }
      }
      }
    } else if (conversation.state === 'collecting' && conversation.route === 'commercial') {
      const editing = conversation.context.editingField as CommercialContextField | undefined;
      const nextField = editing ?? nextCommercialField(conversation);
      if (!nextField) throw new Error('Não há campo comercial pendente.');
      if (!message.text?.trim()) responseText = commercialQuestion(nextField);
      else {
        const value = message.text.trim();
        if (nextField === 'email' && value.toLocaleLowerCase('pt-BR') !== 'pular' && !isValidEmail(value)) {
          responseText = 'Informe um e-mail válido ou responda “pular” para continuar sem esse dado.';
        } else if (nextField === 'contactPhone' && !isValidPhone(value)) {
          responseText = 'Informe o telefone com DDD, somente números ou no formato +55 79 99999-9999.';
        } else {
          conversation.context[nextField] = value.toLocaleLowerCase('pt-BR') === 'pular' ? 'não informado' : value;
          delete conversation.context.editingField;
          const followingField = nextCommercialField(conversation);
          if (followingField) responseText = commercialQuestion(followingField);
          else {
            conversation.state = 'review';
            responseText = commercialSummary(conversation);
            await this.store.audit('commercial.review_ready', 'customer', { phone: message.from });
          }
        }
      }
    } else if (conversation.state === 'review' && conversation.route === 'commercial') {
      if (text === 'confirmar' || text === 'sim') {
        const reference = await this.store.createCommercialProtocol(conversation);
        conversation.state = 'queued';
        responseText = `Solicitação confirmada. Seu protocolo é ${reference}. A equipe comercial seguirá com você por aqui.`;
      } else if (text.startsWith('editar ')) {
        const field = commercialFieldFromLabel(text.slice(7));
        if (!field) responseText = 'Você pode editar: local, nome, empresa, cnpj, telefone, e-mail, prazo ou necessidade.';
        else {
          conversation.state = 'collecting';
          conversation.context.editingField = field;
          responseText = commercialQuestion(field);
        }
      } else {
        responseText =
          'Revise os dados acima. Responda CONFIRMAR para gerar o protocolo ou “editar nome do campo” para corrigir uma informação.';
      }
    } else if (conversation.state === 'review' && conversation.route === 'technical') {
      if (text === 'confirmar' || text === 'sim') {
        const priority = suggestTechnicalPriority(conversation);
        const reference = await this.store.createTechnicalProtocol(conversation, priority.level, priority.reason);
        conversation.state = 'queued';
        responseText = `Pré-triagem confirmada. Seu protocolo é ${reference}, com prioridade ${priority.level}. A equipe Life vai validar as informações e retornar por aqui. Em caso de risco imediato, mantenha o local seguro e acione também os procedimentos internos da unidade.`;
        await this.store.recordHandoff(conversation, `technical_${priority.level}`, 'system');
        await this.store.audit('technical.priority_suggested', 'rules', { phone: message.from, priority: priority.level, reason: priority.reason });
      } else {
        responseText = 'Revise os dados acima. Responda CONFIRMAR para registrar a pré-triagem ou descreva o dado que precisa corrigir para ser encaminhado à equipe.';
      }
    } else if (conversation.state === 'human') {
      responseText = isThanks(text)
        ? 'Por nada! A pessoa responsável terá acesso às informações enviadas e seguirá com você por aqui assim que assumir o atendimento.'
        : asksWhichDetails(text)
        ? 'Enquanto a pessoa da equipe assume, você pode enviar: nome e empresa, unidade/local, equipamento ou serviço envolvido, o que aconteceu e se há algum risco ou urgência. Não é necessário repetir dados que você já enviou.'
        : 'Recebi sua atualização e ela ficará visível para a pessoa da equipe Life que assumir o atendimento. Se puder, informe o local, equipamento ou serviço envolvido e a urgência.';
    }
    else if (conversation.state === 'queued' && conversation.route === 'technical')
      responseText = isThanks(text)
        ? 'Por nada! Sua pré-triagem já está registrada. Se surgir alguma alteração importante, como parada total ou risco, envie por aqui para que a equipe veja no histórico.'
        :
        'Sua pré-triagem já foi registrada e está com a equipe Life. Você pode enviar informações adicionais por aqui enquanto aguarda o retorno.';
    else if (conversation.state === 'queued' && conversation.route === 'commercial')
      responseText = isThanks(text)
        ? 'Por nada! Sua solicitação já está registrada com a equipe comercial. Se lembrar de algum detalhe útil, pode enviar por aqui.'
        :
        'Sua solicitação comercial já foi registrada. Você pode enviar informações adicionais por aqui enquanto aguarda o retorno da equipe.';
    else
      responseText =
        'Perfeito, recebi sua escolha. Vamos seguir com as próximas informações por aqui.';
    responseText = await this.refineSupportReply(conversation, message.text, responseText);
    await this.store.saveConversation(conversation);
    await this.deliverOutbound(conversation, message.from, responseText);
    return { to: message.from, state: menuState(conversation), text: responseText };
  }

  private async deliverOutbound(
    conversation: StoredConversation,
    to: string,
    text: string,
  ): Promise<void> {
    if (!this.outboundSender) {
      await this.store.saveOutbound(conversation.id, text);
      return;
    }
    try {
      const result = await this.outboundSender.sendText(to, text);
      await this.store.saveOutbound(conversation.id, text, { messageId: result.messageId, status: 'sent' });
      await this.store.audit('meta.outbound_sent', 'system', {
        conversationId: conversation.id,
        metaMessageId: result.messageId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao enviar mensagem.';
      await this.store.saveOutbound(conversation.id, text, { messageId: `failed-outbound:${crypto.randomUUID()}`, status: 'failed' });
      await this.store.audit('meta.outbound_failed', 'system', {
        conversationId: conversation.id,
        error: message,
      });
    }
  }

  private async tryClassify(text: string): Promise<'commercial' | 'technical' | undefined> {
    if (!this.triageAnalyzer || !text) return undefined;
    try {
      const analysis = await this.triageAnalyzer.classify(text);
      return analysis.confidence >= 0.8 && analysis.route !== 'human' ? analysis.route : undefined;
    } catch {
      return undefined;
    }
  }

  private async refineSupportReply(
    conversation: StoredConversation,
    latestCustomerMessage: string | undefined,
    reply: string,
  ): Promise<string> {
    if (!this.responseRefiner || !latestCustomerMessage) return reply;
    // As perguntas, resumos, protocolos e decisões seguem sendo determinísticos.
    // A IA atua somente nas confirmações após a conversa já estar encaminhada.
    if (conversation.state !== 'human' && conversation.state !== 'queued') return reply;
    try {
      return await this.responseRefiner.refine(reply, latestCustomerMessage);
    } catch {
      return reply;
    }
  }
}

type CommercialContextField =
  'location' | 'contactName' | 'company' | 'cnpj' | 'contactPhone' | 'email' | 'timeline' | 'need';

const commercialFields: CommercialContextField[] = [
  'location',
  'contactName',
  'company',
  'cnpj',
  'contactPhone',
  'email',
  'timeline',
  'need',
];

type TechnicalContextField =
  | 'contactName'
  | 'company'
  | 'location'
  | 'contractReference'
  | 'equipment'
  | 'manufacturerModel'
  | 'assetIdentifier'
  | 'symptom'
  | 'alarm'
  | 'startedFrequency'
  | 'operationalImpact'
  | 'contingency'
  | 'reportedRisk';

const technicalFields: TechnicalContextField[] = [
  'contactName', 'company', 'location', 'contractReference', 'equipment', 'manufacturerModel', 'assetIdentifier',
  'symptom', 'alarm', 'startedFrequency', 'operationalImpact', 'contingency', 'reportedRisk',
];

function nextTechnicalField(conversation: StoredConversation): TechnicalContextField | undefined {
  return technicalFields.find((field) => !conversation.context[field]);
}

function technicalQuestion(field: TechnicalContextField, conversation?: StoredConversation): string {
  const questions: Record<TechnicalContextField, string> = {
    contactName: 'Para identificar quem solicitou o atendimento, qual é o seu nome?',
    company: 'Qual é a empresa ou instituição responsável pela unidade?',
    location: 'Para localizar o atendimento, qual unidade/local está com o problema e quem é o contato no local?',
    contractReference: 'Para verificarmos o histórico do equipamento, há contrato ativo ou atendimento anterior da Life? Se não souber, escreva “não sei”.',
    equipment: 'Qual equipamento está afetado?',
    manufacturerModel: 'Informe fabricante e modelo, se disponíveis. Caso não saiba, escreva “não identificado”.',
    assetIdentifier: 'Informe o patrimônio ou número de série, se disponível. Caso não saiba, escreva “não identificado”.',
    symptom: 'Descreva o que está acontecendo. Não tente abrir equipamentos ou alterar painéis.',
    alarm: 'Há algum código ou mensagem de alarme? Caso não exista ou não saiba, escreva “não informado”.',
    startedFrequency: 'Quando começou e acontece sempre ou de forma intermitente?',
    operationalImpact: 'Para definir a urgência, o equipamento está totalmente parado, parcialmente operante ou funcionando?',
    contingency: 'Existe equipamento alternativo ou plano de contingência?',
    reportedRisk: conversation?.context.equipmentDomain === 'hemotherapy'
      ? 'Há risco para bolsas de sangue, hemocomponentes, doadores, pacientes ou uma operação essencial?'
      : 'Há risco para pessoas, sangue, medicamentos ou uma operação essencial?',
  };
  return questions[field];
}

function suggestTechnicalPriority(conversation: StoredConversation): { level: 'P1' | 'P2' | 'P3' | 'P4'; reason: string } {
  const context = conversation.context;
  const value = `${context.operationalImpact} ${context.contingency} ${context.reportedRisk} ${context.symptom}`.toLocaleLowerCase('pt-BR');
  const criticalRisk = /(risco|pessoas|sangue|medicamento|essencial|vida)/.test(value);
  const stopped = /(parad|totalmente|inoperante|apagou|desligou|não liga|nao liga)/.test(value);
  const noBackup = /(sem conting|não.*alternativ|nao.*alternativ|nenhum)/.test(value);
  if (criticalRisk && stopped && noBackup) return { level: 'P1', reason: 'Risco crítico informado, equipamento parado e sem contingência.' };
  if (stopped || (criticalRisk && noBackup) || /(falha relevante|contingência limitada|contingencia limitada)/.test(value)) return { level: 'P2', reason: 'Parada, risco relevante ou contingência insuficiente; requer retorno humano prioritário.' };
  if (/(parcial|reduz|intermitente|alarme)/.test(value)) return { level: 'P3', reason: 'Falha parcial ou desempenho reduzido informado.' };
  return { level: 'P4', reason: 'Demanda sem interrupção crítica identificada na pré-triagem.' };
}

function nextCommercialField(conversation: StoredConversation): CommercialContextField | undefined {
  return commercialFields.find((field) => !conversation.context[field]);
}

function commercialQuestion(field: CommercialContextField): string {
  const questions: Record<CommercialContextField, string> = {
    location: 'Em qual cidade e unidade será o atendimento?',
    contactName: 'Qual é o seu nome para identificação?',
    company: 'Qual é a empresa ou instituição? Se for pessoa física, responda “pessoa física”.',
    cnpj: 'Informe o CNPJ da empresa. Se for pessoa física, responda “pessoa física”.',
    contactPhone: 'Qual telefone devemos usar para retorno?',
    email: 'Qual e-mail devemos usar para retorno? Se preferir não informar, responda “pular”.',
    timeline: 'Qual é o prazo desejado para este atendimento?',
    need: 'Descreva brevemente a necessidade ou o objetivo do serviço.',
  };
  return questions[field];
}

function commercialSummary(conversation: StoredConversation): string {
  const context = conversation.context;
  return [
    'Revise sua solicitação:',
    `• Serviço: ${context.service}`,
    `• Local: ${context.location}`,
    `• Contato: ${context.contactName}`,
    `• Empresa: ${context.company}`,
    `• CNPJ: ${context.cnpj}`,
    `• Telefone: ${context.contactPhone}`,
    `• E-mail: ${context.email}`,
    `• Prazo: ${context.timeline}`,
    `• Necessidade: ${context.need}`,
    '',
    'Responda CONFIRMAR para gerar o protocolo ou “editar nome do campo” para corrigir algum dado.',
  ].join('\n');
}

function technicalSummary(
  conversation: StoredConversation,
  priority: { level: 'P1' | 'P2' | 'P3' | 'P4'; reason: string },
): string {
  const context = conversation.context;
  return [
    'Revise a pré-triagem técnica:',
    `• Contato: ${context.contactName} · ${context.company}`,
    `• Local: ${context.location}`,
    `• Contrato/histórico: ${context.contractReference}`,
    `• Equipamento: ${context.equipment} · ${context.manufacturerModel}`,
    `• Patrimônio/série: ${context.assetIdentifier}`,
    `• Sintoma: ${context.symptom}`,
    `• Alarme: ${context.alarm}`,
    `• Impacto: ${context.operationalImpact} · Contingência: ${context.contingency}`,
    `• Risco informado: ${context.reportedRisk}`,
    `• Prioridade sugerida: ${priority.level} — ${priority.reason}`,
    '',
    'Responda CONFIRMAR para registrar a pré-triagem. A prioridade será validada por uma pessoa da equipe Life.',
  ].join('\n');
}

function menuState(conversation: StoredConversation): MenuResponse['state'] {
  if (conversation.state === 'consent') return 'CONSENT';
  if (conversation.state === 'route') return 'ROUTE';
  if (conversation.state === 'human') return 'HANDOFF_HUMANO';
  if (conversation.route === 'technical') return 'TECHNICAL_PENDING';
  return conversation.context.service ? 'COMMERCIAL_COLLECTING' : 'COMMERCIAL_SERVICE_MENU';
}
function normalize(value?: string): string {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR');
}
function isConsent(value: string): boolean {
  return value === '1' || value === 'sim' || value === 'sim, continuar' || value === 'continuar';
}
function isHuman(value: string): boolean {
  return (
    value.includes('falar com uma pessoa') ||
    value.includes('atendente') ||
    value.includes('humano')
  );
}

function inferRoute(message?: string): 'commercial' | 'technical' | undefined {
  if (identifyEquipment(message)) return 'technical';
  const value = normalize(message);
  if (/(chiller|ar[ -]?condicionado|climatiza[cç][aã]o|compo[ -]?guard|compressor|evaporador|condensador|fan[ -]?coil|fancoil|bomba|equipamento|alarme|falha|parou|apagou|queimou|n[aã]o funciona|n[aã]o gela|n[aã]o resfria|vazamento|temperatura|manuten[cç][aã]o|assist[eê]ncia)/.test(value)) return 'technical';
  if (/(orçamento|orcamento|proposta|contratar|projeto|comprar|locação|locacao)/.test(value)) return 'commercial';
  return undefined;
}

function hasImpactConflict(symptom?: string, impact?: string): boolean {
  const reportedStop = /(apagou|parou|inoperante|não liga|nao liga|desligou)/i.test(symptom ?? '');
  const reportedPartial = /(parcial|funcionando)/i.test(impact ?? '');
  return reportedStop && reportedPartial;
}

function isThanks(value: string): boolean {
  return /\b(obrigad|valeu|agradeç|agradec|gratid)/i.test(value.trim());
}

function describeMedia(media: NonNullable<IncomingMessage['media']>): string {
  const types = [...new Set(media.map((item) => ({ image: 'uma imagem', audio: 'um áudio', video: 'um vídeo', document: 'um documento' })[item.type]))];
  return types.length === 1 ? types[0] : 'mídias anexadas';
}

function asksWhichDetails(value: string): boolean {
  return /(?:qual|quais|que).*detalh|o que.*enviar|mais coisa|mais informa/i.test(value);
}

function hasNoLifeHistory(value: string): boolean {
  return /^(não|nao|sem)(\s+(tenho|contrato|hist[oó]rico|v[ií]nculo))?$/i.test(value.trim()) ||
    /(sem contrato|não tenho contrato|nao tenho contrato|nunca.*life)/i.test(value);
}

function isValidPhone(value: string): boolean {
  return value.replace(/\D/g, '').length >= 10;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function commercialFieldFromLabel(label: string): CommercialContextField | undefined {
  const aliases: Record<string, CommercialContextField> = {
    local: 'location', cidade: 'location', nome: 'contactName', contato: 'contactName',
    empresa: 'company', cnpj: 'cnpj', telefone: 'contactPhone', celular: 'contactPhone',
    email: 'email', 'e-mail': 'email', prazo: 'timeline', necessidade: 'need',
  };
  return aliases[label.trim().toLocaleLowerCase('pt-BR')];
}
