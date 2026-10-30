import { describe, expect, it } from 'vitest';
import {
  isValidCnpjOrCpf,
  PersistedMenuService,
} from '../../src/modules/conversations/application/persisted-menu-service.js';
import { commercialServiceByOption } from '../../src/modules/commercial/domain/commercial-services.js';
import {
  SupabaseConversationStore,
  StoredConversation,
} from '../../src/infra/supabase/conversation-store.js';

class FakeStore {
  private readonly received = new Set<string>();
  readonly audits: string[] = [];
  readonly outbound: string[] = [];
  readonly handoffs: string[] = [];
  readonly protocols: string[] = [];
  conversation: StoredConversation = {
    id: 'conversation-1',
    state: 'consent',
    route: null,
    context: {},
  };

  async acceptInbound(message: { id: string }) {
    if (this.received.has(message.id)) return undefined;
    this.received.add(message.id);
    return { conversation: this.conversation };
  }
  async saveConversation(conversation: StoredConversation) {
    this.conversation = { ...conversation };
  }
  async saveConversationAndMarkInbound(conversation: StoredConversation) {
    this.conversation = { ...conversation };
  }
  async markInboundProcessed() { }
  async saveOutbound(_conversationId: string, text: string) {
    this.outbound.push(text);
  }
  async audit(eventType: string) {
    this.audits.push(eventType);
  }
  async recordHandoff(_conversation: StoredConversation, reason: string) {
    this.handoffs.push(reason);
  }
  async createCommercialProtocol(_conversation: StoredConversation) {
    this.protocols.push('LFE-TEST-0001');
    return 'LFE-TEST-0001';
  }
  async createTechnicalProtocol(_conversation: StoredConversation) {
    this.protocols.push('LFE-TEST-TECH-0001');
    return 'LFE-TEST-TECH-0001';
  }
}

