import {
  IncomingMedia,
  IncomingMessage,
} from '../../modules/webhook/application/webhook-processor.js';
import type {
  OperationalConfigurationStore,
  OperationalSetting,
} from '../../modules/internal_operations/application/administrative-menu-service.js';

export type StoredConversation = {
  id: string;
  state: 'started' | 'consent' | 'route' | 'collecting' | 'review' | 'queued' | 'human' | 'closed';
  route: 'commercial' | 'technical' | 'human' | null;
  assignedOperator?: string | null;
  context: {
    service?: string;
    location?: string;
    contactName?: string;
    company?: string;
    cnpj?: string;
    contactPhone?: string;
    email?: string;
    editingField?: string;
    selectingEditField?: boolean;
    editingTechnicalField?: string;
    selectingTechnicalEditField?: boolean;
    selectingTechnicalEditMore?: boolean;
    initialIntent?: string;
    suggestedRoute?: 'commercial' | 'technical';
    impactConfirmation?: string;
    equipmentDomain?: 'hvac' | 'hemotherapy';
    identifiedEquipment?: string;
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
    greetingImageSent?: boolean;
  };
};

export type AppRole = 'admin' | 'coordination' | 'commercial' | 'technical' | 'on_call' | 'viewer';
export type AppUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: AppRole;
  area: 'commercial' | 'technical' | 'on_call' | 'coordination';
  active: boolean;
};
export type OperationalDocument = {
  id: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  category: 'on_call_schedule' | 'procedure' | 'commercial' | 'technical' | 'policy' | 'other';
  confidence: 'high' | 'medium' | 'needs_review';
  summary: string;
  status: 'ready' | 'needs_review';
  createdAt: string;
  onCallDate?: string | null;
  onCallMembers?: string | null;
  isCurrent?: boolean;
};
export type OperationalOverview = {
  newCases: number;
  inProgress: number;
  followUps: number;
  resolved: number;
  openedToday: number;
  resolvedToday: number;
  slaBreaches: number;
  averageResolutionMinutes: number | null;
  members: Array<Pick<AppUser, 'id' | 'name' | 'email' | 'role' | 'area' | 'active'>>;
  recentActivity: Array<{
    eventType: string;
    actor: string;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
};
export type OperationalAlert = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  status: 'open' | 'resolved';
  createdAt: string;
};
export type RetentionResult = { conversationsAnonymized: number; attachmentsDeleted: number };

type Contact = { id: string; document_type?: 'cpf' | 'cnpj' | null; document_number?: string | null };
type StoredMessage = { id: string; conversation_id?: string | null; processed_at?: string | null };
export type WebhookJob = { id: string; message: IncomingMessage; attempts: number };

export type CommercialSyncJob = {
  id: string;
  protocolId: string;
  payload: {
    protocolReference: string;
    service: string;
    contactName: string;
    company?: string;
    cnpj?: string;
    phone?: string;
    email?: string;
    location: string;
    timeline: string;
    need: string;
  };
  attempts: number;
};

export type OperatorConversation = {
  id: string;
  protocolId?: string | null;
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
  messages: Array<{
    id: string;
    direction: 'inbound' | 'outbound';
    content: string | null;
    receivedAt: string;
    deliveryStatus?: string | null;
  }>;
  context: StoredConversation['context'];
  notes: Array<{ id: string; author: string; content: string; createdAt: string }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mediaType: string;
    status: string;
    createdAt: string;
    analysisStatus?: string | null;
    extractedText?: string | null;
  }>;
};

