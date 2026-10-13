import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadEnvironment, type Environment } from './config/env.js';
import { configureDevelopmentRequestLogging, logController, loggerOptions } from './config/logger.js';
import { SupabaseConversationStore } from './infra/supabase/conversation-store.js';
import type { OperationalConfigurationStore } from './modules/internal_operations/application/administrative-menu-service.js';
import { adminDashboardHtml } from './modules/internal_operations/presentation/admin-dashboard.js';
import { SmtpEmailSender, smtpConfigurationFromSettings } from './infra/email/smtp-email-sender.js';

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
  'email',
]);
const settingValuesSchema = z.object({ values: z.array(z.record(z.string(), z.string())) });
const smtpSettingSchema = z.object({
  host: z.string().trim().min(3).max(253).regex(/^[a-z0-9.-]+$/i),
  port: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65_535)).transform(String),
  security: z.enum(['starttls', 'ssl', 'none']),
  user: z.string().trim().email(),
  from: z.string().trim().email(),
});
const emailTestSchema = z.object({ to: z.string().trim().email() });
const emailSendSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000),
});

export function buildAdminApp(dependencies: AdminAppDependencies = {}): FastifyInstance {
  const environment = dependencies.environment ?? loadEnvironment();
  const store =
    dependencies.operationalConfigurationStore ??
    (environment.SUPABASE_URL && environment.SUPABASE_API
      ? new SupabaseConversationStore(environment.SUPABASE_URL, environment.SUPABASE_API)
      : undefined);
  const app = Fastify({
    logger: loggerOptions(environment),
    logController: logController(environment),
  });
  configureDevelopmentRequestLogging(app, environment);

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
    if (key === 'email') {
      if (values.length !== 1) throw new Error('A configuração SMTP deve conter uma única conta de envio.');
      smtpSettingSchema.parse(values[0]);
    }
    await store.replaceSetting(key, values, 'admin-dashboard');
    return reply.code(204).send();
  });
  app.post<{ Body: unknown }>('/api/admin/email/test', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!store) return reply.code(503).send({ error: 'Painel administrativo não configurado.' });
    if (!environment.SMTP_PASSWORD)
      return reply.code(503).send({ error: 'Defina SMTP_PASSWORD no ambiente seguro antes de testar o envio.' });
    const { to } = emailTestSchema.parse(request.body);
    const configuration = await smtpConfigurationFromSettings(store, environment.SMTP_PASSWORD);
    if (!configuration)
      return reply.code(422).send({ error: 'Preencha e salve a configuração SMTP no painel antes de testar.' });
    await new SmtpEmailSender(configuration).send({
      to,
      subject: 'Teste de envio - Life Engenharia',
      text: 'Este é um teste de envio SMTP realizado pela Central de Atendimento Life Engenharia.',
    });
    return reply.code(202).send({ accepted: true });
  });
  app.post<{ Body: unknown }>('/api/admin/email/send', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!store) return reply.code(503).send({ error: 'Painel administrativo não configurado.' });
    if (!environment.SMTP_PASSWORD)
      return reply.code(503).send({ error: 'Defina SMTP_PASSWORD no ambiente seguro antes de enviar.' });
    const message = emailSendSchema.parse(request.body);
    const configuration = await smtpConfigurationFromSettings(store, environment.SMTP_PASSWORD);
    if (!configuration)
      return reply.code(422).send({ error: 'Preencha e salve a configuração SMTP no painel antes de enviar.' });
    await new SmtpEmailSender(configuration).send(message);
    return reply.code(202).send({ accepted: true });
  });
  return app;
}

function authorizeDashboard(authorization: string | undefined, token: string | undefined): boolean {
  return Boolean(token && authorization === `Bearer ${token}`);
}
