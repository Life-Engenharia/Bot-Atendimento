import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadEnvironment, type Environment } from './config/env.js';
import { SupabaseConversationStore } from './infra/supabase/conversation-store.js';
import type { OperationalConfigurationStore } from './modules/internal_operations/application/administrative-menu-service.js';
import { adminDashboardHtml } from './modules/internal_operations/presentation/admin-dashboard.js';

export type AdminAppDependencies = {
  environment?: Environment;
  operationalConfigurationStore?: OperationalConfigurationStore;
};

const settingKeySchema = z.enum([
  'responsaveis',
  'escalas',
  'horarios',
  'roteamento',
  'prioridades',
  'privacidade',
]);
const settingValuesSchema = z.object({ values: z.array(z.record(z.string(), z.string())) });

export function buildAdminApp(dependencies: AdminAppDependencies = {}): FastifyInstance {
  const environment = dependencies.environment ?? loadEnvironment();
  const store =
    dependencies.operationalConfigurationStore ??
    (environment.SUPABASE_URL && environment.SUPABASE_API
      ? new SupabaseConversationStore(environment.SUPABASE_URL, environment.SUPABASE_API)
      : undefined);
  const app = Fastify({ logger: environment.NODE_ENV !== 'test' });

  app.get('/health', async () => ({ status: 'ok', service: 'admin' }));
  app.get('/', async (_request, reply) => {
    if (!store || !environment.ADMIN_DASHBOARD_TOKEN)
      return reply.code(503).type('text/plain').send('Painel administrativo não configurado.');
    return reply.type('text/html; charset=utf-8').send(adminDashboardHtml);
  });
  app.get('/api/admin/settings', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!store) return reply.code(503).send({ error: 'Painel administrativo não configurado.' });
    return store.listSettings();
  });
  app.put<{ Params: { key: string }; Body: unknown }>('/api/admin/settings/:key', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!store) return reply.code(503).send({ error: 'Painel administrativo não configurado.' });
    const key = settingKeySchema.parse(request.params.key);
    const { values } = settingValuesSchema.parse(request.body);
    await store.replaceSetting(key, values, 'admin-dashboard');
    return reply.code(204).send();
  });
  return app;
}

function authorizeDashboard(authorization: string | undefined, token: string | undefined): boolean {
  return Boolean(token && authorization === `Bearer ${token}`);
}
