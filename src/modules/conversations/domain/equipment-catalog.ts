export type EquipmentDomain = 'hvac' | 'hemotherapy';

export type EquipmentMatch = {
  id: string;
  label: string;
  domain: EquipmentDomain;
  family: string;
  aliases: readonly string[];
};

/**
 * Catálogo operacional para reconhecer o vocabulário da Life sem depender de
 * uma chamada externa por mensagem. Ele representa famílias e componentes,
 * não uma alegação de compatibilidade, diagnóstico ou inventário de peças.
 */
export const equipmentCatalog: readonly EquipmentMatch[] = [
  {
    id: 'chiller', label: 'chiller', domain: 'hvac', family: 'refrigeração central',
    aliases: ['chiller', 'resfriador de líquido', 'resfriador de agua', 'resfriador de água'],
  },
  {
    id: 'air-conditioner', label: 'ar-condicionado', domain: 'hvac', family: 'climatização',
    aliases: ['ar condicionado', 'ar-condicionado', 'ar cond', 'split', 'vrf', 'vrv', 'rooftop'],
  },
  {
    id: 'air-handling', label: 'UTA/AHU ou fan coil', domain: 'hvac', family: 'distribuição de ar',
    aliases: ['uta', 'ahu', 'unidade de tratamento de ar', 'fan coil', 'fancoil', 'cassete', 'evaporadora'],
  },
  {
    id: 'cooling-tower', label: 'torre de resfriamento', domain: 'hvac', family: 'rejeição de calor',
    aliases: ['torre de resfriamento', 'torre', 'cooling tower', 'dry cooler'],
  },
  {
    id: 'compressor', label: 'compressor', domain: 'hvac', family: 'circuito frigorífico',
    aliases: ['compressor', 'scroll', 'parafuso', 'screw', 'centrífugo', 'centrifugo', 'pistão', 'pistao'],
  },
  {
    id: 'condenser', label: 'condensador', domain: 'hvac', family: 'circuito frigorífico',
    aliases: ['condensador', 'serpentina condensadora', 'condensing unit', 'unidade condensadora'],
  },
  {
    id: 'evaporator', label: 'evaporador', domain: 'hvac', family: 'circuito frigorífico',
    aliases: ['evaporador', 'serpentina evaporadora', 'coil', 'serpentina'],
  },
  {
    id: 'expansion-device', label: 'válvula de expansão', domain: 'hvac', family: 'circuito frigorífico',
    aliases: ['válvula de expansão', 'valvula de expansao', 'txv', 'tev', 'capilar', 'dispositivo de expansão'],
  },
  {
    id: 'refrigerant-line', label: 'linha/circuito de refrigerante', domain: 'hvac', family: 'circuito frigorífico',
    aliases: ['gás refrigerante', 'gas refrigerante', 'fluido refrigerante', 'vazamento de gás', 'vazamento de gas', 'linha de sucção', 'linha de descarga', 'linha de líquido'],
  },
  {
    id: 'refrigerant-accessories', label: 'acessório do circuito frigorífico', domain: 'hvac', family: 'circuito frigorífico',
    aliases: ['filtro secador', 'filter drier', 'separador de óleo', 'separador de oleo', 'acumulador', 'receiver', 'reservatório de líquido', 'reservatorio de liquido', 'visor de líquido', 'visor de liquido'],
  },
  {
    id: 'pump', label: 'bomba hidráulica', domain: 'hvac', family: 'circuito de água',
    aliases: ['bomba', 'bomba de água', 'bomba de agua', 'bomba primária', 'bomba primaria', 'bomba secundária', 'bomba secundaria', 'circuladora'],
  },
  {
    id: 'water-circuit', label: 'circuito de água', domain: 'hvac', family: 'circuito de água',
    aliases: ['água gelada', 'agua gelada', 'água de condensação', 'agua de condensacao', 'tubulação', 'tubulacao', 'registro', 'válvula de água', 'valvula de agua'],
  },
  {
    id: 'air-movement', label: 'ventilador/motor de ventilação', domain: 'hvac', family: 'distribuição de ar',
    aliases: ['ventilador', 'hélice', 'helice', 'motor do ventilador', 'exaustor', 'insuflador', 'correia', 'polia'],
  },
  {
    id: 'controls', label: 'controle elétrico/automação', domain: 'hvac', family: 'comando e proteção',
    aliases: ['placa', 'clp', 'inversor', 'vfd', 'soft starter', 'contator', 'relé', 'rele', 'disjuntor', 'fusível', 'fusivel', 'painel elétrico', 'painel eletrico'],
  },
  {
    id: 'chiller-controller', label: 'controladora principal do chiller', domain: 'hvac', family: 'automação do chiller',
    aliases: ['controladora do chiller', 'controlador do chiller', 'placa do chiller', 'placa controladora', 'placa principal', 'main board', 'chiller control board', 'cpu do chiller', 'microprocessador do chiller', 'central de controle'],
  },
  {
    id: 'control-io', label: 'módulo de I/O ou placa de relés', domain: 'hvac', family: 'automação do chiller',
    aliases: ['módulo io', 'modulo io', 'módulo de entrada e saída', 'modulo de entrada e saida', 'placa de relé', 'placa de rele', 'relay output board', 'módulo de expansão', 'modulo de expansao', 'placa de expansão', 'placa de expansao', 'saída digital', 'saida digital', 'entrada analógica', 'entrada analogica'],
  },
  {
    id: 'control-interface', label: 'IHM/display do chiller', domain: 'hvac', family: 'automação do chiller',
    aliases: ['ihm', 'display do chiller', 'tela do chiller', 'teclado do chiller', 'keypad', 'touchscreen', 'interface homem máquina', 'interface homem maquina', 'optiview', 'comfortlink', 'tracer'],
  },
  {
    id: 'control-power', label: 'fonte e alimentação de controle', domain: 'hvac', family: 'automação do chiller',
    aliases: ['fonte da placa', 'fonte 24v', 'fonte 24 v', 'fonte 5v', 'fonte 5 v', 'transformador de comando', 'bateria da placa', 'bateria rtc', 'no break do painel', 'nobreak do painel'],
  },
  {
    id: 'control-communication', label: 'comunicação BMS/automação predial', domain: 'hvac', family: 'automação do chiller',
    aliases: ['bms', 'automação predial', 'automacao predial', 'bacnet', 'modbus', 'lonworks', 'rs485', 'rs 485', 'canbus', 'can bus', 'gateway', 'conversor de protocolo', 'placa de comunicação', 'placa de comunicacao', 'ethernet'],
  },
  {
    id: 'variable-speed-drive', label: 'inversor/drive de frequência', domain: 'hvac', family: 'acionamento elétrico',
    aliases: ['inversor de frequência', 'inversor de frequencia', 'drive de frequência', 'drive de frequencia', 'vfd', 'vsd', 'variador de velocidade', 'soft starter', 'partida suave', 'inversor do compressor', 'inversor da bomba', 'inversor do ventilador'],
  },
  {
    id: 'valve-actuation', label: 'válvula e atuador de controle', domain: 'hvac', family: 'automação do chiller',
    aliases: ['válvula solenoide', 'valvula solenoide', 'solenóide', 'solenoide', 'válvula de controle', 'valvula de controle', 'atuador de válvula', 'atuador de valvula', 'atuador', 'driver de válvula', 'driver de valvula', 'eev', 'válvula eletrônica', 'valvula eletronica'],
  },
  {
    id: 'carel-controller', label: 'controladora Carel pCO', domain: 'hvac', family: 'automação do chiller',
    aliases: ['carel', 'pco', 'pco5', 'pcoxs', 'pco sistema', 'pco system', 'pco controller'],
  },
  {
    id: 'danfoss-controller', label: 'controladora Danfoss', domain: 'hvac', family: 'automação do chiller',
    aliases: ['danfoss', 'mcx', 'mcx15', 'mcx20', 'eke', 'ekc', 'ak pc', 'adap kool', 'adap-kool'],
  },
  {
    id: 'johnson-york-controller', label: 'controladora Johnson Controls/York', domain: 'hvac', family: 'automação do chiller',
    aliases: ['johnson controls', 'york', 'metasys', 'smart equipment control', 'sec controller', 'optiview control center'],
  },
  {
    id: 'sensors', label: 'sensor/instrumentação', domain: 'hvac', family: 'comando e proteção',
    aliases: ['sensor', 'sonda', 'ntc', 'pt100', 'pt1000', 'termostato', 'pressostato', 'transdutor', 'sensor de pressão', 'sensor de pressao', 'sensor de temperatura', 'fluxostato', 'medidor de fluxo', 'transmissor 4-20ma', 'transmissor 4 20ma', 'sensor de nível', 'sensor de nivel', 'chave de fluxo', 'chave de pressão', 'chave de pressao'],
  },
  {
    id: 'air-quality', label: 'filtragem e distribuição de ar', domain: 'hvac', family: 'distribuição de ar',
    aliases: ['filtro de ar', 'filtro hepa', 'duto', 'difusor', 'grelha', 'damper', 'atuador de damper', 'bandeja de dreno', 'dreno'],
  },
  {
    id: 'compoguard', label: 'CompoGuard (Fresenius Kabi)', domain: 'hemotherapy', family: 'coleta de sangue total',
    aliases: ['compoguard', 'compo guard', 'compoguard plus', 'balança misturadora', 'balanca misturadora', 'misturador de sangue', 'coleta de sangue'],
  },
  {
    id: 'compomat', label: 'CompoMat G5 Plus (Fresenius Kabi)', domain: 'hemotherapy', family: 'processamento de hemocomponentes',
    aliases: ['compomat', 'compo mat', 'compomath', 'compomat g5', 'compomat g5 plus'],
  },
  {
    id: 'composeal', label: 'CompoSeal (Fresenius Kabi)', domain: 'hemotherapy', family: 'selagem de tubos',
    aliases: ['composeal', 'compo seal', 'seladora', 'seladora de tubo', 'seladora de bolsa'],
  },
  {
    id: 'compodock', label: 'CompoDock (Fresenius Kabi)', domain: 'hemotherapy', family: 'processamento de hemocomponentes',
    aliases: ['compodock', 'compo dock'],
  },
  {
    id: 'compolab', label: 'CompoLab (Fresenius Kabi)', domain: 'hemotherapy', family: 'processamento de hemocomponentes',
    aliases: ['compolab', 'compo lab'],
  },
  {
    id: 'composelect', label: 'CompoSelect (Fresenius Kabi)', domain: 'hemotherapy', family: 'bolsas e filtração',
    aliases: ['composelect', 'compo select', 'filtro leucorredução', 'filtro leucorreducao'],
  },
  {
    id: 'compostop', label: 'CompoStop (Fresenius Kabi)', domain: 'hemotherapy', family: 'controle de fluxo',
    aliases: ['compostop', 'compo stop', 'clamp de bolsa', 'pinça de bolsa', 'pinca de bolsa'],
  },
  {
    id: 'donation-data', label: 'sistema de dados de doação', domain: 'hemotherapy', family: 'dados e rastreabilidade',
    aliases: ['donationmaster', 'donation master', 'donationmaster net', 'dxt', 'scanner de código de barras', 'scanner de codigo de barras', 'leitor de código de barras', 'leitor de codigo de barras'],
  },
  {
    id: 'blood-bag', label: 'bolsa/sistema de bolsas de sangue', domain: 'hemotherapy', family: 'coleta e processamento',
    aliases: ['bolsa de sangue', 'bolsa', 'hemocomponente', 'sangue total', 'concentrado de hemácias', 'concentrado de hemacias', 'plasma', 'plaqueta', 'buffy coat'],
  },
  {
    id: 'blood-bag-components', label: 'componente de bolsa de sangue', domain: 'hemotherapy', family: 'coleta e processamento',
    aliases: ['tubulação de bolsa', 'tubulacao de bolsa', 'tubo de coleta', 'agulha', 'filtro de bolsa', 'filtro', 'conector', 'quebra fluxo', 'breakaway', 'anticoagulante'],
  },
];

export function identifyEquipment(value?: string): EquipmentMatch | undefined {
  const text = normalize(value);
  return equipmentCatalog
    .flatMap((equipment) => equipment.aliases.map((alias) => ({ equipment, alias: normalize(alias) })))
    .filter(({ alias }) => alias.length > 2 && text.includes(alias))
    .sort((a, b) => b.alias.length - a.alias.length)[0]?.equipment;
}

function normalize(value?: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}
