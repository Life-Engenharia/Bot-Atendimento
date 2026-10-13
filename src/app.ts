import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { loadEnvironment, Environment } from './config/env.js';
import { configureDevelopmentRequestLogging, logController, loggerOptions } from './config/logger.js';
import { InMemoryAuditLog } from './modules/audit/audit-log.js';
import { MenuService } from './modules/conversations/application/menu-service.js';
import { PersistedMenuService } from './modules/conversations/application/persisted-menu-service.js';
import {
  WebhookProcessor,
  IncomingMessage,
} from './modules/webhook/application/webhook-processor.js';
import { SupabaseConversationStore } from './infra/supabase/conversation-store.js';
import { AdministrativeMenuService } from './modules/internal_operations/application/administrative-menu-service.js';
import { OpenAiTriageClient } from './infra/openai/openai-triage-client.js';
import { WhatsAppCloudClient } from './infra/meta/whatsapp-cloud-client.js';
import { isValidMetaSignature, normalizeMetaWebhook } from './infra/meta/whatsapp-cloud-adapter.js';
import type { OutboundSender } from './modules/conversations/application/persisted-menu-service.js';
import type {
  OperationalConfigurationStore,
  OperationalSetting,
} from './modules/internal_operations/application/administrative-menu-service.js';
import { adminDashboardHtml } from './modules/internal_operations/presentation/admin-dashboard.js';
import { operatorInboxHtml } from './modules/internal_operations/presentation/operator-inbox.js';
import type { AppRole, AppUser } from './infra/supabase/conversation-store.js';
import { PloomesClient } from './infra/ploomes/ploomes-client.js';
import { SmtpEmailSender, smtpConfigurationFromSettings } from './infra/email/smtp-email-sender.js';

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
const operatorMessageSchema = z.object({ text: z.string().trim().min(1).max(4_000) });
const operatorNoteSchema = z.object({ text: z.string().trim().min(1).max(2_000) });
const followUpSchema = z.object({ followUpAt: z.string().datetime() });
const closeConversationSchema = z.object({ resolutionNote: z.string().trim().min(3).max(2_000) });
const transferSchema = z.object({ destination: z.enum(['commercial', 'technical', 'on_call', 'coordination']) });
const userSchema = z.object({
  name: z.string().trim().min(2).max(120), email: z.string().email(), password: z.string().min(12).max(200),
  role: z.enum(['admin', 'coordination', 'commercial', 'technical', 'on_call', 'viewer']),
  area: z.enum(['commercial', 'technical', 'on_call', 'coordination']), active: z.boolean().default(true),
});
const emailTestSchema = z.object({ to: z.string().trim().email() });
const emailSendSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(10_000),
});

