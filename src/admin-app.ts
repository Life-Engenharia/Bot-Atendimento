import Fastify, { type FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { loadEnvironment, type Environment } from './config/env.js';
import { configureDevelopmentRequestLogging, logController, loggerOptions } from './config/logger.js';
import { SupabaseConversationStore } from './infra/supabase/conversation-store.js';
import type { OperationalConfigurationStore } from './modules/internal_operations/application/administrative-menu-service.js';
import { enhancedAdminDashboardHtml } from './modules/internal_operations/presentation/admin-dashboard-enhancements.js';
import { SmtpEmailSender, smtpConfigurationFromSettings } from './infra/email/smtp-email-sender.js';
import type { OperationalDocument } from './infra/supabase/conversation-store.js';

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
const documentUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mediaType: z.string().trim().min(1).max(120),
  contentBase64: z.string().min(1).max(11_200_000),
  category: z.enum(['on_call_schedule', 'procedure', 'commercial', 'technical', 'policy', 'other']),
  confidence: z.enum(['high', 'medium', 'needs_review']),
  summary: z.string().trim().min(3).max(500),
  status: z.enum(['ready', 'needs_review']),
  onCallDate: z.string().trim().max(120).optional(),
  onCallMembers: z.string().trim().max(500).optional(),
});

export function buildAdminApp(dependencies: AdminAppDependencies = {}): FastifyInstance {
  const environment = dependencies.environment ?? loadEnvironment();
  const supabaseStore =
    environment.SUPABASE_URL && environment.SUPABASE_API
      ? new SupabaseConversationStore(environment.SUPABASE_URL, environment.SUPABASE_API)
      : undefined;
  const store = dependencies.operationalConfigurationStore ?? supabaseStore;
  const app = Fastify({
    logger: loggerOptions(environment),
    logController: logController(environment),
    bodyLimit: 12 * 1024 * 1024,
  });
  configureDevelopmentRequestLogging(app, environment);
  app.addHook('onRequest', async (request, reply) => {
    if (!environment.IAP_REQUIRED || !request.url.startsWith('/api/admin/')) return;
    const identity = request.headers['x-goog-authenticated-user-email'];
    const email = typeof identity === 'string' ? identity.replace(/^accounts\.google\.com:/, '').toLowerCase() : '';
    const allowed = (environment.IAP_ALLOWED_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!email || (allowed.length > 0 && !allowed.includes(email))) return reply.code(403).send({ error: 'Acesso corporativo IAP não autorizado.' });
    const user = supabaseStore ? await supabaseStore.findUserByEmail(email) : undefined;
    if (!user?.active || !['admin', 'coordination'].includes(user.role))
      return reply.code(403).send({ error: 'Sua conta corporativa não possui permissão para a central.' });
  });

  app.get('/health', async () => ({ status: 'ok', service: 'admin' }));
  app.get('/assets/life-logo.png', async (_request, reply) =>
    reply.type('image/png').send(await readFile(fileURLToPath(new URL('./public/life-logo.png', import.meta.url)))),
  );
  app.get('/', async (_request, reply) => {
    if (!store || !environment.ADMIN_DASHBOARD_TOKEN)
      return reply.code(503).type('text/plain').send('Painel administrativo não configurado.');
    return reply.type('text/html; charset=utf-8').send(enhancedAdminDashboardHtml());
  });
  app.get('/api/admin/settings', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!store) return reply.code(503).send({ error: 'Painel administrativo não configurado.' });
    return store.listSettings();
  });
  app.get('/api/admin/documents', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Biblioteca de documentos não configurada.' });
    return supabaseStore.listOperationalDocuments();
  });
  app.get('/api/admin/overview', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN)) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    return supabaseStore.getOperationalOverview();
  });
  app.post('/api/admin/jobs/alerts', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN)) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    return supabaseStore.refreshOperationalAlerts();
  });
  app.get('/api/admin/alerts', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN)) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    return supabaseStore.listOperationalAlerts();
  });
  app.post<{ Params: { id: string } }>('/api/admin/alerts/:id/resolve', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN)) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    await supabaseStore.resolveOperationalAlert(request.params.id, 'admin-dashboard'); return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>('/api/admin/documents/:id/publish-on-call', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN)) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    await supabaseStore.setCurrentOnCallSchedule(request.params.id, 'admin-dashboard'); return reply.code(204).send();
  });
  app.post<{ Body: unknown }>('/api/admin/documents', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Biblioteca de documentos não configurada.' });
    const document = documentUploadSchema.parse(request.body);
    const content = Buffer.from(document.contentBase64, 'base64');
    if (!content.length || content.length > 8 * 1024 * 1024)
      return reply.code(413).send({ error: 'Envie arquivos de até 8 MB.' });
    const { contentBase64: _contentBase64, ...metadata } = document;
    const saved = await supabaseStore.saveOperationalDocument({ ...metadata, sizeBytes: content.byteLength, content });
    return reply.code(201).send(saved satisfies OperationalDocument);
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
