import { describe, expect, it } from 'vitest';
import { PersistedMenuService } from '../../src/modules/conversations/application/persisted-menu-service.js';
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

      const first = await service.process([{ id: `wamid-intent-${index}-1`, from: '+5511999999999', text: initialMessage }]);
      const consent = await service.process([{ id: `wamid-intent-${index}-2`, from: '+5511999999999', text: '1' }]);
      const accepted = await service.process([{ id: `wamid-intent-${index}-3`, from: '+5511999999999', text: 'sim' }]);

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
      'Clínica Alfa',
      '12345678000199',
      '5511999999999',
      'ana@clinicaalfa.com.br',
      'até 7 dias',
      'Preciso revisar o plano mensal.',
      'CONFIRMAR',
    ];

    for (const [index, text] of messages.entries())
      await service.process([{ id: `wamid-commercial-${index}`, from: '+5511999999999', text }]);

    expect(store.conversation.state).toBe('queued');
    expect(store.protocols).toEqual(['LFE-TEST-0001']);
    expect(store.outbound.at(-1)).toContain('LFE-TEST-0001');
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

    expect(store.conversation).toMatchObject({ route: 'commercial', context: { service: 'Assistência avulsa', location: 'Unidade Norte' } });
    expect(result.responses[0].text).toContain('assistência avulsa');
    expect(store.audits).toContain('technical.assistance_avulsa_routed');
  });

  it('asks for technical confirmation and prioritizes critical stoppage without contingency as P1', async () => {
    const store = new FakeStore();
    store.conversation = {
      ...store.conversation,
      state: 'collecting',
      route: 'technical',
      context: {
        contactName: 'Ana', company: 'Hospital Alfa', location: 'UTI', contractReference: '123',
        equipment: 'Chiller', manufacturerModel: 'Modelo X', assetIdentifier: 'A-1', symptom: 'apagou de vez',
        alarm: 'E3', startedFrequency: 'Hoje', operationalImpact: 'parado totalmente', contingency: 'não há alternativa',
      },
    };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const review = await service.process([{ id: 'wamid-tech-review', from: '+5511999999999', text: 'há risco para pessoas' }]);
    expect(review.responses[0].text).toContain('Prioridade sugerida: P1');
    expect(store.conversation.state).toBe('review');

    const confirmation = await service.process([{ id: 'wamid-tech-confirm', from: '+5511999999999', text: 'CONFIRMAR' }]);
    expect(confirmation.responses[0].text).toContain('LFE-TEST-TECH-0001');
    expect(store.conversation.state).toBe('queued');
  });

  it('responds warmly after a queued customer thanks the team', async () => {
    const store = new FakeStore();
    store.conversation = { ...store.conversation, state: 'queued', route: 'commercial', context: { service: 'PMOC' } };
    const service = new PersistedMenuService(store as unknown as SupabaseConversationStore);

    const result = await service.process([{ id: 'wamid-thanks', from: '+5511999999999', text: 'Muito obrigado!' }]);

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
});
