import { describe, expect, it } from 'vitest';
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
    expect(response.json()).toEqual({ status: 'ok' });
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
});
