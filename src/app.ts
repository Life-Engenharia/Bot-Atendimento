import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { loadEnvironment, Environment } from './config/env.js';
import {
  configureDevelopmentRequestLogging,
  logController,
  loggerOptions,
  logCorrelation,
} from './config/logger.js';
import { InMemoryAuditLog } from './modules/audit/audit-log.js';
import { MenuService } from './modules/conversations/application/menu-service.js';
import { PersistedMenuService } from './modules/conversations/application/persisted-menu-service.js';
import {
  WebhookProcessor,
  IncomingMessage,
} from './modules/webhook/application/webhook-processor.js';
import { SupabaseConversationStore } from './infra/supabase/conversation-store.js';
import { classifyOperationalDocument } from './infra/openai/operational-document-classifier.js';
import { AdministrativeMenuService } from './modules/internal_operations/application/administrative-menu-service.js';
import { OpenAiTriageClient } from './infra/openai/openai-triage-client.js';
import { OpenAiResponseRefiner } from './infra/openai/openai-response-refiner.js';
import { OpenAiMediaAnalyzer } from './infra/openai/openai-media-analyzer.js';
import { MediaIngestionService } from './modules/conversations/application/media-ingestion-service.js';
import { WhatsAppCloudClient } from './infra/meta/whatsapp-cloud-client.js';
import {
  isValidMetaSignature,
  normalizeMetaDeliveryStatuses,
  normalizeMetaWebhook,
} from './infra/meta/whatsapp-cloud-adapter.js';
import type { OutboundSender } from './modules/conversations/application/persisted-menu-service.js';
import type {
  OperationalConfigurationStore,
  OperationalSetting,
} from './modules/internal_operations/application/administrative-menu-service.js';
import { enhancedAdminDashboardHtml } from './modules/internal_operations/presentation/admin-dashboard-enhancements.js';
import { operatorInboxHtml } from './modules/internal_operations/presentation/operator-inbox.js';
import type { AppRole, AppUser } from './infra/supabase/conversation-store.js';
import { PloomesClient } from './infra/ploomes/ploomes-client.js';
import { CommercialPloomesSyncService } from './infra/ploomes/commercial-sync-service.js';
import { SmtpEmailSender, smtpConfigurationFromSettings } from './infra/email/smtp-email-sender.js';
import { OperationalNotifier } from './modules/internal_operations/application/operational-notifier.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export type AppDependencies = {
  environment?: Environment;
  auditLog?: InMemoryAuditLog;
  webhookProcessor?: WebhookProcessor;
  menuService?: MenuService;
  persistedMenuService?: PersistedMenuService;
  operationalConfigurationStore?: OperationalConfigurationStore;
  outboundSender?: OutboundSender;
  /** Permite exercitar o painel de operação sem uma conexão real no Supabase. */
  supabaseStore?: SupabaseConversationStore;
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
  host: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9.-]+$/i),
  port: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65_535))
    .transform(String),
  security: z.enum(['starttls', 'ssl', 'none']),
  user: z.string().trim().email(),
  from: z.string().trim().email(),
});
const operatorMessageSchema = z.object({ text: z.string().trim().min(1).max(4_000) });
const operatorNoteSchema = z.object({ text: z.string().trim().min(1).max(2_000) });
const followUpSchema = z.object({ followUpAt: z.string().datetime() });
const closeConversationSchema = z.object({ resolutionNote: z.string().trim().min(3).max(2_000) });
const manualPloomesSchema = z.object({ ploomesId: z.string().trim().min(1).max(120) });
const manualServiceOrderSchema = z.object({
  serviceOrderNumber: z.string().trim().min(1).max(120),
});
const transferSchema = z.object({
  destination: z.enum(['commercial', 'technical', 'on_call', 'coordination']),
});
const userSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(12).max(200),
  role: z.enum(['admin', 'coordination', 'commercial', 'technical', 'on_call', 'viewer']),
  area: z.enum(['commercial', 'technical', 'on_call', 'coordination']),
  active: z.boolean().default(true),
});
const emailTestSchema = z.object({ to: z.string().trim().email() });
const emailSendSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000),
});
const retentionJobSchema = z.object({
  dryRun: z.boolean().default(true),
  conversationDays: z.number().int().min(30).max(3_650).default(180),
  attachmentDays: z.number().int().min(7).max(3_650).default(90),
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

export function buildApp(dependencies: AppDependencies = {}): FastifyInstance {
  const environment = dependencies.environment ?? loadEnvironment();
  const auditLog = dependencies.auditLog ?? new InMemoryAuditLog();
  const webhookProcessor = dependencies.webhookProcessor ?? new WebhookProcessor(auditLog);
  const menuService = dependencies.menuService ?? new MenuService(auditLog);
  const supabaseStore =
    dependencies.supabaseStore ??
    (environment.SUPABASE_URL && environment.SUPABASE_API
      ? new SupabaseConversationStore(environment.SUPABASE_URL, environment.SUPABASE_API)
      : undefined);
  const operationalConfigurationStore = dependencies.operationalConfigurationStore ?? supabaseStore;
  const administrativeMenu =
    operationalConfigurationStore && environment.ADMIN_PHONE_E164
      ? new AdministrativeMenuService(environment.ADMIN_PHONE_E164, operationalConfigurationStore)
      : undefined;
  const triageAnalyzer =
    environment.OPENAI_API_KEY && environment.OPENAI_MODEL
      ? new OpenAiTriageClient(environment.OPENAI_API_KEY, environment.OPENAI_MODEL)
      : undefined;
  const responseRefiner =
    environment.OPENAI_API_KEY && environment.OPENAI_MODEL
      ? new OpenAiResponseRefiner(environment.OPENAI_API_KEY, environment.OPENAI_MODEL)
      : undefined;
  const whatsappClient =
    environment.META_ACCESS_TOKEN && environment.WHATSAPP_PHONE_NUMBER_ID
      ? new WhatsAppCloudClient(environment.META_ACCESS_TOKEN, environment.WHATSAPP_PHONE_NUMBER_ID)
      : undefined;
  const outboundSender = dependencies.outboundSender ?? whatsappClient;
  const operationalNotifier = supabaseStore
    ? new OperationalNotifier(supabaseStore, outboundSender, {
        commercial: environment.COMMERCIAL_NOTIFICATION_PHONE_E164,
        technical: environment.TECHNICAL_NOTIFICATION_PHONE_E164,
      })
    : undefined;
  const mediaIngestionService = supabaseStore
    ? new MediaIngestionService(
        supabaseStore,
        whatsappClient,
        environment.OPENAI_API_KEY && environment.OPENAI_MODEL
          ? new OpenAiMediaAnalyzer(
              environment.OPENAI_API_KEY,
              environment.OPENAI_MODEL,
              environment.OPENAI_TRANSCRIPTION_MODEL ?? 'gpt-4o-mini-transcribe',
            )
          : undefined,
      )
    : undefined;
  const persistedMenuService =
    dependencies.persistedMenuService ??
    (supabaseStore
      ? new PersistedMenuService(
          supabaseStore,
          administrativeMenu,
          triageAnalyzer,
          outboundSender,
          responseRefiner,
          mediaIngestionService,
          operationalNotifier,
          () => operatorEvents.emit('inbox'),
          operationalConfigurationStore,
        )
      : undefined);
  const commercialSyncService =
    supabaseStore && environment.PLOOMES_USER_KEY
      ? new CommercialPloomesSyncService(
          supabaseStore,
          new PloomesClient(environment.PLOOMES_USER_KEY),
        )
      : undefined;
  const app = Fastify({
    logger: loggerOptions(environment),
    logController: logController(environment),
    // O painel administrativo aceita documentos de até 8 MB; o endpoint valida o limite menor.
    bodyLimit: 12 * 1024 * 1024,
  });
  const operatorEvents = new EventEmitter();
  operatorEvents.setMaxListeners(0);
  let webhookDrainScheduled = false;
  const drainWebhookQueue = async () => {
    if (!supabaseStore || !persistedMenuService) return;
    for (;;) {
      // Processa pequenos lotes em paralelo para que uma chamada externa lenta
      // (OpenAI, Supabase ou Meta) não segure todos os demais atendimentos.
      // A fila do banco continua garantindo que cada mensagem seja processada
      // uma única vez; o limite baixo evita sobrecarregar as APIs.
      const jobs = await supabaseStore.claimWebhookJobs(4);
      if (!jobs.length) return;
      // Mensagens de contatos diferentes podem rodar juntas, mas as do mesmo
      // contato precisam manter a ordem (ex.: menu -> seleção do serviço).
      const groups = new Map<string, typeof jobs>();
      for (const job of jobs) {
        const key = job.message.from;
        const group = groups.get(key) ?? [];
        group.push(job);
        groups.set(key, group);
      }
      await Promise.all(
        [...groups.values()].map(async (group) => {
          for (const job of group) {
            try {
              const result = await persistedMenuService.process([job.message]);
              if (result.processed > 0) operatorEvents.emit('inbox');
              await supabaseStore.completeWebhookJob(job.id);
            } catch (error) {
              await supabaseStore.failWebhookJob(job.id, error);
              app.log.error({ err: error, jobId: job.id }, 'webhook_job_failed');
            }
          }
        }),
      );
    }
  };
  const scheduleWebhookDrain = () => {
    if (webhookDrainScheduled || !supabaseStore || !persistedMenuService) return;
    webhookDrainScheduled = true;
    setImmediate(() => {
      void drainWebhookQueue()
        .catch((error) => app.log.error({ err: error }, 'webhook_queue_drain_failed'))
        .finally(() => {
          webhookDrainScheduled = false;
        });
    });
  };
  configureDevelopmentRequestLogging(app, environment);
  app.addHook('onRequest', async (request, reply) => {
    if (!environment.IAP_REQUIRED || !request.url.startsWith('/api/admin/')) return;
    const identity = request.headers['x-goog-authenticated-user-email'];
    const email =
      typeof identity === 'string'
        ? identity.replace(/^accounts\.google\.com:/, '').toLowerCase()
        : '';
    const allowed = (environment.IAP_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!email || (allowed.length > 0 && !allowed.includes(email)))
      return reply.code(403).send({ error: 'Acesso corporativo IAP não autorizado.' });
    const user = supabaseStore ? await supabaseStore.findUserByEmail(email) : undefined;
    if (!user?.active || !['admin', 'coordination'].includes(user.role))
      return reply
        .code(403)
        .send({ error: 'Sua conta corporativa não possui permissão para a central.' });
  });
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    request.rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch {
      done(new Error('JSON inválido.'));
    }
  });
  const openApiPath = fileURLToPath(new URL('../docs/api/openapi.yaml', import.meta.url));

  app.register(fastifySwagger, {
    mode: 'static',
    specification: {
      path: openApiPath,
      baseDir: dirname(openApiPath),
    },
  });
  app.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: { docExpansion: 'list', deepLinking: false },
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/assets/life-logo.png', async (_request, reply) =>
    reply
      .type('image/png')
      .send(await readFile(fileURLToPath(new URL('./public/life-logo.png', import.meta.url)))),
  );

  app.get('/admin', async (_request, reply) => {
    if (!operationalConfigurationStore || !environment.ADMIN_DASHBOARD_TOKEN)
      return reply.code(503).type('text/plain').send('Dashboard administrativa não configurada.');
    return reply.type('text/html; charset=utf-8').send(enhancedAdminDashboardHtml());
  });

  app.get('/api/admin/settings', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!operationalConfigurationStore)
      return reply.code(503).send({ error: 'Dashboard administrativa não configurada.' });
    return operationalConfigurationStore.listSettings();
  });

  app.put<{ Params: { key: string }; Body: unknown }>(
    '/api/admin/settings/:key',
    async (request, reply) => {
      if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
        return reply.code(401).send({ error: 'Não autorizado.' });
      if (!operationalConfigurationStore)
        return reply.code(503).send({ error: 'Dashboard administrativa não configurada.' });
      const key = settingKeySchema.parse(request.params.key);
      const { values } = settingValuesSchema.parse(request.body);
      if (key === 'email') {
        if (values.length !== 1)
          throw new Error('A configuração SMTP deve conter uma única conta de envio.');
        smtpSettingSchema.parse(values[0]);
      }
      await operationalConfigurationStore.replaceSetting(key, values, 'admin-dashboard');
      return reply.code(204).send();
    },
  );

  app.get('/api/admin/users', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel não configurado.' });
    const users = await supabaseStore.listUsers();
    return users.map(({ passwordHash: _passwordHash, ...user }) => user);
  });

  app.get('/api/admin/documents', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore)
      return reply.code(503).send({ error: 'Biblioteca de documentos não configurada.' });
    return supabaseStore.listOperationalDocuments();
  });

  app.get('/api/admin/overview', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    return supabaseStore.getOperationalOverview();
  });
  app.get('/api/admin/health', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    return supabaseStore.getOperationalHealth();
  });

  app.post('/api/admin/jobs/alerts', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    const result = await supabaseStore.refreshOperationalAlerts();
    await sendOperationalAlertEmail(
      result.created,
      supabaseStore,
      operationalConfigurationStore,
      environment,
    );
    return result;
  });
  app.get('/api/admin/alerts', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    return supabaseStore.listOperationalAlerts();
  });
  app.post<{ Params: { id: string } }>('/api/admin/alerts/:id/resolve', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
    await supabaseStore.resolveOperationalAlert(request.params.id, 'admin-dashboard');
    return reply.code(204).send();
  });
  app.post<{ Params: { id: string } }>(
    '/api/admin/documents/:id/publish-on-call',
    async (request, reply) => {
      if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
        return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore) return reply.code(503).send({ error: 'Operação não configurada.' });
      await supabaseStore.setCurrentOnCallSchedule(request.params.id, 'admin-dashboard');
      return reply.code(204).send();
    },
  );

  app.post<{ Body: unknown }>('/api/admin/documents', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore)
      return reply.code(503).send({ error: 'Biblioteca de documentos não configurada.' });
    const document = documentUploadSchema.parse(request.body);
    const content = Buffer.from(document.contentBase64, 'base64');
    if (!content.length || content.length > 8 * 1024 * 1024)
      return reply.code(413).send({ error: 'Envie arquivos de até 8 MB.' });
    const { contentBase64: _contentBase64, ...metadata } = document;
    const insight = await classifyOperationalDocument(
      environment.OPENAI_API_KEY,
      environment.OPENAI_MODEL,
      { fileName: metadata.fileName, mediaType: metadata.mediaType, content },
    );
    const classified =
      insight && (metadata.category === 'other' || insight.confidence === 'high')
        ? {
            ...metadata,
            ...insight,
            onCallDate: metadata.onCallDate ?? insight.onCallDate,
            onCallMembers: metadata.onCallMembers ?? insight.onCallMembers,
          }
        : metadata;
    return reply.code(201).send(
      await supabaseStore.saveOperationalDocument({
        ...classified,
        sizeBytes: content.byteLength,
        content,
      }),
    );
  });

  app.post<{ Body: unknown }>('/api/admin/users', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel não configurado.' });
    const user = userSchema.parse(request.body);
    await supabaseStore.createUser({ ...user, passwordHash: hashPassword(user.password) });
    return reply.code(201).send({ created: true });
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/admin/users/:id',
    async (request, reply) => {
      if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
        return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore) return reply.code(503).send({ error: 'Painel não configurado.' });
      const user = userSchema.pick({ role: true, area: true, active: true }).parse(request.body);
      await supabaseStore.updateUser(request.params.id, user);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/operator/conversations/:id/reopen',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor || actor.role === 'viewer')
        return reply.code(403).send({ error: 'Seu perfil não pode reabrir atendimentos.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation || !canAccessConversation(actor, conversation.destinationArea))
        return reply.code(403).send({ error: 'Seu cargo não pode acessar esta conversa.' });
      if (conversation.state !== 'closed')
        return reply.code(409).send({ error: 'Somente atendimentos concluídos podem ser reabertos.' });
      await supabaseStore.reopenConversation(conversation.id, actor.name);
      logCorrelation(app, {
        requestId: request.id,
        conversationId: conversation.id,
        action: 'operator.conversation_reopened',
      });
      operatorEvents.emit('inbox');
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/admin/users/:id/password',
    async (request, reply) => {
      if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
        return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore) return reply.code(503).send({ error: 'Painel não configurado.' });
      const body = z.object({ password: z.string().min(8).max(128) }).parse(request.body);
      await supabaseStore.updateUserPassword(request.params.id, hashPassword(body.password));
      return reply.code(204).send();
    },
  );

  app.post<{ Body: unknown }>('/api/admin/email/test', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!operationalConfigurationStore)
      return reply.code(503).send({ error: 'Dashboard administrativa não configurada.' });
    if (!environment.SMTP_PASSWORD)
      return reply
        .code(503)
        .send({ error: 'Defina SMTP_PASSWORD no ambiente seguro antes de testar o envio.' });

    const { to } = emailTestSchema.parse(request.body);
    const configuration = await smtpConfigurationFromSettings(
      operationalConfigurationStore,
      environment.SMTP_PASSWORD,
    );
    if (!configuration)
      return reply
        .code(422)
        .send({ error: 'Preencha e salve a configuração SMTP no painel antes de testar.' });

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
    if (!operationalConfigurationStore)
      return reply.code(503).send({ error: 'Dashboard administrativa não configurada.' });
    if (!environment.SMTP_PASSWORD)
      return reply
        .code(503)
        .send({ error: 'Defina SMTP_PASSWORD no ambiente seguro antes de enviar.' });

    const message = emailSendSchema.parse(request.body);
    const configuration = await smtpConfigurationFromSettings(
      operationalConfigurationStore,
      environment.SMTP_PASSWORD,
    );
    if (!configuration)
      return reply
        .code(422)
        .send({ error: 'Preencha e salve a configuração SMTP no painel antes de enviar.' });

    await new SmtpEmailSender(configuration).send(message);
    return reply.code(202).send({ accepted: true });
  });

  app.post('/api/admin/jobs/ploomes-sync', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!commercialSyncService)
      return reply.code(503).send({ error: 'Ploomes ou banco de dados ainda não configurado.' });
    return commercialSyncService.run();
  });

  app.post('/api/admin/jobs/escalations', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore)
      return reply.code(503).send({ error: 'Banco de dados ainda não configurado.' });
    return supabaseStore.runDueEscalations();
  });

  app.post<{ Body: unknown }>('/api/admin/jobs/retention', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore || !operationalConfigurationStore)
      return reply.code(503).send({ error: 'Banco de dados ainda não configurado.' });
    const job = retentionJobSchema.parse(request.body ?? {});
    const privacySettings = await operationalConfigurationStore.listSettings();
    const approved = privacySettings.some(
      (setting) =>
        setting.key === 'privacidade' &&
        setting.value.approved === 'true' &&
        Boolean(setting.value.approvedAt) &&
        Boolean(setting.value.approvedBy),
    );
    if (!job.dryRun && !approved)
      return reply.code(409).send({
        error: 'A exclusão requer uma política LGPD aprovada, com data e responsável registrados.',
      });
    const result = await supabaseStore.runRetention(job);
    logCorrelation(app, {
      requestId: request.id,
      action: job.dryRun ? 'retention.simulated' : 'retention.executed',
    });
    return { ...result, dryRun: job.dryRun };
  });

  app.post<{ Body: unknown }>('/api/operator/login', async (request, reply) => {
    if (!supabaseStore || !environment.ADMIN_DASHBOARD_TOKEN)
      return reply.code(503).send({ error: 'Painel não configurado.' });
    const body = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(request.body);
    const user = await supabaseStore.findUserByEmail(body.email);
    if (!user || !user.active || !verifyPassword(body.password, user.passwordHash))
      return reply.code(401).send({ error: 'E-mail ou senha inválidos.' });
    return { token: signSession(user, environment.ADMIN_DASHBOARD_TOKEN), user: publicUser(user) };
  });

  app.get('/api/operator/crm/metrics', async (request, reply) => {
    const actor = readOperatorSession(
      request.headers.authorization,
      environment.ADMIN_DASHBOARD_TOKEN,
    );
    if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!['admin', 'coordination', 'commercial'].includes(actor.role))
      return reply.code(403).send({ error: 'Seu cargo não tem acesso às métricas comerciais.' });
    if (!environment.PLOOMES_USER_KEY)
      return { connected: false, reason: 'Integração Ploomes ainda não configurada.' };
    try {
      const metrics = await new PloomesClient(environment.PLOOMES_USER_KEY).getCommercialMetrics();
      return { connected: true, metrics };
    } catch {
      return reply.code(502).send({
        error: 'Não foi possível consultar o Ploomes agora. A fila local continua disponível.',
      });
    }
  });

  app.get('/api/operator/crm/overview', async (request, reply) => {
    const actor = readOperatorSession(
      request.headers.authorization,
      environment.ADMIN_DASHBOARD_TOKEN,
    );
    if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!['admin', 'coordination', 'commercial'].includes(actor.role))
      return reply.code(403).send({ error: 'Seu cargo não tem acesso ao CRM comercial.' });
    if (!environment.PLOOMES_USER_KEY)
      return { connected: false, reason: 'Integração Ploomes ainda não configurada.' };
    try {
      return {
        connected: true,
        overview: await new PloomesClient(environment.PLOOMES_USER_KEY).getCommercialOverview(),
      };
    } catch {
      return reply
        .code(502)
        .send({ error: 'Não foi possível consultar o Ploomes agora. Tente atualizar novamente.' });
    }
  });

  app.get('/operator', async (_request, reply) => {
    if (process.env.OPERATOR_WEB_URL) return reply.redirect(process.env.OPERATOR_WEB_URL);
    if (!supabaseStore || !environment.ADMIN_DASHBOARD_TOKEN)
      return reply.code(503).type('text/plain').send('Painel de atendimento não configurado.');
    const enhancements = `<style>
      .commercial.active{display:block;grid-column:2/-1}
      .history-tools{display:flex;gap:6px;margin-top:7px}.history-tools button{flex:1}
      .history-state{margin:8px 0 0;color:#607583;font-size:11px}
    </style><script>
      (()=>{
        const token=()=>sessionStorage.getItem('operatorToken');
        const fetchHistory=async()=>{
          const response=await fetch('/api/operator/conversations?includeClosed=true',{headers:{Authorization:'Bearer '+token()}});
          if(!response.ok)throw Error('Não foi possível carregar o histórico.');
          return (await response.json()).filter(item=>item.state==='closed');
        };
        const renderHistory=async()=>{
          const list=document.getElementById('list'), title=document.querySelector('.queue-head h1');
          title.firstChild.textContent='Histórico de atendimentos ';
          list.innerHTML='<li class="meta" style="padding:10px">Carregando atendimentos encerrados…</li>';
          try{
            const rows=await fetchHistory(); list.innerHTML='';
            if(!rows.length){list.innerHTML='<li class="meta" style="padding:10px">Nenhum atendimento encerrado ainda.</li>';return}
            rows.forEach(c=>{const item=document.createElement('li');item.className='item';item.innerHTML='<strong>'+String(c.contactName||c.contactPhone).replace(/[&<>"\\']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]))+'</strong><div class="meta"><span>Encerrado em '+new Date(c.updatedAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})+'</span></div>';item.onclick=async()=>{await window.open(c.id);document.getElementById('composer').classList.add('hidden');document.getElementById('claim').classList.add('hidden');document.getElementById('more').classList.add('hidden');document.getElementById('orientation').textContent='Atendimento encerrado — histórico somente para consulta'};list.append(item)})
          }catch(error){list.innerHTML='<li class="meta" style="padding:10px">'+error.message+'</li>'}
        };
        const active=()=>{document.querySelector('.queue-head h1').firstChild.textContent='Fila humana ';document.getElementById('composer').classList.remove('hidden');document.getElementById('claim').classList.remove('hidden');document.getElementById('more').classList.remove('hidden');document.getElementById('refresh').click()};
        const tools=document.createElement('div');tools.className='history-tools';tools.innerHTML='<button type="button" class="btn alt">Fila ativa</button><button type="button" class="btn alt">Histórico</button>';
        tools.children[0].onclick=active;tools.children[1].onclick=renderHistory;document.querySelector('.queue-head .tools').after(tools);
        const commercialNav=document.getElementById('commercialNav');
        const remarketingNav=document.createElement('button');
        remarketingNav.id='remarketingNav';remarketingNav.dataset.view='remarketing';remarketingNav.className='hidden';remarketingNav.innerHTML='<span>Remarketing</span>';
        commercialNav.after(remarketingNav);
        const remarketingView=document.createElement('main');
        remarketingView.id='remarketingView';remarketingView.className='commercial';
        remarketingView.innerHTML='<div class="commercial-head"><div><p class="eyebrow">Relacionamento</p><h1>Remarketing</h1><p class="muted">Mensagens prontas para retomar conversas e oportunidades que não avançaram.</p></div></div><div class="crm-layout"><section class="panel"><h2>Primeiro retorno</h2><button class="record remarketing-copy" data-copy="Olá, {{nome}}! Tudo bem? Aqui é da Life Engenharia. Ficamos à disposição para retomar sua solicitação e esclarecer qualquer dúvida."><b>Retomar o contato</b><span>Para quem pediu informações e não avançou.</span></button><button class="record remarketing-copy" data-copy="Olá, {{nome}}! Passando para saber se ainda podemos ajudar com sua demanda. Podemos ajustar a proposta ao momento da sua operação."><b>Oportunidade sem fechamento</b><span>Para propostas sem retorno.</span></button><button class="record remarketing-copy" data-copy="Olá, {{nome}}! A Life Engenharia segue à disposição. Se houver uma nova necessidade, podemos avaliar o melhor caminho para sua operação."><b>Relacionamento pós-proposta</b><span>Mensagem leve para manter o vínculo.</span></button></section><section class="panel"><h2>Uso responsável</h2><div style="padding:16px" class="muted">Revise o nome, o contexto e a autorização de contato antes de enviar. As mensagens são modelos: personalize-as para cada cliente.</div></section></div>';
        document.getElementById('app').append(remarketingView);
        const editor=document.createElement('section');editor.className='panel';editor.id='remarketingEditor';editor.innerHTML='<h2>Mensagem selecionada</h2><div style="padding:16px"><label class="field">Personalize antes de copiar<textarea id="remarketingText" rows="7" placeholder="Escolha um modelo à esquerda."></textarea></label><button id="copyRemarketing" type="button" class="btn" style="margin-top:12px">Copiar mensagem</button><p id="remarketingFeedback" class="muted" style="font-size:11px"></p></div>';remarketingView.querySelector('.crm-layout').append(editor);
        const addCommercialBlocks=async()=>{
          const root=document.getElementById('crmContent');if(!root||root.dataset.operationalBlocks)return;
          if(!root.querySelector('.crm-summary'))return;
          root.dataset.operationalBlocks='loading';
          let operational=[];
          try{const response=await fetch('/api/operator/conversations',{headers:{Authorization:'Bearer '+token()}});if(response.ok)operational=await response.json()}catch{}
          if(root.dataset.operationalBlocks!=='loading')return;
          root.dataset.operationalBlocks='true';
          const leads=operational.filter(x=>x.route==='commercial'||x.destinationArea==='commercial').slice(0,8);
          const returns=operational.filter(x=>x.followUpAt).sort((a,b)=>new Date(a.followUpAt)-new Date(b.followUpAt)).slice(0,8);
          const item=(x,kind)=>'<button class="record"><b>'+String(x.contactName||x.contactPhone||'Contato sem nome').replace(/[&<>"\\']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]))+'</b><span>'+(kind==='lead'?'Origem: Bot · '+(x.handoffReason||'interesse comercial'):'Retorno: '+new Date(x.followUpAt).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}))+'</span></button>';
          root.insertAdjacentHTML('beforeend','<div class="crm-layout"><section class="panel"><h2>Leads do Bot</h2>'+(leads.map(x=>item(x,'lead')).join('')||'<p class="muted" style="padding:16px">Nenhum lead recente do bot.</p>')+'</section><section class="panel"><h2>Retornos</h2>'+(returns.map(x=>item(x,'return')).join('')||'<p class="muted" style="padding:16px">Nenhum retorno agendado.</p>')+'</section></div>');
          const operationalBlocks=root.lastElementChild, ploomesLayout=root.querySelector('.crm-layout');ploomesLayout.before(operationalBlocks);
          try{
            const crmResponse=await fetch('/api/operator/crm/overview',{headers:{Authorization:'Bearer '+token()}});const crm=await crmResponse.json();if(!crm.connected)return;
            const layouts=root.querySelectorAll('.crm-layout'), panels=layouts[1]?.querySelectorAll('.panel');if(!panels)return;
            const safe=value=>String(value||'Não informado').replace(/[&<>"\\']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));const formatMoney=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(value)||0);
            const documentNumber=c=>String(c.CPF||c.Cpf||c.CNPJ||c.Cnpj||c.Document||c.TaxNumber||'').replace(/\\D/g,'');const person=c=>Boolean(c.CPF||c.Cpf)||documentNumber(c).length===11||(!c.CompanyName&&!c.LegalName&&!c.TradeName&&Boolean(c.Name));const contacts=crm.overview.contacts.slice(0,10);panels[0].innerHTML='<h2>Recentes no Ploomes · contatos</h2>'+contacts.map(c=>{const individual=person(c),company=c.CompanyName||c.LegalName||c.TradeName,name=c.ContactName||c.PersonName||c.Name,responsible=individual?'':(name&&name!==company?name:'Não informado'),place=[c.Address,c.Street,c.City,c.State,c.ZipCode].filter(Boolean).join(' · '),search=[company,name,documentNumber(c),place].join(' ').toLowerCase();return '<button class="record ploomes-record" data-search="'+safe(search)+'" data-place="'+safe(place)+'"><b>'+safe(individual?name:company)+'</b><span>'+(individual?'Pessoa física · CPF: '+safe(documentNumber(c)):'Empresa · CNPJ: '+safe(documentNumber(c)))+(individual?'':' · Responsável: '+safe(responsible))+'</span></button>'}).join('')||'<p class="muted" style="padding:16px">Nenhum contato recente.</p>';
            const deals=crm.overview.deals.slice(0,10);panels[1].innerHTML='<h2>Recentes no Ploomes · oportunidades</h2>'+deals.map(d=>'<button class="record ploomes-record" data-search="'+safe([d.Title,d.Name,d.Stage?.Name,d.StageName].join(' ').toLowerCase())+'"><b>'+safe(d.Title||d.Name)+'</b><span>'+safe(d.Stage?.Name||d.StageName)+' · '+formatMoney(d.Amount)+'</span></button>').join('')||'<p class="muted" style="padding:16px">Nenhuma oportunidade recente.</p>';
            const places=[...new Set(contacts.map(c=>[c.Address,c.Street,c.City,c.State].filter(Boolean).join(' · ')).filter(Boolean))].slice(0,30), toolbar=document.createElement('section');toolbar.className='panel';toolbar.style.marginTop='18px';toolbar.innerHTML='<div style="padding:14px 16px"><label class="field" style="margin:0">Pesquisar no Ploomes<input id="ploomesSearch" type="search" placeholder="Empresa, responsável, CPF, CNPJ ou oportunidade"></label><label class="field">Pesquisar locais<input id="ploomesLocationSearch" type="search" list="ploomesPlaces" placeholder="Cidade, estado ou endereço disponível no Ploomes"></label><datalist id="ploomesPlaces">'+places.map(place=>'<option value="'+safe(place)+'">').join('')+'</datalist><p id="ploomesSearchResult" class="muted" style="margin:8px 0 0;font-size:11px">Sugestões de locais são baseadas nos endereços registrados no Ploomes.</p></div>';
            layouts[1].before(toolbar);const filterRecords=()=>{const general=document.getElementById('ploomesSearch').value.toLowerCase(),place=document.getElementById('ploomesLocationSearch').value.toLowerCase();let count=0;root.querySelectorAll('.ploomes-record').forEach(record=>{const visible=record.dataset.search.includes(general)&&String(record.dataset.place||'').toLowerCase().includes(place);record.classList.toggle('hidden',!visible);if(visible)count++});document.getElementById('ploomesSearchResult').textContent=count+' registro(s) encontrado(s). Sugestões de locais usam os endereços registrados no Ploomes.'};document.getElementById('ploomesSearch').oninput=filterRecords;document.getElementById('ploomesLocationSearch').oninput=filterRecords;
          }catch{}
        };
        new MutationObserver(addCommercialBlocks).observe(document.getElementById('crmContent'),{childList:true,subtree:true});
        remarketingNav.onclick=()=>{document.getElementById('queuePanel').classList.add('hidden');document.getElementById('queueView').classList.add('hidden');document.getElementById('commercialView').classList.remove('active');remarketingView.classList.add('active');document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b===remarketingNav))};
        commercialNav.addEventListener('click',()=>remarketingView.classList.remove('active'));
        document.querySelector('[data-view="queue"]').addEventListener('click',()=>remarketingView.classList.remove('active'));
        document.querySelectorAll('.remarketing-copy').forEach(button=>button.onclick=()=>{document.getElementById('remarketingText').value=button.dataset.copy;document.getElementById('remarketingFeedback').textContent='Personalize o nome e revise a mensagem antes de copiar.'});
        document.getElementById('copyRemarketing').onclick=async()=>{const text=document.getElementById('remarketingText').value.trim(),feedback=document.getElementById('remarketingFeedback');if(!text){feedback.textContent='Escolha um modelo ou escreva uma mensagem.';return}try{await navigator.clipboard.writeText(text);feedback.textContent='Mensagem copiada. Revise o destinatário antes de enviar.'}catch{feedback.textContent='Selecione e copie o texto manualmente; seu navegador bloqueou a cópia automática.';document.getElementById('remarketingText').focus();document.getElementById('remarketingText').select()}};
        const restoreSession=async()=>{
          const savedToken=sessionStorage.getItem('operatorToken'), name=sessionStorage.getItem('operatorName'), role=sessionStorage.getItem('operatorRole');
          if(!savedToken||!name||!role)return;
          document.getElementById('accountName').textContent=name;
          document.getElementById('accountRole').textContent=role+' · disponível para atender';
          document.getElementById('commercialNav').classList.toggle('hidden',!['admin','coordination','commercial'].includes(role));
          remarketingNav.classList.toggle('hidden',!['admin','coordination','commercial'].includes(role));
          try{
            await window.load();
            window.connectLiveUpdates?.();
            document.getElementById('login').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
          }catch{
            sessionStorage.clear();
          }
        };
        restoreSession();
      })();
    </script>`;
    return reply
      .type('text/html; charset=utf-8')
      .send(operatorInboxHtml.replace('</body>', `${enhancements}</body>`));
  });

  app.get('/api/operator/events', async (request, reply) => {
    const actor = readOperatorSession(
      request.headers.authorization,
      environment.ADMIN_DASHBOARD_TOKEN,
    );
    if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    reply.raw.write('event: connected\ndata: {}\n\n');
    const sendRefresh = () => reply.raw.write('event: inbox\ndata: {}\n\n');
    const keepAlive = setInterval(() => reply.raw.write(': keep-alive\n\n'), 25_000);
    operatorEvents.on('inbox', sendRefresh);
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      operatorEvents.off('inbox', sendRefresh);
    });
  });

  app.get<{ Querystring: { includeClosed?: string } }>(
    '/api/operator/conversations',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      return supabaseStore.listOperatorConversations(
        visibleAreas(actor),
        request.query.includeClosed === 'true',
      );
    },
  );

  app.get<{ Params: { id: string } }>('/api/operator/conversations/:id', async (request, reply) => {
    const actor = readOperatorSession(
      request.headers.authorization,
      environment.ADMIN_DASHBOARD_TOKEN,
    );
    if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore)
      return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: 'Conversa não encontrada.' });
    return canAccessConversation(actor, conversation.destinationArea)
      ? conversation
      : reply.code(403).send({ error: 'Seu cargo não pode acessar esta fila.' });
  });

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/api/operator/conversations/:id/attachments/:attachmentId/url',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation || !canAccessConversation(actor, conversation.destinationArea))
        return reply.code(403).send({ error: 'Seu cargo não pode acessar este anexo.' });
      const url = await supabaseStore.createAttachmentSignedUrl(
        conversation.id,
        request.params.attachmentId,
      );
      return url
        ? { url, expiresInSeconds: 300 }
        : reply.code(404).send({ error: 'Anexo não disponível para visualização.' });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/operator/conversations/:id/claim',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      if (actor.role === 'viewer')
        return reply.code(403).send({ error: 'Seu perfil é somente consulta.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation || !canAccessConversation(actor, conversation.destinationArea))
        return reply.code(403).send({ error: 'Seu cargo não pode assumir esta fila.' });
      const claimed = await supabaseStore.claimConversation(request.params.id, actor.name);
      if (!claimed) return reply.code(409).send({ error: 'Esta conversa já foi assumida.' });
      logCorrelation(app, {
        requestId: request.id,
        conversationId: conversation.id,
        action: 'operator.conversation_claimed',
      });
      const handoffMessage = `Estamos passando para um atendimento humanizado. ${actor.name} assume a conversa e já pode ajudar você.`;
      if (outboundSender) {
        try {
          const delivery = await outboundSender.sendText(conversation.contactPhone, handoffMessage);
          await supabaseStore.saveOutbound(conversation.id, handoffMessage, {
            messageId: delivery.messageId,
            status: 'sent',
          });
        } catch {
          await supabaseStore.audit('conversation.handoff_notification_failed', actor.name, {
            conversationId: conversation.id,
          });
        }
      }
      operatorEvents.emit('inbox');
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/operator/conversations/:id/release',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      if (actor.role === 'viewer')
        return reply.code(403).send({ error: 'Seu perfil é somente consulta.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation || !canAccessConversation(actor, conversation.destinationArea))
        return reply.code(403).send({ error: 'Seu cargo não pode alterar esta fila.' });
      const released = await supabaseStore.releaseConversation(request.params.id, actor.name);
      if (released)
        logCorrelation(app, {
          requestId: request.id,
          conversationId: conversation.id,
          action: 'operator.conversation_released',
        });
      if (released) operatorEvents.emit('inbox');
      return released
        ? reply.code(204).send()
        : reply.code(409).send({ error: 'A conversa não está atribuída a você.' });
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/operator/conversations/:id/commercial/manual-ploomes',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      if (!['admin', 'coordination', 'commercial'].includes(actor.role))
        return reply
          .code(403)
          .send({ error: 'Somente o Comercial pode confirmar o lançamento manual.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (
        !conversation ||
        conversation.destinationArea !== 'commercial' ||
        !conversation.protocolId
      )
        return reply.code(404).send({ error: 'Oportunidade comercial não encontrada.' });
      const { ploomesId } = manualPloomesSchema.parse(request.body);
      await supabaseStore.registerManualPloomes(
        conversation.id,
        conversation.protocolId,
        actor.name,
        ploomesId,
      );
      operatorEvents.emit('inbox');
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/operator/conversations/:id/commercial/sync-ploomes',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore || !commercialSyncService)
        return reply.code(503).send({ error: 'Ploomes ainda não está configurado.' });
      if (!['admin', 'coordination', 'commercial'].includes(actor.role))
        return reply
          .code(403)
          .send({ error: 'Somente o Comercial pode sincronizar uma oportunidade.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (
        !conversation ||
        conversation.destinationArea !== 'commercial' ||
        !conversation.protocolId
      )
        return reply.code(404).send({ error: 'Oportunidade comercial não encontrada.' });
      const result = await commercialSyncService.runProtocol(conversation.protocolId);
      if (!result.processed)
        return reply
          .code(409)
          .send({ error: 'Esta oportunidade já foi sincronizada ou não possui pendência.' });
      operatorEvents.emit('inbox');
      return result.failed
        ? reply.code(502).send({
            error:
              'O Ploomes não confirmou a inclusão. A pendência foi mantida para nova tentativa.',
          })
        : reply.code(201).send({ synced: true });
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/operator/conversations/:id/technical/manual-service-order',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      if (!['admin', 'coordination', 'technical', 'on_call'].includes(actor.role))
        return reply
          .code(403)
          .send({ error: 'Somente a Assistência pode confirmar a abertura manual da OS.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (
        !conversation ||
        !['technical', 'on_call'].includes(conversation.destinationArea ?? '') ||
        !conversation.protocolId
      )
        return reply.code(404).send({ error: 'Chamado técnico não encontrado.' });
      if (
        conversation.assignedOperator !== actor.name &&
        !['admin', 'coordination'].includes(actor.role)
      )
        return reply.code(409).send({ error: 'Assuma o chamado antes de registrar a OS.' });
      const { serviceOrderNumber } = manualServiceOrderSchema.parse(request.body);
      await supabaseStore.registerManualServiceOrder(
        conversation.id,
        conversation.protocolId,
        actor.name,
        serviceOrderNumber,
      );
      operatorEvents.emit('inbox');
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/operator/conversations/:id/transfer',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      if (!['admin', 'coordination'].includes(actor.role))
        return reply
          .code(403)
          .send({ error: 'Somente Administração ou Coordenação pode transferir entre setores.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation) return reply.code(404).send({ error: 'Conversa não encontrada.' });
      const { destination } = transferSchema.parse(request.body);
      await supabaseStore.transferConversation(conversation.id, destination, actor.name);
      operatorEvents.emit('inbox');
      logCorrelation(app, {
        requestId: request.id,
        conversationId: conversation.id,
        action: 'operator.conversation_transferred',
      });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/operator/conversations/:id/notes',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor || actor.role === 'viewer')
        return reply.code(403).send({ error: 'Seu perfil não pode adicionar notas.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation || !canAccessConversation(actor, conversation.destinationArea))
        return reply.code(403).send({ error: 'Seu cargo não pode acessar esta conversa.' });
      await supabaseStore.addOperatorNote(
        conversation.id,
        actor.name,
        operatorNoteSchema.parse(request.body).text,
      );
      logCorrelation(app, {
        requestId: request.id,
        conversationId: conversation.id,
        action: 'operator.note_added',
      });
      operatorEvents.emit('inbox');
      return reply.code(201).send({ created: true });
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/operator/conversations/:id/follow-up',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor || actor.role === 'viewer')
        return reply.code(403).send({ error: 'Seu perfil não pode agendar retornos.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation || !canAccessConversation(actor, conversation.destinationArea))
        return reply.code(403).send({ error: 'Seu cargo não pode acessar esta conversa.' });
      await supabaseStore.scheduleFollowUp(
        conversation.id,
        actor.name,
        followUpSchema.parse(request.body).followUpAt,
      );
      logCorrelation(app, {
        requestId: request.id,
        conversationId: conversation.id,
        action: 'operator.follow_up_scheduled',
      });
      operatorEvents.emit('inbox');
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/operator/conversations/:id/close',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor || actor.role === 'viewer')
        return reply.code(403).send({ error: 'Seu perfil não pode encerrar atendimentos.' });
      if (!supabaseStore)
        return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation || !canAccessConversation(actor, conversation.destinationArea))
        return reply.code(403).send({ error: 'Seu cargo não pode acessar esta conversa.' });
      if (
        conversation.assignedOperator !== actor.name &&
        !['admin', 'coordination'].includes(actor.role)
      )
        return reply.code(409).send({ error: 'Assuma a conversa antes de encerrá-la.' });
      const { resolutionNote } = closeConversationSchema.parse(request.body);
      await supabaseStore.closeConversation(conversation.id, actor.name, resolutionNote);
      const completionMessage = `Seu atendimento${conversation.protocolId ? ` ${conversation.protocolId}` : ''} foi concluído pela equipe Life.\n\nResumo: ${resolutionNote}\n\nA equipe responsável foi informada e o registro foi encerrado. A solução atendeu sua necessidade?`;
      if (outboundSender) {
        try {
          const delivery = outboundSender.sendButtons
            ? await outboundSender.sendButtons(conversation.contactPhone, completionMessage, [
                { id: 'satisfaction_resolved', title: 'Sim, resolvido' },
                { id: 'satisfaction_partial', title: 'Ainda preciso de ajuda' },
              ])
            : await outboundSender.sendText(
                conversation.contactPhone,
                `${completionMessage}\n\nResponda REABRIR se ainda precisar de ajuda.`,
              );
          await supabaseStore.saveOutbound(conversation.id, completionMessage, {
            messageId: delivery.messageId,
            status: 'sent',
          });
        } catch {
          await supabaseStore.audit('conversation.close_notification_failed', actor.name, {
            conversationId: conversation.id,
          });
        }
      }
      logCorrelation(app, {
        requestId: request.id,
        conversationId: conversation.id,
        action: 'operator.conversation_closed',
      });
      operatorEvents.emit('inbox');
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/api/operator/conversations/:id/messages',
    async (request, reply) => {
      const actor = readOperatorSession(
        request.headers.authorization,
        environment.ADMIN_DASHBOARD_TOKEN,
      );
      if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
      if (!supabaseStore || !outboundSender)
        return reply.code(503).send({ error: 'Envio pelo WhatsApp ainda não está configurado.' });
      if (actor.role === 'viewer')
        return reply.code(403).send({ error: 'Seu perfil é somente consulta.' });
      const conversation = await supabaseStore.getOperatorConversation(request.params.id);
      if (!conversation) return reply.code(404).send({ error: 'Conversa não encontrada.' });
      if (!canAccessConversation(actor, conversation.destinationArea))
        return reply.code(403).send({ error: 'Seu cargo não pode acessar esta fila.' });
      if (conversation.assignedOperator !== actor.name)
        return reply.code(409).send({ error: 'Assuma a conversa antes de responder.' });
      const { text } = operatorMessageSchema.parse(request.body);
      const signedText = `${actor.name}: ${text}`;
      const delivery = await outboundSender.sendText(conversation.contactPhone, signedText);
      await supabaseStore.saveOutbound(conversation.id, signedText, {
        messageId: delivery.messageId,
        status: 'sent',
      });
      await supabaseStore.audit('operator.message_sent', actor.name, {
        conversationId: conversation.id,
      });
      operatorEvents.emit('inbox');
      logCorrelation(app, {
        requestId: request.id,
        conversationId: conversation.id,
        action: 'operator.message_sent',
      });
      return reply.code(201).send({ sent: true });
    },
  );

  app.get<{
    Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string };
  }>('/webhooks/whatsapp', async (request, reply) => {
    const query = request.query;
    const valid =
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === environment.WHATSAPP_VERIFY_TOKEN;
    if (!valid || !query['hub.challenge']) {
      return reply.code(403).send({ error: 'Webhook verification failed' });
    }
    return reply.type('text/plain').send(query['hub.challenge']);
  });

  app.post<{ Body: unknown }>(
    '/webhooks/whatsapp',
    { bodyLimit: 1024 * 1024 },
    async (request, reply) => {
      if (
        environment.META_APP_SECRET &&
        !isValidMetaSignature(
          request.rawBody ?? Buffer.from(JSON.stringify(request.body)),
          typeof request.headers['x-hub-signature-256'] === 'string'
            ? request.headers['x-hub-signature-256']
            : undefined,
          environment.META_APP_SECRET,
        )
      ) {
        return reply.code(401).send({ error: 'Assinatura do webhook inválida.' });
      }
      const messages = incomingMessages(request.body);
      const deliveryStatuses = incomingDeliveryStatuses(request.body);
      if (supabaseStore && deliveryStatuses.length) {
        await Promise.allSettled(
          deliveryStatuses.map((delivery) => {
            const status = ['sent', 'delivered', 'read', 'failed'].includes(delivery.status)
              ? (delivery.status as 'sent' | 'delivered' | 'read' | 'failed')
              : 'failed';
            const error = delivery.errors
              ?.map(
                (item) => item.details ?? item.title ?? (item.code ? `Código ${item.code}` : ''),
              )
              .filter(Boolean)
              .join(' · ');
            return supabaseStore.updateMetaDeliveryStatus(delivery.id, status, error);
          }),
        );
      }
      for (const message of messages) {
        logCorrelation(app, {
          requestId: request.id,
          metaMessageId: message.id,
          action: 'webhook.message_received',
        });
      }
      if (persistedMenuService && supabaseStore) {
        try {
          const enqueued = await supabaseStore.enqueueWebhookMessages(messages);
          scheduleWebhookDrain();
          return reply.code(200).send({
            received: true,
            queued: enqueued,
            duplicates: Math.max(0, messages.length - enqueued),
            statuses: deliveryStatuses.length,
          });
        } catch (error) {
          // Uma indisponibilidade momentânea do Data API não pode travar o
          // webhook por 10s nem fazer a Meta reenviar a mesma mensagem.
          // Processa localmente como fallback; o acceptInbound continua
          // protegendo contra duplicidade quando o serviço voltar.
          app.log.error({ err: error }, 'webhook_queue_unavailable_using_fallback');
          const result = await persistedMenuService.process(messages);
          if (result.processed > 0) operatorEvents.emit('inbox');
          return reply.code(200).send({
            received: true,
            queued: 0,
            processed: result.processed,
            duplicates: result.duplicates,
            fallback: true,
            statuses: deliveryStatuses.length,
          });
        }
      }
      if (persistedMenuService) {
        const result = await persistedMenuService.process(messages);
        if (result.processed > 0) operatorEvents.emit('inbox');
        return reply.code(200).send({
          received: true,
          processed: result.processed,
          duplicates: result.duplicates,
          responses: result.responses,
          statuses: deliveryStatuses.length,
        });
      }
      const result = webhookProcessor.process(messages);
      const responses = result.acceptedMessages.map((message) =>
        menuService.handle(message.from, message.text),
      );
      if (outboundSender) {
        await Promise.allSettled(
          responses.map((response) => outboundSender.sendText(response.to, response.text)),
        );
      }
      if (result.processed > 0) operatorEvents.emit('inbox');
      return reply.code(200).send({
        received: true,
        processed: result.processed,
        duplicates: result.duplicates,
        responses,
        statuses: deliveryStatuses.length,
      });
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const message = error instanceof Error ? error.message : 'Unexpected application error';
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 400;
    return reply.code(statusCode).send({ error: message });
  });

  return app;
}

function incomingMessages(body: unknown): IncomingMessage[] {
  if (body && typeof body === 'object' && Array.isArray((body as { messages?: unknown }).messages))
    return (body as { messages: IncomingMessage[] }).messages;
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { object?: unknown }).object !== 'whatsapp_business_account' ||
    !Array.isArray((body as { entry?: unknown }).entry)
  )
    throw new Error('Payload do webhook Meta inválido.');
  return normalizeMetaWebhook(body as Parameters<typeof normalizeMetaWebhook>[0]);
}

function incomingDeliveryStatuses(body: unknown) {
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { object?: unknown }).object !== 'whatsapp_business_account'
  )
    return [];
  return normalizeMetaDeliveryStatuses(body as Parameters<typeof normalizeMetaDeliveryStatuses>[0]);
}

function authorizeDashboard(
  authorization: string | undefined,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken || !authorization?.startsWith('Bearer ')) return false;
  const received = Buffer.from(authorization.slice('Bearer '.length));
  const expected = Buffer.from(expectedToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function operatorName(value: string | string[] | undefined): string | undefined {
  const name = typeof value === 'string' ? value.trim() : '';
  return name.length >= 2 && name.length <= 100 ? name : undefined;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  const received = Buffer.from(scryptSync(password, salt, 64).toString('hex'));
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

function publicUser(user: AppUser): Omit<AppUser, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...publicData } = user;
  return publicData;
}

function signSession(user: AppUser, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      id: user.id,
      name: user.name,
      role: user.role,
      area: user.area,
      exp: Date.now() + 43_200_000,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readOperatorSession(
  authorization: string | undefined,
  secret: string | undefined,
): { id: string; name: string; role: AppRole; area: AppUser['area'] } | undefined {
  if (!secret || !authorization?.startsWith('Bearer ')) return undefined;
  const [payload, signature] = authorization.slice(7).split('.');
  if (!payload || !signature) return undefined;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer))
    return undefined;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      id?: string;
      name?: string;
      role?: AppRole;
      area?: AppUser['area'];
      exp?: number;
    };
    if (
      !value.id ||
      !value.name ||
      !value.role ||
      !value.area ||
      !value.exp ||
      value.exp < Date.now()
    )
      return undefined;
    return { id: value.id, name: value.name, role: value.role, area: value.area };
  } catch {
    return undefined;
  }
}

function visibleAreas(actor: { role: AppRole; area: AppUser['area'] }): string[] | undefined {
  if (actor.role === 'admin' || actor.role === 'coordination') return undefined;
  if (actor.role === 'on_call') return ['on_call', 'technical'];
  return [actor.area];
}

function canAccessConversation(
  actor: { role: AppRole; area: AppUser['area'] },
  destinationArea: string | null | undefined,
): boolean {
  const areas = visibleAreas(actor);
  return !areas || Boolean(destinationArea && areas.includes(destinationArea));
}

async function sendOperationalAlertEmail(
  created: number,
  supabaseStore: SupabaseConversationStore,
  store: OperationalConfigurationStore | undefined,
  environment: Environment,
): Promise<void> {
  const recipients = (environment.ALERT_NOTIFICATION_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);
  if (!created || !recipients.length || !store || !environment.SMTP_PASSWORD) return;
  const configuration = await smtpConfigurationFromSettings(store, environment.SMTP_PASSWORD);
  if (!configuration) return;
  const alerts = (await supabaseStore.listOperationalAlerts())
    .filter((alert) => alert.status === 'open')
    .slice(0, 8);
  const text = alerts.map((alert) => `• ${alert.title}: ${alert.detail}`).join('\n');
  await Promise.allSettled(
    recipients.map((to) =>
      new SmtpEmailSender(configuration).send({
        to,
        subject: 'Ação necessária · Central Life',
        text,
      }),
    ),
  );
  await supabaseStore.audit('operational.alert_notified', 'system', {
    recipients: recipients.length,
    alerts: alerts.length,
  });
}
