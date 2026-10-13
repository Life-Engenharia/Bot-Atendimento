import { IncomingMessage } from '../../modules/webhook/application/webhook-processor.js';
import type {
  OperationalConfigurationStore,
  OperationalSetting,
} from '../../modules/internal_operations/application/administrative-menu-service.js';

export type StoredConversation = {
  id: string;
  state: 'started' | 'consent' | 'route' | 'collecting' | 'review' | 'queued' | 'human' | 'closed';
  route: 'commercial' | 'technical' | 'human' | null;
  context: {
    service?: string;
    location?: string;
    contactName?: string;
    company?: string;
    contactPhone?: string;
    timeline?: string;
    need?: string;
    contractReference?: string;
    equipment?: string;
    manufacturerModel?: string;
    assetIdentifier?: string;
    symptom?: string;
    alarm?: string;
    startedFrequency?: string;
    operationalImpact?: string;
    contingency?: string;
    reportedRisk?: string;
  };
};

export type AppRole = 'admin' | 'coordination' | 'commercial' | 'technical' | 'on_call' | 'viewer';
export type AppUser = { id: string; name: string; email: string; passwordHash: string; role: AppRole; area: 'commercial' | 'technical' | 'on_call' | 'coordination'; active: boolean };

type Contact = { id: string };
type StoredMessage = { id: string };

export type OperatorConversation = {
  id: string;
  state: StoredConversation['state'];
  route: StoredConversation['route'];
  assignedOperator: string | null;
  contactPhone: string;
  contactName: string | null;
  updatedAt: string;
  destinationArea?: string | null;
  handoffReason?: string | null;
  suggestedPriority?: 'P1' | 'P2' | 'P3' | 'P4' | null;
  followUpAt?: string | null;
};

