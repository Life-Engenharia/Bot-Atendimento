import { IncomingMessage } from '../../modules/webhook/application/webhook-processor.js';

export type StoredConversation = {
  id: string;
  state: 'started' | 'consent' | 'route' | 'collecting' | 'review' | 'queued' | 'human' | 'closed';
  route: 'commercial' | 'technical' | 'human' | null;
  context: { service?: string };
};

type Contact = { id: string };
type StoredMessage = { id: string };

export class SupabaseConversationStore {
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
