import { describe, expect, it } from 'vitest';
import { buildAdminApp } from '../../src/admin-app.js';
import type {
  OperationalConfigurationStore,
  OperationalSetting,
} from '../../src/modules/internal_operations/application/administrative-menu-service.js';

class ConfigurationStore implements OperationalConfigurationStore {
  values: OperationalSetting[] = [];

  async appendSetting(setting: OperationalSetting): Promise<void> {
    this.values.push(setting);
  }

  async listSettings(): Promise<OperationalSetting[]> {
    return this.values;
  }

  async replaceSetting(
    key: OperationalSetting['key'],
    values: Record<string, string>[],
  ): Promise<void> {
    this.values = [...this.values.filter((item) => item.key !== key), ...values.map((value) => ({ key, value }))];
  }
}

const environment = {
  NODE_ENV: 'test' as const,
  PORT: 3000,
  WHATSAPP_VERIFY_TOKEN: 'local-development-token',
  ADMIN_DASHBOARD_TOKEN: 'a'.repeat(24),
};

describe('admin app', () => {
  it('keeps the administrative API behind the dashboard token and persists priority rules', async () => {
    const store = new ConfigurationStore();
    const app = buildAdminApp({ environment, operationalConfigurationStore: store });

    await expect(app.inject('/api/admin/settings')).resolves.toMatchObject({ statusCode: 401 });
    await expect(
      app.inject({
        method: 'PUT',
        url: '/api/admin/settings/prioridades',
        headers: { authorization: `Bearer ${environment.ADMIN_DASHBOARD_TOKEN}` },
        payload: {
          values: [
            {
              prioridade: 'P1',
              criterio: 'Risco imediato',
              acao: 'Acionar plantão',
              confirmacaoMinutos: '5',
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ statusCode: 204 });

    const response = await app.inject({
      url: '/api/admin/settings',
      headers: { authorization: `Bearer ${environment.ADMIN_DASHBOARD_TOKEN}` },
    });
    expect(response.json()).toEqual([
      {
        key: 'prioridades',
        value: {
          prioridade: 'P1',
          criterio: 'Risco imediato',
          acao: 'Acionar plantão',
          confirmacaoMinutos: '5',
        },
      },
    ]);
  });

  it('validates and persists SMTP settings without accepting a password in the dashboard', async () => {
    const store = new ConfigurationStore();
    const app = buildAdminApp({ environment, operationalConfigurationStore: store });
    const headers = { authorization: `Bearer ${environment.ADMIN_DASHBOARD_TOKEN}` };

    await expect(
      app.inject({
        method: 'PUT',
        url: '/api/admin/settings/email',
        headers,
        payload: {
          values: [
            {
              host: 'smtp.life.eng.br',
              port: '587',
              security: 'none',
              user: 'informatica@life.eng.br',
              from: 'informatica@life.eng.br',
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ statusCode: 204 });

    await expect(
      app.inject({ method: 'POST', url: '/api/admin/email/test', headers, payload: { to: 'teste@life.eng.br' } }),
    ).resolves.toMatchObject({ statusCode: 503 });

    expect(store.values).toEqual([
      {
        key: 'email',
        value: {
          host: 'smtp.life.eng.br',
          port: '587',
          security: 'none',
          user: 'informatica@life.eng.br',
          from: 'informatica@life.eng.br',
        },
      },
    ]);
  });
});