export type OperatorConversationDetail = OperatorConversation & {
  messages: Array<{ id: string; direction: 'inbound' | 'outbound'; content: string | null; receivedAt: string }>;
  context: StoredConversation['context'];
  notes: Array<{ id: string; author: string; content: string; createdAt: string }>;
};

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

  async saveOutbound(
    conversationId: string,
    text: string,
    delivery?: { messageId: string; status: 'sent' | 'failed' },
  ): Promise<void> {
    await this.request(
      'messages',
      {
        method: 'POST',
        body: JSON.stringify({
          meta_message_id: delivery?.messageId ?? `local-outbound:${crypto.randomUUID()}`,
          conversation_id: conversationId,
          direction: 'outbound',
          content: text,
          delivery_status: delivery?.status ?? 'pending_meta_connection',
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
    await this.replaceSetting(setting.key, [...(existing[0]?.value ?? []), setting.value], actor);
  }

  async listSettings(): Promise<OperationalSetting[]> {
    const settings = await this.request<
      Array<{ key: OperationalSetting['key']; value: Record<string, string>[] }>
    >('operational_settings?select=key,value&order=key', {}, [200]);
    return settings.flatMap((setting) =>
      setting.value.map((value) => ({ key: setting.key, value })),
    );
  }

  async replaceSetting(
    key: OperationalSetting['key'],
    values: Record<string, string>[],
    actor: string,
  ): Promise<void> {
    await this.request(
      'operational_settings?on_conflict=key',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          key,
          value: values,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        }),
      },
      [200, 201],
    );
    await this.audit('configuration.updated', actor, {
      key,
      value: values,
      source: actor === 'admin-dashboard' ? 'dashboard' : 'whatsapp',
    });
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

  async createCommercialProtocol(conversation: StoredConversation): Promise<string> {
    const context = conversation.context;
    if (!context.service || !context.location || !context.timeline || !context.need)
      throw new Error('A solicitação comercial não possui todos os dados obrigatórios.');
    const reference = `LFE-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const protocols = await this.request<Array<{ id: string }>>(
      'protocols',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ reference, type: 'commercial', status: 'new' }),
      },
      [201],
    );
    const protocolId = protocols[0]?.id;
    if (!protocolId) throw new Error('O Supabase não retornou o protocolo comercial criado.');
    await this.request(
      'commercial_requests',
      {
        method: 'POST',
        body: JSON.stringify({
          protocol_id: protocolId,
          service: context.service,
          location: context.location,
          timeline: context.timeline,
          need: context.need,
        }),
      },
      [201],
    );
    const assignee = await this.findEligibleUser('commercial');
    await this.request(
      `conversations?id=eq.${encodeURIComponent(conversation.id)}`,
      { method: 'PATCH', body: JSON.stringify({ protocol_id: protocolId, state: 'queued', destination_area: 'commercial', assigned_user_id: assignee?.id ?? null, handoff_reason: 'commercial_protocol' }) },
      [204],
    );
    await this.audit('commercial.protocol_queued', 'customer', {
      protocolId,
      reference,
      route: 'commercial', assignedUserId: assignee?.id,
    });
    return reference;
  }

  async createTechnicalProtocol(
    conversation: StoredConversation,
    priority: 'P1' | 'P2' | 'P3' | 'P4',
    reason: string,
  ): Promise<string> {
    const context = conversation.context;
    const required = ['equipment', 'manufacturerModel', 'symptom', 'startedFrequency', 'operationalImpact', 'contingency', 'reportedRisk'] as const;
    if (required.some((field) => !context[field])) throw new Error('A pré-triagem técnica ainda está incompleta.');
    const reference = `LFE-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const protocols = await this.request<Array<{ id: string }>>('protocols', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ reference, type: 'technical', status: 'new', suggested_priority: priority }) }, [201]);
    const protocolId = protocols[0]?.id;
    if (!protocolId) throw new Error('O Supabase não retornou o protocolo técnico criado.');
    await this.request('technical_tickets', { method: 'POST', body: JSON.stringify({ protocol_id: protocolId, contract_reference: context.contractReference ?? null, equipment: context.equipment, manufacturer_model: context.manufacturerModel, asset_identifier: context.assetIdentifier ?? null, symptom: context.symptom, alarm: context.alarm ?? null, started_frequency: context.startedFrequency, operational_impact: context.operationalImpact, contingency: context.contingency, reported_risk: context.reportedRisk, priority_reason: reason }) }, [201]);
    const destination = priority === 'P1' || priority === 'P2' ? 'on_call' : 'technical';
    const assignee = await this.findEligibleUser(destination);
    await this.request(`conversations?id=eq.${encodeURIComponent(conversation.id)}`, { method: 'PATCH', body: JSON.stringify({ protocol_id: protocolId, state: 'queued', destination_area: destination, assigned_user_id: assignee?.id ?? null, handoff_reason: `priority_${priority}` }) }, [204]);
    await this.audit('technical.protocol_queued', 'system', { protocolId, reference, priority, destination, assignedUserId: assignee?.id });
    return reference;
  }

  async listUsers(): Promise<AppUser[]> {
    const rows = await this.request<Array<{ id: string; name: string; email: string; password_hash: string; role: AppRole; area: AppUser['area']; active: boolean }>>('app_users?select=id,name,email,password_hash,role,area,active&order=name.asc', {}, [200]);
    return rows.map((row) => ({ id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, role: row.role, area: row.area, active: row.active }));
  }

  async createUser(user: Omit<AppUser, 'id'>): Promise<void> {
    await this.request('app_users', { method: 'POST', body: JSON.stringify({ name: user.name, email: user.email.toLowerCase(), password_hash: user.passwordHash, role: user.role, area: user.area, active: user.active }) }, [201]);
    await this.audit('user.created', 'admin-dashboard', { email: user.email, role: user.role, area: user.area });
  }

  async updateUser(id: string, update: Pick<AppUser, 'role' | 'area' | 'active'>): Promise<void> {
    await this.request(`app_users?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ role: update.role, area: update.area, active: update.active }) }, [204]);
    await this.audit('user.updated', 'admin-dashboard', { id, ...update });
  }

  async findUserByEmail(email: string): Promise<AppUser | undefined> {
    const users = await this.request<Array<{ id: string; name: string; email: string; password_hash: string; role: AppRole; area: AppUser['area']; active: boolean }>>(`app_users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id,name,email,password_hash,role,area,active`, {}, [200]);
    const row = users[0];
    return row ? { id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash, role: row.role, area: row.area, active: row.active } : undefined;
  }

  async listOperatorConversations(areas?: string[]): Promise<OperatorConversation[]> {
    const areaFilter = areas?.length ? `&destination_area=in.(${areas.map(encodeURIComponent).join(',')})` : '';
    const rows = await this.request<
      Array<{
        id: string; state: OperatorConversation['state']; route: OperatorConversation['route'];
        assigned_operator: string | null; destination_area: string | null; handoff_reason: string | null; updated_at: string; follow_up_at: string | null;
        protocols: { suggested_priority: OperatorConversation['suggestedPriority'] } | null;
        contacts: { phone_e164: string; name: string | null } | null;
      }>
    >(`conversations?state=in.(queued,human)${areaFilter}&select=id,state,route,assigned_operator,destination_area,handoff_reason,updated_at,follow_up_at,contacts(phone_e164,name),protocols(suggested_priority)&order=updated_at.desc`, {}, [200]);
    return rows.map((row) => ({
      id: row.id, state: row.state, route: row.route, assignedOperator: row.assigned_operator,
      contactPhone: row.contacts?.phone_e164 ?? 'Contato indisponível', contactName: row.contacts?.name ?? null,
      updatedAt: row.updated_at, destinationArea: row.destination_area, handoffReason: row.handoff_reason, suggestedPriority: row.protocols?.suggested_priority ?? null, followUpAt: row.follow_up_at,
    }));
  }

  async getOperatorConversation(id: string): Promise<OperatorConversationDetail | undefined> {
    const conversations = await this.request<Array<{
      id: string; state: OperatorConversation['state']; route: OperatorConversation['route']; assigned_operator: string | null;
      updated_at: string; destination_area: string | null; handoff_reason: string | null; follow_up_at: string | null; context: StoredConversation['context']; protocols: { suggested_priority: OperatorConversation['suggestedPriority'] } | null; contacts: { phone_e164: string; name: string | null } | null;
    }>>(`conversations?id=eq.${encodeURIComponent(id)}&select=id,state,route,assigned_operator,destination_area,handoff_reason,updated_at,follow_up_at,context,contacts(phone_e164,name),protocols(suggested_priority)`, {}, [200]);
    const row = conversations[0];
    if (!row) return undefined;
    const messages = await this.request<Array<{ id: string; direction: 'inbound' | 'outbound'; content: string | null; received_at: string }>>(
      `messages?conversation_id=eq.${encodeURIComponent(id)}&select=id,direction,content,received_at&order=received_at.asc`, {}, [200],
    );
    const notes = await this.request<Array<{ id: string; author: string; content: string; created_at: string }>>(
      `operator_notes?conversation_id=eq.${encodeURIComponent(id)}&select=id,author,content,created_at&order=created_at.desc`, {}, [200],
    );
    return {
      id: row.id, state: row.state, route: row.route, assignedOperator: row.assigned_operator,
      contactPhone: row.contacts?.phone_e164 ?? 'Contato indisponível', contactName: row.contacts?.name ?? null,
      updatedAt: row.updated_at, destinationArea: row.destination_area, handoffReason: row.handoff_reason, suggestedPriority: row.protocols?.suggested_priority ?? null, followUpAt: row.follow_up_at,
      context: row.context ?? {}, notes: notes.map((note) => ({ id: note.id, author: note.author, content: note.content, createdAt: note.created_at })),
      messages: messages.map((message) => ({ ...message, receivedAt: message.received_at })),
    };
  }

  async claimConversation(id: string, operator: string): Promise<boolean> {
    const claimed = await this.request<Array<{ id: string }>>(
      `conversations?id=eq.${encodeURIComponent(id)}&assigned_operator=is.null&state=in.(queued,human)`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ assigned_operator: operator, assigned_at: new Date().toISOString(), state: 'human' }) },
      [200],
    );
    if (claimed.length) await this.audit('conversation.claimed', operator, { conversationId: id });
    return claimed.length > 0;
  }

  async releaseConversation(id: string, operator: string): Promise<boolean> {
    const released = await this.request<Array<{ id: string }>>(
      `conversations?id=eq.${encodeURIComponent(id)}&assigned_operator=eq.${encodeURIComponent(operator)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ assigned_operator: null, assigned_at: null, state: 'queued' }) },
      [200],
    );
    if (released.length) await this.audit('conversation.released', operator, { conversationId: id });
    return released.length > 0;
  }

  async addOperatorNote(id: string, author: string, content: string): Promise<void> {
    await this.request('operator_notes', { method: 'POST', body: JSON.stringify({ conversation_id: id, author, content }) }, [201]);
    await this.audit('conversation.note_added', author, { conversationId: id });
  }

  async scheduleFollowUp(id: string, actor: string, followUpAt: string): Promise<void> {
    await this.request(`conversations?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ follow_up_at: followUpAt }) }, [204]);
    await this.audit('conversation.follow_up_scheduled', actor, { conversationId: id, followUpAt });
  }

  async closeConversation(id: string, actor: string, resolutionNote: string): Promise<void> {
    await this.request(`conversations?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', resolution_note: resolutionNote, follow_up_at: null }) }, [204]);
    await this.audit('conversation.closed', actor, { conversationId: id });
  }

  async transferConversation(
    id: string,
    destination: 'commercial' | 'technical' | 'on_call' | 'coordination',
    actor: string,
  ): Promise<void> {
    const assignee = destination === 'coordination' ? undefined : await this.findEligibleUser(destination);
    await this.request(`conversations?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ destination_area: destination, assigned_operator: null, assigned_user_id: assignee?.id ?? null, state: 'queued', handoff_reason: `manual_transfer_${destination}` }) }, [204]);
    await this.request('handoffs', { method: 'POST', body: JSON.stringify({ conversation_id: id, reason: 'manual_transfer', destination_area: destination, initiated_by: actor }) }, [201]);
    await this.audit('conversation.transferred', actor, { conversationId: id, destination, assignedUserId: assignee?.id });
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

  private async findEligibleUser(area: 'commercial' | 'technical' | 'on_call'): Promise<Pick<AppUser, 'id' | 'name'> | undefined> {
    const users = await this.request<Array<Pick<AppUser, 'id' | 'name'>>>(`app_users?area=eq.${area}&active=is.true&select=id,name&order=created_at.asc&limit=1`, {}, [200]);
    if (users[0]) return users[0];
    if (area === 'on_call') {
      const technical = await this.request<Array<Pick<AppUser, 'id' | 'name'>>>('app_users?area=eq.technical&active=is.true&select=id,name&order=created_at.asc&limit=1', {}, [200]);
      return technical[0];
    }
    return undefined;
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
