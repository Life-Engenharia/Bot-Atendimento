import { describe, expect, it } from 'vitest';
import { createHmac, scryptSync } from 'node:crypto';
import { buildApp } from '../../src/app.js';
import type {
  OperationalConfigurationStore,
  OperationalSetting,
} from '../../src/modules/internal_operations/application/administrative-menu-service.js';

class FakeOperationalConfigurationStore implements OperationalConfigurationStore {
  settings: OperationalSetting[] = [];

  async appendSetting(setting: OperationalSetting): Promise<void> {
    this.settings.push(setting);
  }

  async listSettings(): Promise<OperationalSetting[]> {
    return this.settings;
  }

  async replaceSetting(
    key: OperationalSetting['key'],
    values: Record<string, string>[],
  ): Promise<void> {
    this.settings = [
      ...this.settings.filter((setting) => setting.key !== key),
      ...values.map((value) => ({ key, value })),
    ];
  }
}

describe('application foundation', () => {
  it('reports a healthy service', async () => {
    const app = buildApp({
      environment: { NODE_ENV: 'test', PORT: 3000, WHATSAPP_VERIFY_TOKEN: 'test-token-123' },
    });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'whatsapp-api' });
    expect(response.json().timestamp).toEqual(expect.any(String));
    await app.close();
  });

  it('serves the OpenAPI contract through Swagger', async () => {
    const app = buildApp({
      environment: { NODE_ENV: 'test', PORT: 3000, WHATSAPP_VERIFY_TOKEN: 'test-token-123' },
    });
    const response = await app.inject({ method: 'GET', url: '/documentation/json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      openapi: '3.1.0',
      info: { title: 'Bot Atendimento Life API' },
    });
    await app.close();
  });

  it('serves the protected admin dashboard and persists dashboard configuration', async () => {
    const store = new FakeOperationalConfigurationStore();
    const app = buildApp({
      environment: {
        NODE_ENV: 'test',
        PORT: 3000,
        WHATSAPP_VERIFY_TOKEN: 'test-token-123',
        ADMIN_DASHBOARD_TOKEN: 'dashboard-token-with-at-least-24-characters',
      },
      operationalConfigurationStore: store,
    });
    const dashboard = await app.inject({ method: 'GET', url: '/admin' });
    const denied = await app.inject({ method: 'GET', url: '/api/admin/settings' });
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings/responsaveis',
      headers: { authorization: 'Bearer dashboard-token-with-at-least-24-characters' },
      payload: { values: [{ nome: 'Ana', telefone: '5511999999999', area: 'comercial' }] },
    });
    const loaded = await app.inject({
      method: 'GET',
      url: '/api/admin/settings',
      headers: { authorization: 'Bearer dashboard-token-with-at-least-24-characters' },
    });

    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain('Configuração operacional');
    expect(denied.statusCode).toBe(401);
    expect(saved.statusCode).toBe(204);
    expect(loaded.json()).toEqual([
      { key: 'responsaveis', value: { nome: 'Ana', telefone: '5511999999999', area: 'comercial' } },
    ]);
    await app.close();
  });

  it('verifies the webhook, presents the initial menu and ignores a duplicate Meta message', async () => {
    const app = buildApp({
      environment: { NODE_ENV: 'test', PORT: 3000, WHATSAPP_VERIFY_TOKEN: 'test-token-123' },
    });
    const verification = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-token-123&hub.challenge=challenge-42',
    });
    const firstDelivery = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'wamid-1', from: '5511999999999', text: 'Olá' }] },
    });
    const duplicateDelivery = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'wamid-1', from: '5511999999999', text: 'Olá' }] },
    });

    expect(verification.body).toBe('challenge-42');
    expect(firstDelivery.json()).toMatchObject({
      processed: 1,
      duplicates: 0,
      responses: [{ state: 'CONSENT' }],
    });
    expect(duplicateDelivery.json()).toMatchObject({ processed: 0, duplicates: 1 });
    await app.close();
  });

  it('offers the route menu after consent and sends human requests to handoff', async () => {
    const app = buildApp({
      environment: { NODE_ENV: 'test', PORT: 3000, WHATSAPP_VERIFY_TOKEN: 'test-token-123' },
    });
    await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'menu-1', from: '5511999999999', text: 'Olá' }] },
    });
    const route = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'menu-2', from: '5511999999999', text: '1' }] },
    });
    const human = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'menu-3', from: '5511999999999', text: '3' }] },
    });

    expect(route.json()).toMatchObject({
      responses: [{ state: 'ROUTE', text: expect.stringContaining('Como posso te ajudar hoje?') }],
    });
    expect(human.json()).toMatchObject({
      responses: [{ state: 'HANDOFF_HUMANO', text: expect.stringContaining('encaminhar') }],
    });
    await app.close();
  });

  it('shows every commercial service and starts collection after selection', async () => {
    const app = buildApp({
      environment: { NODE_ENV: 'test', PORT: 3000, WHATSAPP_VERIFY_TOKEN: 'test-token-123' },
    });
    await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'commercial-1', from: '5511988888888', text: 'Olá' }] },
    });
    await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'commercial-2', from: '5511988888888', text: '1' }] },
    });
    const services = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'commercial-3', from: '5511988888888', text: '1' }] },
    });
    const selection = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { messages: [{ id: 'commercial-4', from: '5511988888888', text: '2' }] },
    });

    expect(services.json()).toMatchObject({
      responses: [
        { state: 'COMMERCIAL_SERVICE_MENU', text: expect.stringContaining('Calibração') },
      ],
    });
    expect(selection.json()).toMatchObject({
      responses: [{ state: 'COMMERCIAL_COLLECTING', text: expect.stringContaining('PMOC') }],
    });
    await app.close();
  });

  it('accepts a signed official Meta payload, normalizes it and sends the bot response', async () => {
    const sent: Array<{ to: string; body: string }> = [];
    const secret = 'meta-app-secret';
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'wamid.official-1', from: '5511999999999', text: { body: 'Olá' } },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
    const app = buildApp({
      environment: {
        NODE_ENV: 'test',
        PORT: 3000,
        WHATSAPP_VERIFY_TOKEN: 'test-token-123',
        META_APP_SECRET: secret,
      },
      outboundSender: {
        sendText: async (to, body) => {
          sent.push({ to, body });
          return { messageId: 'wamid.outbound-1' };
        },
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ processed: 1, responses: [{ state: 'CONSENT' }] });
    expect(sent).toEqual([
      { to: '5511999999999', body: expect.stringContaining('assistente virtual') },
    ]);
    await app.close();
  });

  it('rejects an official Meta payload with an invalid signature', async () => {
    const app = buildApp({
      environment: {
        NODE_ENV: 'test',
        PORT: 3000,
        WHATSAPP_VERIFY_TOKEN: 'test-token-123',
        META_APP_SECRET: 'meta-app-secret',
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' },
      payload: { object: 'whatsapp_business_account', entry: [] },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects an invalid webhook payload without processing a message', async () => {
    const app = buildApp({
      environment: { NODE_ENV: 'test', PORT: 3000, WHATSAPP_VERIFY_TOKEN: 'test-token-123' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { event: 'not-a-meta-webhook' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'Payload do webhook Meta inválido.' });
    await app.close();
  });

  it('rejects webhook bodies above one megabyte', async () => {
    const app = buildApp({
      environment: { NODE_ENV: 'test', PORT: 3000, WHATSAPP_VERIFY_TOKEN: 'test-token-123' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ messages: [], padding: 'x'.repeat(1_048_576) }),
    });

    expect(response.statusCode).toBe(413);
    await app.close();
  });

  it('protects operator actions by role and records a claim through the operator API', async () => {
    const passwordHash = `salt:${scryptSync('correct-password', 'salt', 64).toString('hex')}`;
    const conversation = {
      id: 'conversation-1',
      state: 'queued' as const,
      route: 'commercial' as const,
      assignedOperator: null,
      contactPhone: '5511999999999',
      contactName: 'Contato de teste',
      updatedAt: new Date().toISOString(),
      destinationArea: 'commercial',
      handoffReason: null,
      suggestedPriority: 'P3' as const,
      followUpAt: null,
      context: {},
      messages: [],
      notes: [],
      attachments: [],
    };
    let claimedBy: string | undefined;
    let assignedOperator: string | null = null;
    let conversationState: 'queued' | 'closed' = 'queued';
    let closeCalls = 0;
    const store = {
      findUserByEmail: async () => ({
        id: 'operator-1',
        name: 'Ana Operadora',
        email: 'ana@life.test',
        passwordHash,
        role: 'commercial' as const,
        area: 'commercial' as const,
        active: true,
      }),
      listOperatorConversations: async () => [
        { ...conversation, state: conversationState, assignedOperator },
      ],
      getOperatorConversation: async () => ({
        ...conversation,
        state: conversationState,
        assignedOperator,
      }),
      claimConversation: async (_id: string, operator: string) => {
        claimedBy = operator;
        assignedOperator = operator;
        return true;
      },
      closeConversation: async () => {
        closeCalls += 1;
      },
      audit: async () => undefined,
    };
    const app = buildApp({
      environment: {
        NODE_ENV: 'test',
        PORT: 3000,
        WHATSAPP_VERIFY_TOKEN: 'test-token-123',
        ADMIN_DASHBOARD_TOKEN: 'dashboard-token-with-at-least-24-characters',
      },
      supabaseStore: store as never,
      outboundSender: {
        sendText: async () => {
          throw new Error('Meta WhatsApp API request failed (400).');
        },
        sendButtons: async () => {
          throw new Error('Meta WhatsApp API request failed (400).');
        },
      },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/operator/login',
      payload: { email: 'ana@life.test', password: 'correct-password' },
    });
    const token = login.json().token as string;
    const list = await app.inject({
      method: 'GET',
      url: '/api/operator/conversations',
      headers: { authorization: `Bearer ${token}` },
    });
    const claim = await app.inject({
      method: 'POST',
      url: '/api/operator/conversations/conversation-1/claim',
      headers: { authorization: `Bearer ${token}` },
    });
    const transfer = await app.inject({
      method: 'POST',
      url: '/api/operator/conversations/conversation-1/transfer',
      headers: { authorization: `Bearer ${token}` },
      payload: { destination: 'technical' },
    });
    const closeNotificationFailed = await app.inject({
      method: 'POST',
      url: '/api/operator/conversations/conversation-1/close',
      headers: { authorization: `Bearer ${token}` },
      payload: { resolutionNote: 'Atendimento resolvido e validado.' },
    });
    conversationState = 'closed';
    const closeAgain = await app.inject({
      method: 'POST',
      url: '/api/operator/conversations/conversation-1/close',
      headers: { authorization: `Bearer ${token}` },
      payload: { resolutionNote: 'Atendimento resolvido e validado.' },
    });

    expect(login.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(claim.statusCode).toBe(204);
    expect(claimedBy).toBe('Ana Operadora');
    expect(transfer.statusCode).toBe(403);
    expect(closeNotificationFailed.statusCode).toBe(502);
    expect(closeNotificationFailed.json().error).toContain('continua aberto');
    expect(closeAgain.statusCode).toBe(409);
    expect(closeCalls).toBe(0);
    await app.close();
  });
});