describe('persisted menu service', () => {
  it('persists a conversation transition and ignores a repeated Meta message', async () => {
    const store = new FakeStore();
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const first = await service.process([{ id: 'wamid-1', from: '+5511999999999', text: 'Olá' }]);
    const accepted = await service.process([{ id: 'wamid-2', from: '+5511999999999', text: '1' }]);
    const repeated = await service.process([{ id: 'wamid-2', from: '+5511999999999', text: '1' }]);

    expect(first.responses[0]).toMatchObject({ state: 'CONSENT' });
    expect(accepted.responses[0]).toMatchObject({ state: 'ROUTE' });
    expect(store.conversation.state).toBe('route');
    expect(store.audits).toContain('menu.consent_accepted');
    expect(store.outbound).toHaveLength(2);
    expect(repeated).toMatchObject({ processed: 0, duplicates: 1, responses: [] });
  });

  it('suggests technical routing from the initial message only after consent', async () => {
    for (const [index, initialMessage] of [
      'Meu chiller apagou',
      'Meu ar não funciona',
      'Minha CompoGuard queimou',
    ].entries()) {
      const store = new FakeStore();
      const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

      const first = await service.process([
        { id: `wamid-intent-${index}-1`, from: '+5511999999999', text: initialMessage },
      ]);
      const consent = await service.process([
        { id: `wamid-intent-${index}-2`, from: '+5511999999999', text: '1' },
      ]);
      const accepted = await service.process([
        { id: `wamid-intent-${index}-3`, from: '+5511999999999', text: 'sim' },
      ]);

      expect(first.responses[0].text).toContain('apoio técnico');
      expect(consent.responses[0].text).toContain('assistência técnica');
      expect(accepted.responses[0].text).toContain('qual é o seu nome');
      expect(store.conversation).toMatchObject({ state: 'collecting', route: 'technical' });
    }
  });

  it('transfers an unclassified route to a human queue', async () => {
    const store = new FakeStore();
    store.conversation = { ...store.conversation, state: 'route' };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-unknown', from: '+5511999999999', text: 'xyz' },
    ]);

    expect(result.responses[0]).toMatchObject({ state: 'HANDOFF_HUMANO' });
    expect(store.handoffs).toContain('classification_unresolved');
  });

  it('accepts /reiniciar as a restart command', async () => {
    const store = new FakeStore();
    store.conversation = { ...store.conversation, state: 'collecting', route: 'commercial' };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-restart-with-slash', from: '+5511999999999', text: '/reiniciar' },
    ]);

    expect(store.conversation).toMatchObject({ state: 'consent', route: null, context: {} });
    expect(result.responses[0].text).toContain('Podemos continuar?');
  });

  it('uses a high-confidence AI classification only when the menu cannot classify the request', async () => {
    const store = new FakeStore();
    store.conversation = { ...store.conversation, state: 'route' };
    const service = new PersistedMenuService(
      store as unknown as SupabaseConversationStore,
      undefined,
      { classify: async () => ({ route: 'commercial', confidence: 0.91 }) },
    );

    const result = await service.process([
      { id: 'wamid-ai', from: '+5511999999999', text: 'Tenho interesse no contrato anual' },
    ]);

    expect(result.responses[0]).toMatchObject({ state: 'COMMERCIAL_SERVICE_MENU' });
    expect(store.audits).toContain('menu.ai_commercial_selected');
  });

  it('collects commercial details, presents a review and creates one local protocol after confirmation', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'commercial',
      context: { service: 'PMOC' },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);
    const messages = [
      'São Paulo - Unidade Norte',
      'Ana Silva',
      '11222333000181',
      'Clínica Alfa',
      '5511999999999',
      'ana@clinicaalfa.com.br',
      'até 7 dias',
      'Preciso revisar o plano mensal.',
      'CONFIRMAR',
    ];

    for (const [index, text] of messages.entries())
      await service.process([{ id: `wamid-commercial-${index}`, from: '+5511999999999', text }]);

    expect(store.conversation.state).toBe('closed');
    expect(store.protocols).toEqual(['LFE-TEST-0001']);
    expect(store.outbound.at(-1)).toContain('LFE-TEST-0001');

    const repeatedConfirmation = await service.process([
      { id: 'wamid-commercial-confirm-repeat', from: '+5511999999999', text: 'CONFIRMAR' },
    ]);
    expect(store.protocols).toEqual(['LFE-TEST-0001']);
    expect(repeatedConfirmation.responses[0].text).toContain('já foi confirmada');
  });

  it('recognizes natural-language service choices as well as all ten numbered options', async () => {
    expect(commercialServiceByOption('10')).toBe('Outro serviço');
    expect(commercialServiceByOption('Quero limpeza de dutos, por favor')).toBe(
      'Limpeza de dutos',
    );

    const store = new FakeStore();
    store.conversation = { ...store.conversation, state: 'collecting', route: 'commercial' };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);
    const result = await service.process([
      {
        id: 'wamid-commercial-natural-service',
        from: '+5511999999999',
        text: 'Quero limpeza de dutos, por favor',
      },
    ]);

    expect(store.conversation.context.service).toBe('Limpeza de dutos');
    expect(result.responses[0].text).toContain('cidade e unidade');
  });

  it('asks for the actual service when the customer chooses outro serviço', async () => {
    const store = new FakeStore();
    store.conversation = { ...store.conversation, state: 'collecting', route: 'commercial' };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const selected = await service.process([
      { id: 'wamid-commercial-other-service', from: '+5511999999999', text: '10' },
    ]);
    expect(selected.responses[0].text).toContain('Qual outro serviço você procura');
    expect(store.conversation.context.awaitingCustomService).toBe(true);

    const described = await service.process([
      {
        id: 'wamid-commercial-other-service-description',
        from: '+5511999999999',
        text: 'Instalação de automação predial',
      },
    ]);
    expect(store.conversation.context.customService).toBe('Instalação de automação predial');
    expect(store.conversation.context.awaitingCustomService).toBeUndefined();
    expect(described.responses[0].text).toContain('cidade e unidade');
  });

  it('stores a skipped email as not informed instead of the literal word “pular”', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'commercial',
      context: {
        service: 'PMOC',
        location: 'Unidade Norte',
        contactName: 'Ana Silva',
        company: 'Clínica Alfa',
        cnpj: '11222333000181',
        contactPhone: '5511999999999',
      },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-skip-email', from: '+5511999999999', text: 'pular' },
    ]);

    expect(store.conversation.context.email).toBe('não informado');
    expect(result.responses[0].text).toContain('prazo desejado');
  });

  it('preserves the technical context and routes a customer without Life history to assistance avulsa', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: { contactName: 'Ana', company: 'Clínica Alfa', location: 'Unidade Norte' },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-no-contract', from: '+5511999999999', text: 'não tenho contrato' },
    ]);

    expect(store.conversation).toMatchObject({
      route: 'technical',
      context: { service: 'Assistência avulsa', location: 'Unidade Norte' },
    });
    expect(result.responses[0].text).toContain('assistência técnica avulsa');
    expect(store.audits).toContain('technical.assistance_avulsa_routed');
  });

  it('accepts "não sei" during the Life history check and continues the flow', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: { contactName: 'Ana', company: 'Clínica Alfa', location: 'Unidade Norte' },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    await service.process([{ id: 'wamid-unknown-history', from: '+5511999999999', text: 'não sei' }]);

    expect(store.conversation.route).toBe('technical');
    expect(store.conversation.context.service).toBe('Assistência avulsa');
  });

  it('accepts an intermittent-frequency answer and advances technical triage', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: {
        contactName: 'Ana',
        company: 'Clínica Alfa',
        location: 'Unidade Norte',
        contractReference: 'não sei',
        equipment: 'Chiller',
        manufacturerModel: 'não identificado',
        assetIdentifier: 'não identificado',
        symptom: 'O equipamento falha',
        alarm: 'não informado',
      },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-tech-frequency', from: '+5511999999999', text: 'Intermitente' },
    ]);

    expect(store.conversation.context.startedFrequency).toBe('Intermitente');
    expect(result.responses[0].text).toContain('equipamento está totalmente parado');
  });

  it('keeps technical impact button titles within the Meta 20-character limit', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: {
        contactName: 'Ana', company: 'Clínica Alfa', location: 'Unidade Norte',
        contractReference: 'não sei', equipment: 'Chiller', manufacturerModel: 'Modelo X',
        assetIdentifier: 'A-1', symptom: 'Falha', alarm: 'não informado',
      },
    };
    const titles: string[] = [];
    const service = new PersistedMenuService(
      store as unknown as SupabaseConversationStore,
      undefined,
      undefined,
      {
        sendText: async () => ({ messageId: 'outbound-text' }),
        sendButtons: async (_to, _body, buttons) => {
          titles.push(...buttons.map((button) => button.title));
          return { messageId: 'outbound-buttons' };
        },
      },
    );

    await service.process([{ id: 'wamid-frequency', from: '+5511999999999', text: 'hoje' }]);

    expect(titles).toEqual(['Totalmente parado', 'Parcialmente ativo', 'Funcionando']);
    expect(titles.every((title) => [...title].length <= 20)).toBe(true);
  });

  it('does not reset a conversation already assigned to a human team', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'human',
      route: 'human',
      assignedOperator: 'Ana Operadora',
      context: { initialIntent: 'Preciso de assistência' },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-menu-after-handoff', from: '+5511999999999', text: 'menu' },
    ]);

    expect(store.conversation).toMatchObject({
      state: 'human',
      route: 'human',
      assignedOperator: 'Ana Operadora',
      context: { initialIntent: 'Preciso de assistência' },
    });
    expect(result.responses[0].text).toContain('não pode ser reiniciado');
  });

  it('allows a queued conversation without an operator to start a fresh triage', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'queued',
      route: 'commercial',
      assignedOperator: null,
      context: { service: 'PMOC' },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-restart-queued', from: '+5511999999999', text: '/reiniciar' },
    ]);

    expect(store.conversation).toMatchObject({ state: 'consent', route: null, context: {} });
    expect(result.responses[0].text).toContain('Podemos continuar?');
  });

  it('routes an unrecognized technical-review correction to the field picker instead of looping', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'review',
      route: 'technical',
      context: {
        contactName: 'Ana', company: 'Hospital Alfa', location: 'UTI',
        contractReference: '123', equipment: 'Chiller', manufacturerModel: 'Modelo X',
        assetIdentifier: 'A-1', symptom: 'Falha', alarm: 'E3', startedFrequency: 'Hoje',
        operationalImpact: 'Totalmente parado', contingency: 'não', reportedRisk: 'não',
      },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-technical-review-correction', from: '+5511999999999', text: 'o alarme correto é E4' },
    ]);

    expect(store.conversation.state).toBe('collecting');
    expect(store.conversation.context.selectingTechnicalEditField).toBe(true);
    expect(result.responses[0].text).toContain('Escolha o dado na lista');
  });

  it('rejects unclear impact answers and assigns priority P2 when risk is unknown', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: {
        contactName: 'Ana', company: 'Hospital Alfa', location: 'UTI',
        contractReference: '123', equipment: 'Chiller', manufacturerModel: 'Modelo X',
        assetIdentifier: 'A-1', symptom: 'Falha', alarm: 'não informado', startedFrequency: 'Hoje',
      },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);
    const invalid = await service.process([
      { id: 'wamid-impact-invalid', from: '+5511999999999', text: 'mais ou menos' },
    ]);
    expect(store.conversation.context.operationalImpact).toBeUndefined();
    expect(invalid.responses[0].text).toContain('ou NÃO SEI');

    Object.assign(store.conversation.context, {
      operationalImpact: 'funcionando',
      contingency: 'sim',
    });
    const unknownRisk = await service.process([
      { id: 'wamid-risk-unknown', from: '+5511999999999', text: 'não sei' },
    ]);
    expect(store.conversation.context.reportedRisk).toBe('não sei');
    expect(unknownRisk.responses[0].text).toContain('Prioridade sugerida: P2');
  });

  it('asks for technical confirmation and prioritizes critical stoppage without contingency as P1', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: {
        contactName: 'Ana',
        company: 'Hospital Alfa',
        location: 'UTI',
        contractReference: '123',
        equipment: 'Chiller',
        manufacturerModel: 'Modelo X',
        assetIdentifier: 'A-1',
        symptom: 'apagou de vez',
        alarm: 'E3',
        startedFrequency: 'Hoje',
        operationalImpact: 'parado totalmente',
        contingency: 'não há alternativa',
      },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const review = await service.process([
      { id: 'wamid-tech-review', from: '+5511999999999', text: 'há risco para pessoas' },
    ]);
    expect(review.responses[0].text).toContain('Prioridade sugerida: P1');
    expect(store.conversation.state).toBe('review');

    const confirmation = await service.process([
      { id: 'wamid-tech-confirm', from: '+5511999999999', text: 'CONFIRMAR' },
    ]);
    expect(confirmation.responses[0].text).toContain('LFE-TEST-TECH-0001');
    expect(store.conversation.state).toBe('queued');
  });

  it('interprets risk and contingency buttons semantically when calculating priority', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: {
        contactName: 'Ana',
        company: 'Hospital Alfa',
        location: 'UTI',
        contractReference: '123',
        equipment: 'Chiller',
        manufacturerModel: 'Modelo X',
        assetIdentifier: 'A-1',
        symptom: 'Falha no equipamento',
        alarm: 'Não informado',
        startedFrequency: 'Hoje',
        operationalImpact: 'Totalmente parado',
        contingency: 'Não',
      },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      {
        id: 'wamid-risk-button',
        from: '+5511999999999',
        interactiveId: 'answer_yes',
      },
    ]);

    expect(result.responses[0].text).toContain('Prioridade sugerida: P1');
    expect(store.conversation.context.reportedRisk).toBe('sim');
  });

  it('does not mistake an explicit no-risk response for a critical risk', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: {
        contactName: 'Ana',
        company: 'Clínica Alfa',
        location: 'Unidade Norte',
        contractReference: '123',
        equipment: 'Chiller',
        manufacturerModel: 'Modelo X',
        assetIdentifier: 'A-1',
        symptom: 'Oscilação leve',
        alarm: 'Não informado',
        startedFrequency: 'Intermitente',
        operationalImpact: 'Funcionando',
        contingency: 'Existe equipamento alternativo',
      },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-no-risk', from: '+5511999999999', interactiveId: 'answer_no' },
    ]);

    expect(result.responses[0].text).toContain('Prioridade sugerida: P3');
    expect(store.conversation.context.reportedRisk).toBe('não');
  });

  it('allows correcting every technical field without exceeding WhatsApp list limits', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'review',
      route: 'technical',
      context: {
        contactName: 'Ana',
        company: 'Hospital Alfa',
        location: 'UTI',
        contractReference: '123',
        equipment: 'Chiller',
        manufacturerModel: 'Modelo X',
        assetIdentifier: 'A-1',
        symptom: 'Falha',
        alarm: 'E3',
        startedFrequency: 'Hoje',
        operationalImpact: 'Parcialmente operante',
        contingency: 'Sim',
        reportedRisk: 'Não',
      },
    };
    const lists: Array<Array<{ id: string; title: string }>> = [];
    const service = new PersistedMenuService(
      store as unknown as SupabaseConversationStore,
      undefined,
      undefined,
      {
        sendText: async () => ({ messageId: 'outbound-text' }),
        sendList: async (_to, _body, _button, rows) => {
          lists.push(rows);
          return { messageId: `outbound-list-${lists.length}` };
        },
      },
    );

    await service.process([{ id: 'wamid-edit-open', from: '+5511999999999', text: 'editar' }]);
    await service.process([
      { id: 'wamid-edit-more', from: '+5511999999999', interactiveId: 'tech_edit_more' },
    ]);
    await service.process([
      { id: 'wamid-edit-frequency', from: '+5511999999999', interactiveId: 'tech_edit_frequency' },
    ]);

    expect(lists.map((rows) => rows.length)).toEqual([10, 4]);
    expect(store.conversation.context.editingTechnicalField).toBe('startedFrequency');
    expect(store.outbound.at(-1)).toContain('Quando começou');
  });

  it('validates CPF/CNPJ check digits and accepts the Receita alphanumeric CNPJ format', () => {
    expect(isValidCnpjOrCpf('529.982.247-25')).toBe(true);
    expect(isValidCnpjOrCpf('529.982.247-24')).toBe(false);
    expect(isValidCnpjOrCpf('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpjOrCpf('11.222.333/0001-00')).toBe(false);
    expect(isValidCnpjOrCpf('00.000.000/E08G-12')).toBe(true);
  });

  it('responds warmly after a queued customer thanks the team', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'queued',
      route: 'commercial',
      context: { service: 'PMOC' },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([
      { id: 'wamid-thanks', from: '+5511999999999', text: 'Muito obrigado!' },
    ]);

    expect(result.responses[0].text).toContain('Por nada');
  });

  it('sends and audits the outbound response when an official Meta sender is configured', async () => {
    const store = new FakeStore();
    const sent: string[] = [];
    const service = new PersistedMenuService(
      store as unknown as SupabaseConversationStore,
      undefined,
      undefined,
      {
        sendText: async (_to, body) => {
          sent.push(body);
          return { messageId: 'wamid.outbound-1' };
        },
      },
    );

    await service.process([{ id: 'wamid-send-1', from: '5511999999999', text: 'Olá' }]);

    expect(sent).toHaveLength(1);
    expect(store.outbound).toHaveLength(1);
    expect(store.audits).toContain('meta.outbound_sent');
  });

  it('does not resend an outbound message after an ambiguous Meta/network failure', async () => {
    const store = new FakeStore();
    let sendAttempts = 0;
    const service = new PersistedMenuService(
      store as unknown as SupabaseConversationStore,
      undefined,
      undefined,
      {
        sendText: async () => {
          sendAttempts += 1;
          throw new Error('socket closed after request was sent');
        },
      },
    );

    await service.process([{ id: 'wamid-ambiguous-send', from: '+5511999999999', text: 'Olá' }]);

    expect(sendAttempts).toBe(1);
    expect(store.audits).toContain('meta.outbound_failed');
  });
});