export function buildApp(dependencies: AppDependencies = {}): FastifyInstance {
  const environment = dependencies.environment ?? loadEnvironment();
  const auditLog = dependencies.auditLog ?? new InMemoryAuditLog();
  const webhookProcessor = dependencies.webhookProcessor ?? new WebhookProcessor(auditLog);
  const menuService = dependencies.menuService ?? new MenuService(auditLog);
  const supabaseStore =
    environment.SUPABASE_URL && environment.SUPABASE_API
      ? new SupabaseConversationStore(environment.SUPABASE_URL, environment.SUPABASE_API)
      : undefined;
  const operationalConfigurationStore = dependencies.operationalConfigurationStore ?? supabaseStore;
  const administrativeMenu =
    operationalConfigurationStore && environment.ADMIN_PHONE_E164
      ? new AdministrativeMenuService(environment.ADMIN_PHONE_E164, operationalConfigurationStore)
      : undefined;
  const triageAnalyzer =
    environment.OPENAI_API_KEY && environment.OPENAI_MODEL
      ? new OpenAiTriageClient(environment.OPENAI_API_KEY, environment.OPENAI_MODEL)
      : undefined;
  const outboundSender =
    dependencies.outboundSender ??
    (environment.META_ACCESS_TOKEN && environment.WHATSAPP_PHONE_NUMBER_ID
      ? new WhatsAppCloudClient(environment.META_ACCESS_TOKEN, environment.WHATSAPP_PHONE_NUMBER_ID)
      : undefined);
  const persistedMenuService =
    dependencies.persistedMenuService ??
    (supabaseStore
      ? new PersistedMenuService(supabaseStore, administrativeMenu, triageAnalyzer, outboundSender)
      : undefined);
  const app = Fastify({
    logger: loggerOptions(environment),
    logController: logController(environment),
    // O webhook recebe apenas eventos JSON da Meta; mídia é baixada posteriormente pela API.
    bodyLimit: 1_048_576,
  });
  configureDevelopmentRequestLogging(app, environment);
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

  app.get('/admin', async (_request, reply) => {
    if (!operationalConfigurationStore || !environment.ADMIN_DASHBOARD_TOKEN)
      return reply.code(503).type('text/plain').send('Dashboard administrativa não configurada.');
    return reply.type('text/html; charset=utf-8').send(adminDashboardHtml);
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
        if (values.length !== 1) throw new Error('A configuração SMTP deve conter uma única conta de envio.');
        smtpSettingSchema.parse(values[0]);
      }
      await operationalConfigurationStore.replaceSetting(key, values, 'admin-dashboard');
      return reply.code(204).send();
    },
  );

  app.get('/api/admin/users', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN)) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel não configurado.' });
    const users = await supabaseStore.listUsers();
    return users.map(({ passwordHash: _passwordHash, ...user }) => user);
  });

  app.post<{ Body: unknown }>('/api/admin/users', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN)) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel não configurado.' });
    const user = userSchema.parse(request.body);
    await supabaseStore.createUser({ ...user, passwordHash: hashPassword(user.password) });
    return reply.code(201).send({ created: true });
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/admin/users/:id', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN)) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel não configurado.' });
    const user = userSchema.pick({ role: true, area: true, active: true }).parse(request.body);
    await supabaseStore.updateUser(request.params.id, user);
    return reply.code(204).send();
  });

  app.post<{ Body: unknown }>('/api/admin/email/test', async (request, reply) => {
    if (!authorizeDashboard(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN))
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!operationalConfigurationStore)
      return reply.code(503).send({ error: 'Dashboard administrativa não configurada.' });
    if (!environment.SMTP_PASSWORD)
      return reply.code(503).send({ error: 'Defina SMTP_PASSWORD no ambiente seguro antes de testar o envio.' });

    const { to } = emailTestSchema.parse(request.body);
    const configuration = await smtpConfigurationFromSettings(
      operationalConfigurationStore,
      environment.SMTP_PASSWORD,
    );
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
    if (!operationalConfigurationStore)
      return reply.code(503).send({ error: 'Dashboard administrativa não configurada.' });
    if (!environment.SMTP_PASSWORD)
      return reply.code(503).send({ error: 'Defina SMTP_PASSWORD no ambiente seguro antes de enviar.' });

    const message = emailSendSchema.parse(request.body);
    const configuration = await smtpConfigurationFromSettings(
      operationalConfigurationStore,
      environment.SMTP_PASSWORD,
    );
    if (!configuration)
      return reply.code(422).send({ error: 'Preencha e salve a configuração SMTP no painel antes de enviar.' });

    await new SmtpEmailSender(configuration).send(message);
    return reply.code(202).send({ accepted: true });
  });

  app.post<{ Body: unknown }>('/api/operator/login', async (request, reply) => {
    if (!supabaseStore || !environment.ADMIN_DASHBOARD_TOKEN) return reply.code(503).send({ error: 'Painel não configurado.' });
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
    const user = await supabaseStore.findUserByEmail(body.email);
    if (!user || !user.active || !verifyPassword(body.password, user.passwordHash)) return reply.code(401).send({ error: 'E-mail ou senha inválidos.' });
    return { token: signSession(user, environment.ADMIN_DASHBOARD_TOKEN), user: publicUser(user) };
  });

  app.get('/api/operator/crm/metrics', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!['admin', 'coordination', 'commercial'].includes(actor.role)) return reply.code(403).send({ error: 'Seu cargo não tem acesso às métricas comerciais.' });
    if (!environment.PLOOMES_USER_KEY) return { connected: false, reason: 'Integração Ploomes ainda não configurada.' };
    try {
      const metrics = await new PloomesClient(environment.PLOOMES_USER_KEY).getCommercialMetrics();
      return { connected: true, metrics };
    } catch {
      return reply.code(502).send({ error: 'Não foi possível consultar o Ploomes agora. A fila local continua disponível.' });
    }
  });

  app.get('/api/operator/crm/overview', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!['admin', 'coordination', 'commercial'].includes(actor.role))
      return reply.code(403).send({ error: 'Seu cargo não tem acesso ao CRM comercial.' });
    if (!environment.PLOOMES_USER_KEY)
      return { connected: false, reason: 'Integração Ploomes ainda não configurada.' };
    try {
      return { connected: true, overview: await new PloomesClient(environment.PLOOMES_USER_KEY).getCommercialOverview() };
    } catch {
      return reply.code(502).send({ error: 'Não foi possível consultar o Ploomes agora. Tente atualizar novamente.' });
    }
  });

  app.get('/operator', async (_request, reply) => {
    if (!supabaseStore || !environment.ADMIN_DASHBOARD_TOKEN)
      return reply.code(503).type('text/plain').send('Painel de atendimento não configurado.');
    return reply.type('text/html; charset=utf-8').send(operatorInboxHtml);
  });

  app.get('/api/operator/conversations', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor)
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    return supabaseStore.listOperatorConversations(visibleAreas(actor));
  });

  app.get<{ Params: { id: string } }>('/api/operator/conversations/:id', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor)
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: 'Conversa não encontrada.' });
    return canAccessConversation(actor, conversation.destinationArea) ? conversation : reply.code(403).send({ error: 'Seu cargo não pode acessar esta fila.' });
  });

  app.post<{ Params: { id: string } }>('/api/operator/conversations/:id/claim', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor)
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    if (actor.role === 'viewer') return reply.code(403).send({ error: 'Seu perfil é somente consulta.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation || !canAccessConversation(actor, conversation.destinationArea)) return reply.code(403).send({ error: 'Seu cargo não pode assumir esta fila.' });
    const claimed = await supabaseStore.claimConversation(request.params.id, actor.name);
    return claimed ? reply.code(204).send() : reply.code(409).send({ error: 'Esta conversa já foi assumida.' });
  });

  app.post<{ Params: { id: string } }>('/api/operator/conversations/:id/release', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor)
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    if (actor.role === 'viewer') return reply.code(403).send({ error: 'Seu perfil é somente consulta.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation || !canAccessConversation(actor, conversation.destinationArea)) return reply.code(403).send({ error: 'Seu cargo não pode alterar esta fila.' });
    const released = await supabaseStore.releaseConversation(request.params.id, actor.name);
    return released ? reply.code(204).send() : reply.code(409).send({ error: 'A conversa não está atribuída a você.' });
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/operator/conversations/:id/transfer', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor) return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    if (!['admin', 'coordination'].includes(actor.role)) return reply.code(403).send({ error: 'Somente Administração ou Coordenação pode transferir entre setores.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: 'Conversa não encontrada.' });
    const { destination } = transferSchema.parse(request.body);
    await supabaseStore.transferConversation(conversation.id, destination, actor.name);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/operator/conversations/:id/notes', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor || actor.role === 'viewer') return reply.code(403).send({ error: 'Seu perfil não pode adicionar notas.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation || !canAccessConversation(actor, conversation.destinationArea)) return reply.code(403).send({ error: 'Seu cargo não pode acessar esta conversa.' });
    await supabaseStore.addOperatorNote(conversation.id, actor.name, operatorNoteSchema.parse(request.body).text);
    return reply.code(201).send({ created: true });
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/operator/conversations/:id/follow-up', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor || actor.role === 'viewer') return reply.code(403).send({ error: 'Seu perfil não pode agendar retornos.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation || !canAccessConversation(actor, conversation.destinationArea)) return reply.code(403).send({ error: 'Seu cargo não pode acessar esta conversa.' });
    await supabaseStore.scheduleFollowUp(conversation.id, actor.name, followUpSchema.parse(request.body).followUpAt);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/operator/conversations/:id/close', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor || actor.role === 'viewer') return reply.code(403).send({ error: 'Seu perfil não pode encerrar atendimentos.' });
    if (!supabaseStore) return reply.code(503).send({ error: 'Painel de atendimento não configurado.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation || !canAccessConversation(actor, conversation.destinationArea)) return reply.code(403).send({ error: 'Seu cargo não pode acessar esta conversa.' });
    if (conversation.assignedOperator !== actor.name && !['admin', 'coordination'].includes(actor.role)) return reply.code(409).send({ error: 'Assuma a conversa antes de encerrá-la.' });
    await supabaseStore.closeConversation(conversation.id, actor.name, closeConversationSchema.parse(request.body).resolutionNote);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: unknown }>('/api/operator/conversations/:id/messages', async (request, reply) => {
    const actor = readOperatorSession(request.headers.authorization, environment.ADMIN_DASHBOARD_TOKEN);
    if (!actor)
      return reply.code(401).send({ error: 'Não autorizado.' });
    if (!supabaseStore || !outboundSender)
      return reply.code(503).send({ error: 'Envio pelo WhatsApp ainda não está configurado.' });
    if (actor.role === 'viewer') return reply.code(403).send({ error: 'Seu perfil é somente consulta.' });
    const conversation = await supabaseStore.getOperatorConversation(request.params.id);
    if (!conversation) return reply.code(404).send({ error: 'Conversa não encontrada.' });
    if (!canAccessConversation(actor, conversation.destinationArea)) return reply.code(403).send({ error: 'Seu cargo não pode acessar esta fila.' });
    if (conversation.assignedOperator !== actor.name)
      return reply.code(409).send({ error: 'Assuma a conversa antes de responder.' });
    const { text } = operatorMessageSchema.parse(request.body);
    const delivery = await outboundSender.sendText(conversation.contactPhone, text);
    await supabaseStore.saveOutbound(conversation.id, text, { messageId: delivery.messageId, status: 'sent' });
    await supabaseStore.audit('operator.message_sent', actor.name, { conversationId: conversation.id });
    return reply.code(201).send({ sent: true });
  });

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
      if (persistedMenuService) {
        const result = await persistedMenuService.process(messages);
        return reply.code(200).send({
          received: true,
          processed: result.processed,
          duplicates: result.duplicates,
          responses: result.responses,
        });
      }
      const result = webhookProcessor.process(messages);
      const responses = result.acceptedMessages.map((message) =>
        menuService.handle(message.from, message.text),
      );
      if (outboundSender) {
        await Promise.allSettled(responses.map((response) => outboundSender.sendText(response.to, response.text)));
      }
      return reply.code(200).send({
        received: true,
        processed: result.processed,
        duplicates: result.duplicates,
        responses,
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
  const payload = Buffer.from(JSON.stringify({ id: user.id, name: user.name, role: user.role, area: user.area, exp: Date.now() + 43_200_000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readOperatorSession(authorization: string | undefined, secret: string | undefined): { id: string; name: string; role: AppRole; area: AppUser['area'] } | undefined {
  if (!secret || !authorization?.startsWith('Bearer ')) return undefined;
  const [payload, signature] = authorization.slice(7).split('.');
  if (!payload || !signature) return undefined;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !timingSafeEqual(actual, expectedBuffer)) return undefined;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { id?: string; name?: string; role?: AppRole; area?: AppUser['area']; exp?: number };
    if (!value.id || !value.name || !value.role || !value.area || !value.exp || value.exp < Date.now()) return undefined;
    return { id: value.id, name: value.name, role: value.role, area: value.area };
  } catch { return undefined; }
}

function visibleAreas(actor: { role: AppRole; area: AppUser['area'] }): string[] | undefined {
  if (actor.role === 'admin' || actor.role === 'coordination') return undefined;
  if (actor.role === 'on_call') return ['on_call', 'technical'];
  return [actor.area];
}

function canAccessConversation(actor: { role: AppRole; area: AppUser['area'] }, destinationArea: string | null | undefined): boolean {
  const areas = visibleAreas(actor);
  return !areas || Boolean(destinationArea && areas.includes(destinationArea));
}