export class SupabaseConversationStore implements OperationalConfigurationStore {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
  ) { }

  async acceptInbound(
    message: IncomingMessage,
  ): Promise<
    { conversation: StoredConversation; reopened: boolean; surveyResponse?: 'resolved' } | undefined
  > {
    let inserted = await this.request<StoredMessage[]>(
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
    if (!inserted?.[0]) {
      // A mensagem pode já ter sido gravada por uma tentativa que caiu antes
      // de concluir o turno. Só descartamos duplicatas já processadas.
      const existing = await this.request<StoredMessage[]>(
        `messages?meta_message_id=eq.${encodeURIComponent(message.id)}&select=id,conversation_id,processed_at`,
        {},
        [200],
      );
      const prior = existing[0];
      if (!prior) throw new Error('Mensagem duplicada não foi localizada para recuperação.');
      if (prior.processed_at) return undefined;
      inserted = [prior];
    }

    const contact = await this.upsertContact(message.from);
    const normalizedReply = (message.text ?? '').trim().toLowerCase();
    // Botões da pesquisa são inequívocos. Números 1 e 2 só podem ser
    // tratados como pesquisa quando a conversa já está encerrada; durante um
    // novo ciclo eles são opções válidas dos menus (rota e serviços).
    const surveyCandidate =
      message.interactiveId === 'satisfaction_resolved' ||
      message.interactiveId === 'satisfaction_partial';
    let reopened =
      isReopenRequest(message.text ?? message.interactiveId) ||
      message.interactiveId === 'satisfaction_partial';
    let conversation: StoredConversation;
    if (inserted[0].conversation_id) {
      const recovered = await this.request<Array<StoredConversation & { assigned_operator?: string | null }>>(
        `conversations?id=eq.${encodeURIComponent(inserted[0].conversation_id)}&select=id,state,route,context,assigned_operator`,
        {},
        [200],
      );
      conversation = recovered[0]
        ? { ...recovered[0], assignedOperator: recovered[0].assigned_operator ?? null }
        : await this.findOrCreateConversation(contact.id, reopened, surveyCandidate);
    } else {
      conversation = await this.findOrCreateConversation(contact.id, reopened, surveyCandidate);
    }
    const numericSurveyCandidate =
      conversation.state === 'closed' && (normalizedReply === '1' || normalizedReply === '2');
    if (numericSurveyCandidate) {
      reopened = normalizedReply === '2';
    }
    // Qualquer nova mensagem após um atendimento encerrado inicia um novo ciclo.
    // Mantemos a resposta de satisfação (1/2 ou botões) como exceção para não
    // transformar a pesquisa em um novo atendimento por engano.
    if (conversation.state === 'closed' && !surveyCandidate && normalizedReply) {
      conversation.state = 'consent';
      conversation.route = null;
      conversation.context = {};
    }
    const surveyResponse =
      conversation.state === 'closed' &&
        (message.interactiveId === 'satisfaction_resolved' || numericSurveyCandidate && normalizedReply === '1')
        ? 'resolved'
        : undefined;
    await this.request(
      'messages?id=eq.' + encodeURIComponent(inserted[0].id),
      {
        method: 'PATCH',
        body: JSON.stringify({ conversation_id: conversation.id }),
      },
      [204],
    );
    await this.request(
      'conversations?id=eq.' + encodeURIComponent(conversation.id),
      {
        method: 'PATCH',
        body: JSON.stringify({ updated_at: new Date().toISOString() }),
      },
      [204],
    );
    await this.audit('webhook.message_received', 'meta', {
      messageId: message.id,
      from: message.from,
      hasText: Boolean(message.text),
    });
    return { conversation, reopened, surveyResponse };
  }

  async saveConversation(conversation: StoredConversation): Promise<void> {
    await this.request(
      'conversations?id=eq.' + encodeURIComponent(conversation.id),
      {
        method: 'PATCH',
        body: JSON.stringify({
          state: conversation.state,
          route: conversation.route,
          destination_area: conversation.route,
          context: conversation.context,
        }),
      },
      [204],
    );
  }

  /** Persiste a transição e o checkpoint da mensagem na mesma transação SQL. */
  async saveConversationAndMarkInbound(
    conversation: StoredConversation,
    metaMessageId: string,
  ): Promise<void> {
    await this.request(
      'rpc/persist_conversation_turn',
      {
        method: 'POST',
        body: JSON.stringify({
          p_conversation_id: conversation.id,
          p_state: conversation.state,
          p_route: conversation.route,
          p_context: conversation.context,
          p_meta_message_id: metaMessageId,
        }),
      },
      [200, 204],
    );
  }

  async markInboundProcessed(metaMessageId: string): Promise<void> {
    await this.request(
      `messages?meta_message_id=eq.${encodeURIComponent(metaMessageId)}&processed_at=is.null`,
      { method: 'PATCH', body: JSON.stringify({ processed_at: new Date().toISOString() }) },
      [204],
    );
  }

  async saveOutbound(
    conversationId: string,
    text: string,
    delivery?: { messageId: string; status: 'sent' | 'failed' },
  ): Promise<void> {
    await this.request(
      'rpc/persist_outbound_message',
      {
        method: 'POST',
        body: JSON.stringify({
          p_conversation_id: conversationId,
          p_meta_message_id: delivery?.messageId ?? `local-outbound:${crypto.randomUUID()}`,
          p_content: text,
          p_status: delivery?.status ?? 'pending_meta_connection',
        }),
      },
      [200, 204],
    );
  }

  /** Registra o último estado confirmado pela Meta sem alterar o conteúdo da conversa. */
  async updateMetaDeliveryStatus(
    metaMessageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    error?: string,
  ): Promise<boolean> {
    const recorded = await this.request<boolean>(
      'rpc/record_meta_delivery_status',
      {
        method: 'POST',
        body: JSON.stringify({
          p_meta_message_id: metaMessageId,
          p_status: status,
          p_error: error?.slice(0, 450) ?? null,
        }),
      },
      [200],
    );
    await this.audit('meta.delivery_status_updated', 'meta', {
      metaMessageId,
      status,
      ...(error ? { error } : {}),
    });
    return recorded ?? false;
  }

  /** Fila durável: o webhook confirma à Meta após persistir, não após processar IA/mídia. */
  async enqueueWebhookMessages(messages: IncomingMessage[]): Promise<number> {
    if (!messages.length) return 0;
    const rows = messages.map((message) => ({
      meta_message_id: message.id,
      payload: message,
    }));
    const inserted = await this.request<Array<{ id: string }>>(
      'webhook_jobs?on_conflict=meta_message_id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(rows),
      },
      [200, 201],
    );
    return inserted?.length ?? 0;
  }

  async claimWebhookJobs(limit = 10): Promise<WebhookJob[]> {
    const rows = await this.request<
      Array<{ id: string; payload: IncomingMessage; attempts: number }>
    >(
      'rpc/claim_webhook_jobs',
      { method: 'POST', body: JSON.stringify({ p_limit: Math.max(1, Math.min(limit, 50)) }) },
      [200],
    );
    return (rows ?? []).map((row) => ({
      id: row.id,
      message: row.payload,
      attempts: row.attempts,
    }));
  }

  async completeWebhookJob(id: string): Promise<void> {
    await this.request(
      `webhook_jobs?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString() }),
      },
      [204],
    );
  }

  async failWebhookJob(id: string, error: unknown, attempts = 1): Promise<void> {
    const message = error instanceof Error ? error.message : 'Falha desconhecida';
    const permanentlyFailed = attempts >= 5;
    await this.request(
      `webhook_jobs?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: permanentlyFailed ? 'failed' : 'queued',
          last_error: message.slice(0, 1000),
          available_at: new Date(Date.now() + Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempts - 1))).toISOString(),
        }),
      },
      [204],
    );
    if (permanentlyFailed)
      await this.audit('webhook.job_dead_lettered', 'system', {
        jobId: id,
        attempts,
        error: message.slice(0, 500),
      });
  }

  async listFailedWebhookJobs(): Promise<
    Array<{ id: string; metaMessageId: string; attempts: number; lastError: string | null; createdAt: string }>
  > {
    const rows = await this.request<
      Array<{ id: string; meta_message_id: string; attempts: number; last_error: string | null; created_at: string }>
    >(
      'webhook_jobs?status=eq.failed&select=id,meta_message_id,attempts,last_error,created_at&order=created_at.desc&limit=100',
      {},
      [200],
    );
    return rows.map((row) => ({
      id: row.id,
      metaMessageId: row.meta_message_id,
      attempts: row.attempts,
      lastError: row.last_error,
      createdAt: row.created_at,
    }));
  }

  async retryFailedWebhookJob(id: string, actor: string): Promise<boolean> {
    const rows = await this.request<Array<{ id: string }>>(
      `webhook_jobs?id=eq.${encodeURIComponent(id)}&status=eq.failed`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'queued', attempts: 0, available_at: new Date().toISOString(), last_error: null }),
      },
      [200],
    );
    if (!rows.length) return false;
    await this.audit('webhook.job_requeued', actor, { jobId: id });
    return true;
  }

  async saveMediaAttachment(
    conversation: StoredConversation,
    media: IncomingMedia,
    content: Uint8Array | undefined,
    status: 'pending_connection' | 'stored' | 'failed',
    errorMessage?: string,
  ): Promise<string> {
    const fileName = safeFileName(media.fileName ?? `${media.type}-${media.id}`);
    const storagePath = `${conversation.id}/${crypto.randomUUID()}-${fileName}`;
    const mediaType = media.mimeType ?? defaultMediaType(media.type);
    if (content) {
      await this.uploadPrivateObject(storagePath, mediaType, content);
    }
    const saved = await this.request<Array<{ id: string }>>(
      'conversation_attachments',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          conversation_id: conversation.id,
          storage_path: storagePath,
          file_name: fileName,
          media_type: mediaType,
          size_bytes: content?.byteLength ?? 0,
          source_media_id: media.id,
          status,
          error_message: errorMessage?.slice(0, 1_000),
          expires_at: new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString(),
        }),
      },
      [201],
    );
    return saved[0].id;
  }

  async saveMediaAnalysis(
    attachmentId: string,
    analysis: {
      extractedText?: string;
      status: 'completed' | 'needs_review' | 'failed';
      error?: string;
    },
  ): Promise<void> {
    await this.request(
      `conversation_attachments?id=eq.${encodeURIComponent(attachmentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          analysis_status: analysis.status,
          extracted_text: analysis.extractedText?.slice(0, 4_000) ?? null,
          analysis_error: analysis.error?.slice(0, 1_000) ?? null,
        }),
      },
      [204],
    );
  }

  async listOperationalDocuments(): Promise<OperationalDocument[]> {
    const rows = await this.request<
      Array<{
        id: string;
        file_name: string;
        media_type: string;
        size_bytes: number;
        category: OperationalDocument['category'];
        confidence: OperationalDocument['confidence'];
        summary: string;
        status: OperationalDocument['status'];
        created_at: string;
        on_call_date: string | null;
        on_call_members: string | null;
        is_current: boolean;
      }>
    >(
      'operational_documents?select=id,file_name,media_type,size_bytes,category,confidence,summary,status,created_at,on_call_date,on_call_members,is_current&order=created_at.desc',
      {},
      [200],
    );
    return rows.map((row) => ({
      id: row.id,
      fileName: row.file_name,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes,
      category: row.category,
      confidence: row.confidence,
      summary: row.summary,
      status: row.status,
      createdAt: row.created_at,
      onCallDate: row.on_call_date,
      onCallMembers: row.on_call_members,
      isCurrent: row.is_current,
    }));
  }

  async saveOperationalDocument(
    input: Omit<OperationalDocument, 'id' | 'createdAt'> & { content: Uint8Array },
  ): Promise<OperationalDocument> {
    const fileName = safeFileName(input.fileName);
    const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${fileName}`;
    await this.uploadObject('operational-documents', storagePath, input.mediaType, input.content);
    const rows = await this.request<
      Array<{
        id: string;
        file_name: string;
        media_type: string;
        size_bytes: number;
        category: OperationalDocument['category'];
        confidence: OperationalDocument['confidence'];
        summary: string;
        status: OperationalDocument['status'];
        created_at: string;
        on_call_date: string | null;
        on_call_members: string | null;
        is_current: boolean;
      }>
    >(
      'operational_documents',
      {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          storage_path: storagePath,
          file_name: fileName,
          media_type: input.mediaType,
          size_bytes: input.sizeBytes,
          category: input.category,
          confidence: input.confidence,
          summary: input.summary,
          status: input.status,
          on_call_date: input.onCallDate ?? null,
          on_call_members: input.onCallMembers ?? null,
        }),
      },
      [201],
    );
    const row = rows[0];
    if (!row) throw new Error('O documento foi enviado, mas não pôde ser registrado.');
    await this.audit('operational_document.uploaded', 'admin-dashboard', {
      documentId: row.id,
      category: row.category,
      fileName,
    });
    return {
      id: row.id,
      fileName: row.file_name,
      mediaType: row.media_type,
      sizeBytes: row.size_bytes,
      category: row.category,
      confidence: row.confidence,
      summary: row.summary,
      status: row.status,
      createdAt: row.created_at,
      onCallDate: row.on_call_date,
      onCallMembers: row.on_call_members,
      isCurrent: row.is_current,
    };
  }

  async getOperationalOverview(): Promise<OperationalOverview> {
    const [conversations, users, audit] = await Promise.all([
      this.request<
        Array<{
          state: string;
          follow_up_at: string | null;
          created_at: string;
          updated_at: string;
          protocols: { suggested_priority: 'P1' | 'P2' | 'P3' | 'P4' | null } | null;
        }>
      >(
        'conversations?select=state,follow_up_at,created_at,updated_at,protocols(suggested_priority)',
        {},
        [200],
      ),
      this.listUsers(),
      this.request<
        Array<{
          event_type: string;
          actor: string;
          created_at: string;
          payload: Record<string, unknown>;
        }>
      >(
        'audit_events?select=event_type,actor,created_at,payload&order=created_at.desc&limit=20',
        {},
        [200],
      ),
    ]);
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const slaMinutes = (priority: string | null | undefined) =>
      priority === 'P1' || priority === 'P2' ? 30 : 120;
    const closed = conversations.filter((item) => item.state === 'closed');
    const resolutionMinutes = closed.map((item) =>
      Math.max(
        0,
        (new Date(item.updated_at).getTime() - new Date(item.created_at).getTime()) / 60_000,
      ),
    );
    return {
      newCases: conversations.filter((item) => item.state === 'queued').length,
      inProgress: conversations.filter((item) => item.state === 'human').length,
      followUps: conversations.filter((item) => Boolean(item.follow_up_at)).length,
      resolved: closed.length,
      openedToday: conversations.filter((item) => new Date(item.created_at) >= today).length,
      resolvedToday: closed.filter((item) => new Date(item.updated_at) >= today).length,
      slaBreaches: conversations.filter(
        (item) =>
          item.state !== 'closed' &&
          (now - new Date(item.updated_at).getTime()) / 60_000 >
          slaMinutes(item.protocols?.suggested_priority),
      ).length,
      averageResolutionMinutes: resolutionMinutes.length
        ? Math.round(
          resolutionMinutes.reduce((total, value) => total + value, 0) / resolutionMinutes.length,
        )
        : null,
      members: users.map(({ passwordHash: _passwordHash, ...user }) => user),
      recentActivity: audit.map((event) => ({
        eventType: event.event_type,
        actor: event.actor,
        createdAt: event.created_at,
        payload: event.payload ?? {},
      })),
    };
  }

  async getOperationalHealth(): Promise<{
    status: 'ok';
    checkedAt: string;
    activeConversations: number;
    openAlerts: number;
  }> {
    const [conversations, alerts] = await Promise.all([
      this.request<Array<{ id: string }>>(
        'conversations?select=id&state=in.(queued,human)',
        {},
        [200],
      ),
      this.request<Array<{ id: string }>>('operational_alerts?select=id&status=eq.open', {}, [200]),
    ]);
    return {
      status: 'ok',
      checkedAt: new Date().toISOString(),
      activeConversations: conversations.length,
      openAlerts: alerts.length,
    };
  }

  async refreshOperationalAlerts(): Promise<{ created: number }> {
    const [overdue, currentSchedules, criticalWithoutOwner] = await Promise.all([
      this.request<Array<{ id: string }>>(
        `conversations?select=id&state=in.(queued,human)&follow_up_at=lt.${encodeURIComponent(new Date().toISOString())}`,
        {},
        [200],
      ),
      this.request<Array<{ id: string }>>(
        'operational_documents?select=id&category=eq.on_call_schedule&is_current=is.true',
        {},
        [200],
      ),
      this.request<Array<{ id: string }>>(
        'conversations?select=id,protocols!inner(suggested_priority)&state=in.(queued,human)&assigned_operator=is.null&protocols.suggested_priority=in.(P1,P2)',
        {},
        [200],
      ),
    ]);
    const candidates = [
      overdue.length && {
        kind: 'overdue_follow_up',
        title: 'Retornos vencidos',
        detail: `${overdue.length} retorno(s) aguardam ação.`,
        count: overdue.length,
      },
      !currentSchedules.length && {
        kind: 'missing_on_call',
        title: 'Escala vigente não publicada',
        detail: 'Publique a escala de plantão atual para orientar os encaminhamentos.',
        count: 1,
      },
      criticalWithoutOwner.length && {
        kind: 'unassigned_critical',
        title: 'Casos prioritários sem responsável',
        detail: `${criticalWithoutOwner.length} caso(s) P1 ou P2 ainda não foram assumidos.`,
        count: criticalWithoutOwner.length,
      },
    ].filter(Boolean) as Array<{ kind: string; title: string; detail: string; count: number }>;
    if (!candidates.length) return { created: 0 };
    let created = 0;
    for (const candidate of candidates) {
      const existing = await this.request<Array<{ id: string }>>(
        `operational_alerts?kind=eq.${encodeURIComponent(candidate.kind)}&status=eq.open&select=id`,
        {},
        [200],
      );
      if (existing.length) continue;
      await this.request(
        'operational_alerts',
        {
          method: 'POST',
          body: JSON.stringify({
            kind: candidate.kind,
            title: candidate.title,
            detail: candidate.detail,
          }),
        },
        [201],
      );
      await this.audit('operational.alert_created', 'system', {
        kind: candidate.kind,
        count: candidate.count,
      });
      created += 1;
    }
    return { created };
  }

  async listOperationalAlerts(): Promise<OperationalAlert[]> {
    const rows = await this.request<
      Array<{
        id: string;
        kind: string;
        title: string;
        detail: string;
        status: 'open' | 'resolved';
        created_at: string;
      }>
    >(
      'operational_alerts?select=id,kind,title,detail,status,created_at&order=created_at.desc&limit=30',
      {},
      [200],
    );
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      detail: row.detail,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async resolveOperationalAlert(id: string, actor: string): Promise<void> {
    await this.request(
      `operational_alerts?id=eq.${encodeURIComponent(id)}&status=eq.open`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved', resolved_at: new Date().toISOString() }),
      },
      [204],
    );
    await this.audit('operational.alert_resolved', actor, { alertId: id });
  }

  async setCurrentOnCallSchedule(id: string, actor: string): Promise<void> {
    await this.request(
      'operational_documents?category=eq.on_call_schedule&is_current=is.true',
      { method: 'PATCH', body: JSON.stringify({ is_current: false }) },
      [204],
    );
    await this.request(
      `operational_documents?id=eq.${encodeURIComponent(id)}&category=eq.on_call_schedule`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          is_current: true,
          published_by: actor,
          published_at: new Date().toISOString(),
          status: 'ready',
        }),
      },
      [204],
    );
    await this.audit('on_call_schedule.published', actor, { documentId: id });
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

  async createCommercialProtocol(
    conversation: StoredConversation,
    sourceMessageId: string,
  ): Promise<string> {
    const context = conversation.context;
    if (!context.service || !context.location || !context.timeline || !context.need)
      throw new Error('A solicitação comercial não possui todos os dados obrigatórios.');
    const technicalDetails =
      context.service === 'Assistência avulsa' && context.equipment
        ? [
            'Dados técnicos já informados:',
            `Equipamento: ${context.equipment}`,
            `Fabricante/modelo: ${context.manufacturerModel ?? 'não informado'}`,
            `Patrimônio/série: ${context.assetIdentifier ?? 'não informado'}`,
            `Sintoma: ${context.symptom ?? 'não informado'}`,
            `Alarme: ${context.alarm ?? 'não informado'}`,
            `Início/frequência: ${context.startedFrequency ?? 'não informado'}`,
            `Impacto: ${context.operationalImpact ?? 'não informado'}`,
            `Contingência: ${context.contingency ?? 'não informado'}`,
            `Risco: ${context.reportedRisk ?? 'não informado'}`,
          ].join(' · ')
        : '';
    const requestNeed = [context.need, technicalDetails].filter(Boolean).join('\n\n').slice(0, 1000);
    const { id: protocolId, reference } = await this.getOrCreateProtocol(
      'commercial',
      sourceMessageId,
    );
    await this.request(
      'commercial_requests?on_conflict=protocol_id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          protocol_id: protocolId,
          service: context.service,
          location: context.location,
          timeline: context.timeline,
          need: requestNeed,
        }),
      },
      [201, 204],
    );
    await this.request(
      'commercial_sync_jobs?on_conflict=protocol_id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          protocol_id: protocolId,
          payload: {
            protocolReference: reference,
            service: context.service,
            contactName: context.contactName ?? 'Contato não informado',
            company: context.company,
            cnpj: context.cnpj,
            phone: context.contactPhone,
            email: context.email,
            location: context.location,
            timeline: context.timeline,
            need: requestNeed,
          },
        }),
      },
      [201, 204],
    );
    const conversations = await this.request<Array<{ contact_id: string }>>(
      `conversations?id=eq.${encodeURIComponent(conversation.id)}&select=contact_id`,
      {},
      [200],
    );
    const contactId = conversations[0]?.contact_id;
    if (contactId) {
      await this.request(
        `contacts?id=eq.${encodeURIComponent(contactId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            name: context.contactName ?? null,
            company: context.company === 'pessoa física' ? null : (context.company ?? null),
            document_type: context.cnpj ? (context.cnpj.replace(/\\D/g, '').length === 11 ? 'cpf' : 'cnpj') : null,
            document_number: context.cnpj ? context.cnpj.replace(/[^0-9A-Z]/gi, '').toUpperCase() : null,
            email: context.email === 'não informado' ? null : (context.email ?? null),
            consented_at: new Date().toISOString(),
          }),
        },
        [204],
      );
    }
    // Comercial recebe o resumo diretamente no número configurado e trabalha
    // fora da fila humana. A conversa continua visível em Leads para auditoria,
    // mas nunca exige que alguém a assuma no Operator.
    await this.request(
      `conversations?id=eq.${encodeURIComponent(conversation.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          protocol_id: protocolId,
          state: 'queued',
          destination_area: 'commercial',
          assigned_user_id: null,
          handoff_reason: 'commercial_protocol',
        }),
      },
      [204],
    );
    await this.audit('commercial.protocol_queued', 'customer', {
      protocolId,
      reference,
      route: 'commercial',
      assignedUserId: null,
    });
    return reference;
  }

  async createTechnicalProtocol(
    conversation: StoredConversation,
    priority: 'P1' | 'P2' | 'P3' | 'P4',
    reason: string,
    sourceMessageId: string,
  ): Promise<string> {
    const context = conversation.context;
    const required = [
      'equipment',
      'manufacturerModel',
      'symptom',
      'startedFrequency',
      'operationalImpact',
      'contingency',
      'reportedRisk',
    ] as const;
    if (required.some((field) => !context[field]))
      throw new Error('A pré-triagem técnica ainda está incompleta.');
    const { id: protocolId, reference } = await this.getOrCreateProtocol(
      'technical',
      sourceMessageId,
      priority,
    );
    await this.request(
      'technical_tickets?on_conflict=protocol_id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          protocol_id: protocolId,
          contract_reference: context.contractReference ?? null,
          equipment: context.equipment,
          manufacturer_model: context.manufacturerModel,
          asset_identifier: context.assetIdentifier ?? null,
          symptom: context.symptom,
          alarm: context.alarm ?? null,
          started_frequency: context.startedFrequency,
          operational_impact: context.operationalImpact,
          contingency: context.contingency,
          reported_risk: context.reportedRisk,
          priority_reason: reason,
        }),
      },
      [201, 204],
    );
    const destination = priority === 'P1' || priority === 'P2' ? 'on_call' : 'technical';
    const assignee = await this.findEligibleUser(destination);
    await this.request(
      `conversations?id=eq.${encodeURIComponent(conversation.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          protocol_id: protocolId,
          state: 'queued',
          destination_area: destination,
          assigned_user_id: assignee?.id ?? null,
          handoff_reason: `priority_${priority}`,
        }),
      },
      [204],
    );
    if (priority === 'P1' || priority === 'P2') {
      const dueAt = new Date(Date.now() + (priority === 'P1' ? 5 : 15) * 60_000).toISOString();
      await this.request(
        'handoff_escalations',
        {
          method: 'POST',
          body: JSON.stringify({
            conversation_id: conversation.id,
            protocol_id: protocolId,
            priority,
            due_at: dueAt,
          }),
        },
        [201],
      );
    }
    await this.audit('technical.protocol_queued', 'system', {
      protocolId,
      reference,
      priority,
      destination,
      assignedUserId: assignee?.id,
    });
    return reference;
  }

  private async getOrCreateProtocol(
    type: 'commercial' | 'technical',
    sourceMessageId: string,
    priority?: 'P1' | 'P2' | 'P3' | 'P4',
  ): Promise<{ id: string; reference: string }> {
    const find = () =>
      this.request<Array<{ id: string; reference: string; type: 'commercial' | 'technical' }>>(
        `protocols?source_message_id=eq.${encodeURIComponent(sourceMessageId)}&select=id,reference,type`,
        {},
        [200],
      );
    let existing = await find();
    if (!existing.length) {
      const reference = `LFE-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const created = await this.request<Array<{ id: string; reference: string }>>(
        'protocols',
        {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            reference,
            type,
            status: 'new',
            source_message_id: sourceMessageId,
            ...(priority ? { suggested_priority: priority } : {}),
          }),
        },
        [201],
      );
      existing = created?.length ? [{ ...created[0], type }] : await find();
    }
    const protocol = existing[0];
    if (!protocol || protocol.type !== type)
      throw new Error('Não foi possível recuperar o protocolo desta confirmação.');
    return { id: protocol.id, reference: protocol.reference };
  }

  async listPendingCommercialSyncJobs(limit = 10): Promise<CommercialSyncJob[]> {
    const rows = await this.request<
      Array<{
        id: string;
        protocol_id: string;
        payload: CommercialSyncJob['payload'];
        attempts: number;
      }>
    >(
      `commercial_sync_jobs?status=in.(pending,failed)&next_attempt_at=lte.${encodeURIComponent(new Date().toISOString())}&select=id,protocol_id,payload,attempts&order=created_at.asc&limit=${limit}`,
      {},
      [200],
    );
    return rows.map((row) => ({
      id: row.id,
      protocolId: row.protocol_id,
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  async getPendingCommercialSyncJob(protocolId: string): Promise<CommercialSyncJob | undefined> {
    const rows = await this.request<
      Array<{
        id: string;
        protocol_id: string;
        payload: CommercialSyncJob['payload'];
        attempts: number;
      }>
    >(
      `commercial_sync_jobs?protocol_id=eq.${encodeURIComponent(protocolId)}&status=in.(pending,failed)&select=id,protocol_id,payload,attempts&order=created_at.asc&limit=1`,
      {},
      [200],
    );
    const row = rows[0];
    return row
      ? { id: row.id, protocolId: row.protocol_id, payload: row.payload, attempts: row.attempts }
      : undefined;
  }

  async markCommercialSyncCompleted(
    job: CommercialSyncJob,
    contactId: number,
    dealId: number,
  ): Promise<void> {
    await this.request(
      `commercial_sync_jobs?id=eq.${encodeURIComponent(job.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          completed_at: new Date().toISOString(),
          external_contact_id: String(contactId),
          external_deal_id: String(dealId),
          last_error: null,
        }),
      },
      [204],
    );
    await this.request(
      `commercial_requests?protocol_id=eq.${encodeURIComponent(job.protocolId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ ploomes_id: String(dealId), status: 'synced' }),
      },
      [204],
    );
    await this.audit('commercial.ploomes_synced', 'ploomes', {
      protocolId: job.protocolId,
      contactId,
      dealId,
    });
  }

  async markCommercialSyncFailed(job: CommercialSyncJob, error: string): Promise<void> {
    const attempts = job.attempts + 1;
    const retryMinutes = Math.min(60, 2 ** Math.min(attempts, 6));
    await this.request(
      `commercial_sync_jobs?id=eq.${encodeURIComponent(job.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'failed',
          attempts,
          last_error: error.slice(0, 1_000),
          next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        }),
      },
      [204],
    );
    await this.audit('commercial.ploomes_sync_failed', 'ploomes', {
      protocolId: job.protocolId,
      attempts,
      error: error.slice(0, 1_000),
    });
  }

  async runDueEscalations(): Promise<{ escalated: number }> {
    const rows = await this.request<
      Array<{
        id: string;
        conversation_id: string;
        protocol_id: string;
        priority: 'P1' | 'P2';
        attempts: number;
      }>
    >(
      `handoff_escalations?status=eq.pending&due_at=lte.${encodeURIComponent(new Date().toISOString())}&select=id,conversation_id,protocol_id,priority,attempts&order=due_at.asc&limit=50`,
      {},
      [200],
    );
    for (const escalation of rows) {
      await this.request(
        `handoff_escalations?id=eq.${encodeURIComponent(escalation.id)}&status=eq.pending`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'escalated',
            attempts: escalation.attempts + 1,
            escalated_at: new Date().toISOString(),
          }),
        },
        [204],
      );
      await this.request(
        `conversations?id=eq.${encodeURIComponent(escalation.conversation_id)}&assigned_operator=is.null`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            destination_area: 'coordination',
            handoff_reason: `unacknowledged_${escalation.priority}`,
          }),
        },
        [204],
      );
      await this.audit('technical.escalation_due', 'scheduler', {
        protocolId: escalation.protocol_id,
        conversationId: escalation.conversation_id,
        priority: escalation.priority,
      });
    }
    return { escalated: rows.length };
  }

  async runRetention(input: {
    conversationDays: number;
    attachmentDays: number;
    dryRun: boolean;
  }): Promise<RetentionResult> {
    const response = await fetch(new URL('/rest/v1/rpc/apply_lgpd_retention', this.url), {
      method: 'POST',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        conversation_days: input.conversationDays,
        attachment_days: input.attachmentDays,
        dry_run: input.dryRun,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`A rotina de retenção falhou (${response.status}).`);
    const rows = (await response.json()) as Array<{
      conversations_anonymized: number;
      attachments_deleted: number;
    }>;
    const row = rows[0] ?? { conversations_anonymized: 0, attachments_deleted: 0 };
    return {
      conversationsAnonymized: row.conversations_anonymized,
      attachmentsDeleted: row.attachments_deleted,
    };
  }

  async listUsers(): Promise<AppUser[]> {
    const rows = await this.request<
      Array<{
        id: string;
        name: string;
        email: string;
        password_hash: string;
        role: AppRole;
        area: AppUser['area'];
        active: boolean;
      }>
    >('app_users?select=id,name,email,password_hash,role,area,active&order=name.asc', {}, [200]);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role,
      area: row.area,
      active: row.active,
    }));
  }

  async createUser(user: Omit<AppUser, 'id'>): Promise<void> {
    await this.request(
      'app_users',
      {
        method: 'POST',
        body: JSON.stringify({
          name: user.name,
          email: user.email.toLowerCase(),
          password_hash: user.passwordHash,
          role: user.role,
          area: user.area,
          active: user.active,
        }),
      },
      [201],
    );
    await this.audit('user.created', 'admin-dashboard', {
      email: user.email,
      role: user.role,
      area: user.area,
    });
  }

  async updateUser(id: string, update: Pick<AppUser, 'role' | 'area' | 'active'>): Promise<void> {
    await this.request(
      `app_users?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: update.role, area: update.area, active: update.active }),
      },
      [204],
    );
    await this.audit('user.updated', 'admin-dashboard', { id, ...update });
  }

  async updateUserPassword(id: string, passwordHash: string): Promise<void> {
    await this.request(
      `app_users?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ password_hash: passwordHash }) },
      [204],
    );
    await this.audit('user.password_updated', 'admin-dashboard', { id });
  }

  async findUserByEmail(email: string): Promise<AppUser | undefined> {
    const users = await this.request<
      Array<{
        id: string;
        name: string;
        email: string;
        password_hash: string;
        role: AppRole;
        area: AppUser['area'];
        active: boolean;
      }>
    >(
      `app_users?email=eq.${encodeURIComponent(email.toLowerCase())}&select=id,name,email,password_hash,role,area,active`,
      {},
      [200],
    );
    const row = users[0];
    return row
      ? {
        id: row.id,
        name: row.name,
        email: row.email,
        passwordHash: row.password_hash,
        role: row.role,
        area: row.area,
        active: row.active,
      }
      : undefined;
  }

  async listOperatorConversations(
    areas?: string[],
    includeClosed = false,
  ): Promise<OperatorConversation[]> {
    const areaFilter = areas?.length
      ? `&destination_area=in.(${areas.map(encodeURIComponent).join(',')})`
      : '';
    const rows = await this.request<
      Array<{
        id: string;
        state: OperatorConversation['state'];
        route: OperatorConversation['route'];
        assigned_operator: string | null;
        destination_area: string | null;
        handoff_reason: string | null;
        updated_at: string;
        follow_up_at: string | null;
        protocols: {
          id: string;
          suggested_priority: OperatorConversation['suggestedPriority'];
        } | null;
        contacts: { phone_e164: string; name: string | null } | null;
      }>
    >(
      `conversations?state=in.(${includeClosed ? 'started,consent,route,collecting,review,queued,human,closed' : 'started,consent,route,collecting,review,queued,human'})${areaFilter}&select=id,state,route,assigned_operator,destination_area,handoff_reason,updated_at,follow_up_at,contacts(phone_e164,name),protocols(id,suggested_priority)&order=updated_at.desc`,
      {},
      [200],
    );
    return rows.map((row) => ({
      id: row.id,
      protocolId: row.protocols?.id ?? null,
      state: row.state,
      route: row.route,
      assignedOperator: row.assigned_operator,
      contactPhone: row.contacts?.phone_e164 ?? 'Contato indisponível',
      contactName: row.contacts?.name ?? null,
      updatedAt: row.updated_at,
      destinationArea: row.destination_area,
      handoffReason: row.handoff_reason,
      suggestedPriority: row.protocols?.suggested_priority ?? null,
      followUpAt: row.follow_up_at,
    }));
  }

  async getOperatorConversation(id: string): Promise<OperatorConversationDetail | undefined> {
    const conversations = await this.request<
      Array<{
        id: string;
        state: OperatorConversation['state'];
        route: OperatorConversation['route'];
        assigned_operator: string | null;
        updated_at: string;
        destination_area: string | null;
        handoff_reason: string | null;
        follow_up_at: string | null;
        context: StoredConversation['context'];
        protocols: {
          id: string;
          suggested_priority: OperatorConversation['suggestedPriority'];
        } | null;
        contacts: { phone_e164: string; name: string | null } | null;
      }>
    >(
      `conversations?id=eq.${encodeURIComponent(id)}&select=id,state,route,assigned_operator,destination_area,handoff_reason,updated_at,follow_up_at,context,contacts(phone_e164,name),protocols(id,suggested_priority)`,
      {},
      [200],
    );
    const row = conversations[0];
    if (!row) return undefined;
    const messages = await this.request<
      Array<{
        id: string;
        direction: 'inbound' | 'outbound';
        content: string | null;
        received_at: string;
        delivery_status: string | null;
      }>
    >(
      `messages?conversation_id=eq.${encodeURIComponent(id)}&select=id,direction,content,received_at,delivery_status&order=received_at.asc`,
      {},
      [200],
    );
    const notes = await this.request<
      Array<{ id: string; author: string; content: string; created_at: string }>
    >(
      `operator_notes?conversation_id=eq.${encodeURIComponent(id)}&select=id,author,content,created_at&order=created_at.desc`,
      {},
      [200],
    );
    const attachments = await this.request<
      Array<{
        id: string;
        file_name: string;
        media_type: string;
        status: string;
        created_at: string;
        analysis_status: string | null;
        extracted_text: string | null;
      }>
    >(
      `conversation_attachments?conversation_id=eq.${encodeURIComponent(id)}&select=id,file_name,media_type,status,created_at,analysis_status,extracted_text&order=created_at.asc`,
      {},
      [200],
    );
    return {
      id: row.id,
      protocolId: row.protocols?.id ?? null,
      state: row.state,
      route: row.route,
      assignedOperator: row.assigned_operator,
      contactPhone: row.contacts?.phone_e164 ?? 'Contato indisponível',
      contactName: row.contacts?.name ?? null,
      updatedAt: row.updated_at,
      destinationArea: row.destination_area,
      handoffReason: row.handoff_reason,
      suggestedPriority: row.protocols?.suggested_priority ?? null,
      followUpAt: row.follow_up_at,
      context: row.context ?? {},
      notes: notes.map((note) => ({
        id: note.id,
        author: note.author,
        content: note.content,
        createdAt: note.created_at,
      })),
      messages: messages.map((message) => ({ ...message, receivedAt: message.received_at })),
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.file_name,
        mediaType: attachment.media_type,
        status: attachment.status,
        createdAt: attachment.created_at,
        analysisStatus: attachment.analysis_status,
        extractedText: attachment.extracted_text,
      })),
    };
  }

  async createAttachmentSignedUrl(
    conversationId: string,
    attachmentId: string,
  ): Promise<string | undefined> {
    const attachments = await this.request<Array<{ storage_path: string; status: string }>>(
      `conversation_attachments?id=eq.${encodeURIComponent(attachmentId)}&conversation_id=eq.${encodeURIComponent(conversationId)}&select=storage_path,status`,
      {},
      [200],
    );
    const attachment = attachments[0];
    if (!attachment || attachment.status !== 'stored') return undefined;
    const response = await fetch(
      new URL(`/storage/v1/object/sign/protocol-attachments/${attachment.storage_path}`, this.url),
      {
        method: 'POST',
        headers: {
          apikey: this.serviceKey,
          Authorization: `Bearer ${this.serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 300 }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok)
      throw new Error(`Não foi possível assinar o anexo privado (${response.status}).`);
    const body = (await response.json()) as { signedURL?: string };
    return body.signedURL ? new URL(body.signedURL, this.url).toString() : undefined;
  }

  async claimConversation(id: string, operator: string): Promise<boolean> {
    const claimed = await this.request<Array<{ id: string }>>(
      `conversations?id=eq.${encodeURIComponent(id)}&assigned_operator=is.null&state=in.(started,consent,route,collecting,review,queued,human)`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          assigned_operator: operator,
          assigned_at: new Date().toISOString(),
          state: 'human',
        }),
      },
      [200],
    );
    if (claimed.length) await this.audit('conversation.claimed', operator, { conversationId: id });
    return claimed.length > 0;
  }

  async releaseConversation(id: string, operator: string): Promise<boolean> {
    const released = await this.request<Array<{ id: string }>>(
      `conversations?id=eq.${encodeURIComponent(id)}&assigned_operator=eq.${encodeURIComponent(operator)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          assigned_operator: null,
          assigned_at: null,
          follow_up_at: null,
          state: 'queued',
        }),
      },
      [200],
    );
    if (released.length)
      await this.audit('conversation.released', operator, { conversationId: id });
    return released.length > 0;
  }

  async addOperatorNote(id: string, author: string, content: string): Promise<void> {
    await this.request(
      'operator_notes',
      { method: 'POST', body: JSON.stringify({ conversation_id: id, author, content }) },
      [201],
    );
    await this.audit('conversation.note_added', author, { conversationId: id });
  }

  async scheduleFollowUp(id: string, actor: string, followUpAt: string | null): Promise<void> {
    await this.request(
      `conversations?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ follow_up_at: followUpAt }) },
      [204],
    );
    await this.audit(
      followUpAt ? 'conversation.follow_up_scheduled' : 'conversation.follow_up_cancelled',
      actor,
      { conversationId: id, followUpAt },
    );
  }

  async closeConversation(id: string, actor: string, resolutionNote: string): Promise<void> {
    await this.request(
      `conversations?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          state: 'closed',
          resolution_note: resolutionNote,
          follow_up_at: null,
        }),
      },
      [204],
    );
    await this.audit('conversation.closed', actor, { conversationId: id });
  }

  async reopenConversation(id: string, actor: string): Promise<void> {
    await this.request(
      `conversations?id=eq.${encodeURIComponent(id)}&state=eq.closed`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          state: 'queued',
          assigned_operator: null,
          assigned_at: null,
          follow_up_at: null,
          resolution_note: null,
        }),
      },
      [204],
    );
    await this.audit('conversation.reopened_by_operator', actor, { conversationId: id });
  }

  async registerManualPloomes(
    conversationId: string,
    protocolId: string,
    actor: string,
    ploomesId: string,
  ): Promise<void> {
    await this.request(
      `commercial_requests?protocol_id=eq.${encodeURIComponent(protocolId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          ploomes_id: ploomesId,
          status: 'manual_registered',
          ploomes_registered_by: actor,
          ploomes_registered_at: new Date().toISOString(),
        }),
      },
      [204],
    );
    await this.request(
      `protocols?id=eq.${encodeURIComponent(protocolId)}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) },
      [204],
    );
    await this.audit('commercial.ploomes_manual_registered', actor, {
      conversationId,
      protocolId,
      ploomesId,
    });
  }

  async registerManualServiceOrder(
    conversationId: string,
    protocolId: string,
    actor: string,
    serviceOrderNumber: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.request(
      `technical_tickets?protocol_id=eq.${encodeURIComponent(protocolId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          service_order_number: serviceOrderNumber,
          service_order_status: 'manual_opened',
          service_order_opened_at: now,
          service_order_opened_by: actor,
        }),
      },
      [204],
    );
    await this.request(
      `protocols?id=eq.${encodeURIComponent(protocolId)}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'in_progress' }) },
      [204],
    );
    await this.audit('technical.service_order_manual_opened', actor, {
      conversationId,
      protocolId,
      serviceOrderNumber,
    });
  }

  async transferConversation(
    id: string,
    destination: 'commercial' | 'technical' | 'on_call' | 'coordination',
    actor: string,
  ): Promise<void> {
    const assignee =
      destination === 'coordination' ? undefined : await this.findEligibleUser(destination);
    await this.request(
      `conversations?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          destination_area: destination,
          assigned_operator: null,
          assigned_user_id: assignee?.id ?? null,
          state: 'queued',
          handoff_reason: `manual_transfer_${destination}`,
        }),
      },
      [204],
    );
    await this.request(
      'handoffs',
      {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: id,
          reason: 'manual_transfer',
          destination_area: destination,
          initiated_by: actor,
        }),
      },
      [201],
    );
    await this.audit('conversation.transferred', actor, {
      conversationId: id,
      destination,
      assignedUserId: assignee?.id,
    });
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

  private async findEligibleUser(
    area: 'commercial' | 'technical' | 'on_call',
  ): Promise<Pick<AppUser, 'id' | 'name'> | undefined> {
    const users = await this.request<Array<Pick<AppUser, 'id' | 'name'>>>(
      `app_users?area=eq.${area}&active=is.true&select=id,name&order=created_at.asc&limit=1`,
      {},
      [200],
    );
    if (users[0]) return users[0];
    if (area === 'on_call') {
      const technical = await this.request<Array<Pick<AppUser, 'id' | 'name'>>>(
        'app_users?area=eq.technical&active=is.true&select=id,name&order=created_at.asc&limit=1',
        {},
        [200],
      );
      return technical[0];
    }
    return undefined;
  }

  private async findOrCreateConversation(
    contactId: string,
    reopenRequested = false,
    reuseLatestClosed = false,
  ): Promise<StoredConversation> {
    const existing = await this.request<
      Array<StoredConversation & { assigned_operator?: string | null }>
    >(
      `conversations?contact_id=eq.${encodeURIComponent(contactId)}&state=not.in.(closed)&select=id,state,route,context,assigned_operator`,
      {},
      [200],
    );
    if (existing.length > 0)
      return { ...existing[0], assignedOperator: existing[0].assigned_operator ?? null };

    if (reopenRequested || reuseLatestClosed) {
      const closed = await this.request<
        Array<StoredConversation & { assigned_operator?: string | null }>
      >(
        `conversations?contact_id=eq.${encodeURIComponent(contactId)}&state=eq.closed&select=id,state,route,context,assigned_operator&order=updated_at.desc&limit=1`,
        {},
        [200],
      );
      if (closed[0] && reopenRequested) {
        await this.request(
          `conversations?id=eq.${encodeURIComponent(closed[0].id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              state: 'queued',
              assigned_operator: null,
              resolution_note: null,
            }),
          },
          [204],
        );
        return { ...closed[0], state: 'queued', assignedOperator: null };
      }
      if (closed[0]) return { ...closed[0], assignedOperator: closed[0].assigned_operator ?? null };
    }

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
    const url = new URL(`/rest/v1/${path}`, this.url);
    const attempts = !init.method || init.method === 'GET' ? 2 : 1;
    let response: Response | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        response = await fetch(url, {
          ...init,
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        break;
      } catch (error) {
        if (attempt + 1 < attempts && isTimeout(error)) continue;
        if (isTimeout(error)) {
          const unavailable = new Error(
            'O banco de dados demorou para responder. Tente novamente em instantes.',
          );
          Object.assign(unavailable, { statusCode: 503 });
          throw unavailable;
        }
        throw error;
      }
    }
    if (!response) throw new Error('Não foi possível consultar o banco de dados.');
    if (response.status === 409) return undefined as T;
    if (!success.includes(response.status))
      throw new Error(`Supabase request failed (${response.status}).`);
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }

  private async uploadPrivateObject(
    path: string,
    mediaType: string,
    content: Uint8Array,
  ): Promise<void> {
    await this.uploadObject('protocol-attachments', path, mediaType, content);
  }

  private async uploadObject(
    bucket: string,
    path: string,
    mediaType: string,
    content: Uint8Array,
  ): Promise<void> {
    const response = await fetch(new URL(`/storage/v1/object/${bucket}/${path}`, this.url), {
      method: 'POST',
      headers: {
        apikey: this.serviceKey,
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': mediaType,
        'x-upsert': 'false',
      },
      body: Buffer.from(content),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(`Não foi possível salvar o arquivo privado (${response.status}).`);
  }
}

function isReopenRequest(value?: string): boolean {
  return /^(reabrir|reabra|ainda preciso de ajuda|preciso de ajuda novamente)$/i.test(
    value?.trim() ?? '',
  );
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'anexo';
}

function defaultMediaType(type: IncomingMedia['type']): string {
  return {
    image: 'image/jpeg',
    audio: 'audio/ogg',
    video: 'video/mp4',
    document: 'application/octet-stream',
  }[type];
}
