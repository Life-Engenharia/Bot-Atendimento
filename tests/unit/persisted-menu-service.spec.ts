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
});
