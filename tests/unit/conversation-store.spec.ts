import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSupabaseSignedUrl, SupabaseConversationStore, StoredConversation } from '../../src/infra/supabase/conversation-store.js';

const store = () => new SupabaseConversationStore('https://test-project.supabase.co', 'service-key');
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const empty = (status = 204) => new Response(null, { status });

afterEach(() => vi.restoreAllMocks());

describe('Supabase conversation processing resilience', () => {
  it('normalizes Supabase signed paths returned without the storage prefix', () => {
    expect(
      normalizeSupabaseSignedUrl('/object/sign/protocol-attachments/a/b.png?token=x', 'https://test-project.supabase.co'),
    ).toBe('https://test-project.supabase.co/storage/v1/object/sign/protocol-attachments/a/b.png?token=x');
    expect(
      normalizeSupabaseSignedUrl('/storage/v1/object/sign/protocol-attachments/a/b.png?token=x', 'https://test-project.supabase.co'),
    ).toBe('https://test-project.supabase.co/storage/v1/object/sign/protocol-attachments/a/b.png?token=x');
  });

  it('recovers an inbound message persisted before a prior processing failure', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/messages') && init?.method === 'POST') return json({}, 409);
      if (url.includes('/messages?meta_message_id='))
        return json([{ id: 'message-row-1', conversation_id: 'conversation-1', processed_at: null }]);
      if (url.endsWith('/contacts?on_conflict=phone_e164')) return json([{ id: 'contact-1' }], 201);
      if (url.includes('/conversations?id=eq.conversation-1&select='))
        return json([{ id: 'conversation-1', state: 'collecting', route: 'commercial', context: {} }]);
      if (url.includes('/messages?id=eq.message-row-1')) return empty();
      if (url.includes('/conversations?id=eq.conversation-1')) return empty();
      if (url.endsWith('/audit_events')) return empty(201);
      throw new Error(`Unexpected Supabase request: ${url}`);
    });

    const accepted = await store().acceptInbound({
      id: 'wamid-retry-1',
      from: '5511999999999',
      text: 'Quero um orçamento',
    });

    expect(accepted?.conversation).toMatchObject({ id: 'conversation-1', state: 'collecting' });
    expect(calls.some((call) => call.includes('/messages?meta_message_id='))).toBe(true);
    expect(calls.some((call) => call.includes('/conversations?contact_id='))).toBe(false);
  });

  it('discards only inbound messages that already have a processing checkpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/messages') && init?.method === 'POST') return json({}, 409);
      if (url.includes('/messages?meta_message_id='))
        return json([{ id: 'message-row-1', conversation_id: 'conversation-1', processed_at: '2026-10-21T12:00:00Z' }]);
      throw new Error(`Unexpected Supabase request: ${url}`);
    });

    const accepted = await store().acceptInbound({
      id: 'wamid-processed-1',
      from: '5511999999999',
      text: 'Oi',
    });

    expect(accepted).toBeUndefined();
  });

  it('saves conversation state and the inbound checkpoint through one database transaction', async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      expect(String(input)).toContain('/rpc/persist_conversation_turn');
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return empty();
    });
    const conversation: StoredConversation = {
      id: 'conversation-1',
      state: 'review',
      route: 'technical',
      context: { reportedRisk: 'sim' },
    };

    await store().saveConversationAndMarkInbound(conversation, 'wamid-1');

    expect(requestBody).toMatchObject({
      p_conversation_id: 'conversation-1',
      p_state: 'review',
      p_route: 'technical',
      p_context: { reportedRisk: 'sim' },
      p_meta_message_id: 'wamid-1',
    });
  });

  it('persists an early Meta delivery status so it can be applied when the outbound row is saved', async () => {
    const requests: Array<{ path: string; body?: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      requests.push({ path, body });
      if (path.endsWith('/rpc/record_meta_delivery_status')) return json(true);
      if (path.endsWith('/rpc/persist_outbound_message')) return empty();
      if (path.endsWith('/audit_events')) return empty(201);
      throw new Error(`Unexpected Supabase request: ${path}`);
    });

    const repository = store();
    await repository.updateMetaDeliveryStatus('wamid-outbound-early', 'read');
    await repository.saveOutbound('conversation-1', 'Olá', {
      messageId: 'wamid-outbound-early',
      status: 'sent',
    });

    expect(requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: expect.stringContaining('/rpc/record_meta_delivery_status'),
          body: expect.objectContaining({ p_meta_message_id: 'wamid-outbound-early', p_status: 'read' }),
        }),
        expect.objectContaining({
          path: expect.stringContaining('/rpc/persist_outbound_message'),
          body: expect.objectContaining({ p_meta_message_id: 'wamid-outbound-early', p_status: 'sent' }),
        }),
      ]),
    );
  });

  it('reuses the same protocol when a confirmation is retried', async () => {
    let protocolCreated = 0;
    let storedSourceMessageId: string | undefined;
    let storedCommercialNeed = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/protocols?source_message_id='))
        return json(
          protocolCreated
            ? [{ id: 'protocol-1', reference: 'LFE-20261021-ABC12345', type: 'commercial' }]
            : [],
        );
      if (url.endsWith('/protocols') && init?.method === 'POST') {
        protocolCreated += 1;
        storedSourceMessageId = (JSON.parse(String(init.body)) as { source_message_id: string })
          .source_message_id;
        return json([{ id: 'protocol-1', reference: 'LFE-20261021-ABC12345' }], 201);
      }
      if (url.includes('/commercial_requests?on_conflict=protocol_id')) {
        storedCommercialNeed = (JSON.parse(String(init?.body)) as { need: string }).need;
        return empty();
      }
      if (url.includes('/commercial_sync_jobs?on_conflict=protocol_id')) return empty();
      if (url.includes('/conversations?id=eq.conversation-1&select=contact_id'))
        return json([{ contact_id: 'contact-1' }]);
      if (url.includes('/contacts?id=eq.contact-1')) return empty();
      if (url.includes('/app_users?area=eq.commercial')) return json([]);
      if (url.includes('/conversations?id=eq.conversation-1')) return empty();
      if (url.endsWith('/audit_events')) return empty(201);
      throw new Error(`Unexpected Supabase request: ${url}`);
    });
    const conversation: StoredConversation = {
      id: 'conversation-1',
      state: 'review',
      route: 'commercial',
      context: {
        service: 'Assistência avulsa',
        location: 'Unidade Norte',
        timeline: '7 dias',
        need: 'O equipamento parou.',
        equipment: 'Chiller 25TR',
        manufacturerModel: 'Modelo X',
        symptom: 'Parou de resfriar',
        alarm: 'E3',
      },
    };

    const first = await store().createCommercialProtocol(conversation, 'wamid-confirm-1');
    const retry = await store().createCommercialProtocol(conversation, 'wamid-confirm-1');

    expect(first).toBe('LFE-20261021-ABC12345');
    expect(retry).toBe(first);
    expect(protocolCreated).toBe(1);
    expect(storedSourceMessageId).toBe('wamid-confirm-1');
    expect(storedCommercialNeed).toContain('Chiller 25TR');
    expect(storedCommercialNeed).toContain('Parou de resfriar');
  });

  it('transfers a conversation to another operator, records the reason as a note and audits it', async () => {
    const calls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ method: init?.method ?? 'GET', url, body });
      if (url.includes('/conversations?id=eq.conversation-1')) return json([{ id: 'conversation-1' }]);
      if (url.endsWith('/operator_notes') || url.endsWith('/audit_events')) return empty(201);
      throw new Error(`Unexpected Supabase request: ${url}`);
    });

    const moved = await store().transferToOperator(
      'conversation-1',
      'Ana',
      { id: 'user-2', name: 'Bruno' },
      'Cliente pediu o técnico responsável',
    );

    expect(moved).toBe(true);
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.url).toContain('state=neq.closed');
    expect(patch?.body).toMatchObject({ assigned_operator: 'Bruno', assigned_user_id: 'user-2', state: 'human' });
    const note = calls.find((call) => call.url.endsWith('/operator_notes'));
    expect(note?.body?.content).toBe('Transferido de Ana para Bruno. Motivo: Cliente pediu o técnico responsável');
    expect(calls.some((call) => call.url.endsWith('/audit_events'))).toBe(true);
  });

  it('does not transfer a closed conversation', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json([]));
    const moved = await store().transferToOperator('conversation-1', 'Ana', { id: 'u', name: 'Bruno' }, 'teste');
    expect(moved).toBe(false);
  });

  it('lists previous attendances of the same contact without the current one', async () => {
    let historyUrl = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('select=contact_id')) return json([{ contact_id: 'contact-1' }]);
      historyUrl = url;
      return json([
        {
          id: 'old-1',
          state: 'closed',
          route: 'technical',
          destination_area: 'technical',
          updated_at: '2026-09-01T10:00:00Z',
          resolution_note: 'Equipamento reiniciado',
          protocols: { id: 'LFE-000100', suggested_priority: 'P2' },
        },
      ]);
    });

    const history = await store().listContactHistory('conversation-1');

    expect(historyUrl).toContain('contact_id=eq.contact-1');
    expect(historyUrl).toContain('id=neq.conversation-1');
    expect(history).toEqual([
      {
        id: 'old-1',
        protocolId: 'LFE-000100',
        state: 'closed',
        route: 'technical',
        destinationArea: 'technical',
        priority: 'P2',
        updatedAt: '2026-09-01T10:00:00Z',
        resolutionNote: 'Equipamento reiniciado',
      },
    ]);
  });

  it('finds a failed outbound message and marks it as retried', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('direction=eq.outbound&select=')) return json([{ id: 'm1', content: 'Ana: oi', delivery_status: 'failed: x' }]);
      if (init?.method === 'PATCH') return empty();
      return empty(201);
    });

    const message = await store().getOutboundMessage('conversation-1', 'm1');
    await store().markMessageRetried('m1', 'Ana', 'conversation-1');

    expect(message).toEqual({ id: 'm1', content: 'Ana: oi', deliveryStatus: 'failed: x' });
    expect(calls.some((call) => call.startsWith('PATCH') && call.includes('messages?id=eq.m1'))).toBe(true);
  });
});
