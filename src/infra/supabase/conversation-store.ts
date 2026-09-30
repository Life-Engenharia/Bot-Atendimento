import { IncomingMessage } from '../../modules/webhook/application/webhook-processor.js';
import type {
  OperationalConfigurationStore,
  OperationalSetting,
} from '../../modules/internal_operations/application/administrative-menu-service.js';

export type StoredConversation = {
  id: string;
  state: 'started' | 'consent' | 'route' | 'collecting' | 'review' | 'queued' | 'human' | 'closed';
  route: 'commercial' | 'technical' | 'human' | null;
  context: { service?: string };
};

type Contact = { id: string };
type StoredMessage = { id: string };

export class SupabaseConversationStore implements OperationalConfigurationStore {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
  ) {}

  async acceptInbound(
    message: IncomingMessage,
  ): Promise<{ conversation: StoredConversation } | undefined> {
    const inserted = await this.request<StoredMessage[]>(
      'messages',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          meta_message_id: message.id,
          direction: 'inbound',
          content: message.text ?? null,
        }),
      },
      [200, 201],
    );
    if (!inserted) return undefined;

    const contact = await this.upsertContact(message.from);
    const conversation = await this.findOrCreateConversation(contact.id);
    await this.request(
      'messages?id=eq.' + encodeURIComponent(inserted[0].id),
      {
        method: 'PATCH',
        body: JSON.stringify({ conversation_id: conversation.id }),
      },
      [204],
    );
    await this.audit('webhook.message_received', 'meta', {
      messageId: message.id,
      from: message.from,
      hasText: Boolean(message.text),
    });
    return { conversation };
  }

  async saveConversation(conversation: StoredConversation): Promise<void> {
    await this.request(
      'conversations?id=eq.' + encodeURIComponent(conversation.id),
      {
        method: 'PATCH',
        body: JSON.stringify({
          state: conversation.state,
          route: conversation.route,
          context: conversation.context,
        }),
      },
      [204],
    );
  }

  async saveOutbound(conversationId: string, text: string): Promise<void> {
    await this.request(
      'messages',
      {
        method: 'POST',
        body: JSON.stringify({
          meta_message_id: `local-outbound:${crypto.randomUUID()}`,
          conversation_id: conversationId,
          direction: 'outbound',
          content: text,
          delivery_status: 'pending_meta_connection',
        }),
      },
      [201],
    );
  }

  async audit(eventType: string, actor: string, payload: Record<string, unknown>): Promise<void> {
    await this.request(
      'audit_events',
      { method: 'POST', body: JSON.stringify({ event_type: eventType, actor, payload }) },
      [201],
    );
  }

  async appendSetting(setting: OperationalSetting, actor: string): Promise<void> {
    const existing = await this.request<Array<{ value: Record<string, string>[] }>>(
      `operational_settings?key=eq.${encodeURIComponent(setting.key)}&select=value`,
      {},
      [200],
    );
    const values = [...(existing[0]?.value ?? []), setting.value];
    await this.request(
      `operational_settings?on_conflict=key`,
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          key: setting.key,
          value: values,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        }),
      },
      [200, 201],
    );
    await this.audit('configuration.updated', actor, { key: setting.key, value: setting.value });
  }

  async recordHandoff(
    conversation: StoredConversation,
    reason: string,
    initiatedBy: string,
  ): Promise<void> {
    await this.request(
      'handoffs',
      {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversation.id,
          reason,
          source_route: conversation.route,
          destination_area: 'human',
          initiated_by: initiatedBy,
        }),
      },
      [201],
    );
  }

  private async upsertContact(phone: string): Promise<Contact> {
    const contacts = await this.request<Contact[]>(
      'contacts?on_conflict=phone_e164',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ phone_e164: phone }),
      },
      [200, 201],
    );
    return contacts[0];
  }

  private async findOrCreateConversation(contactId: string): Promise<StoredConversation> {
    const existing = await this.request<StoredConversation[]>(
      `conversations?contact_id=eq.${encodeURIComponent(contactId)}&state=not.in.(closed)&select=id,state,route,context`,
      {},
      [200],
    );
    if (existing.length > 0) return existing[0];

    const created = await this.request<StoredConversation[]>(
      'conversations',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ contact_id: contactId, state: 'consent', context: {} }),
      },
      [201],
    );
    return created[0];
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit,
    success: number[],
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.serviceKey);
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    const response = await fetch(new URL(`/rest/v1/${path}`, this.url), {
      ...init,
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 409) return undefined as T;
    if (!success.includes(response.status))
      throw new Error(`Supabase request failed (${response.status}).`);
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }
}
