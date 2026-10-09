import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { loadEnvironment, Environment } from './config/env.js';
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
]);
const settingValuesSchema = z.object({ values: z.array(z.record(z.string(), z.string())) });

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
    logger: environment.NODE_ENV !== 'test',
    // O webhook recebe apenas eventos JSON da Meta; mídia é baixada posteriormente pela API.
    bodyLimit: 1_048_576,
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
      await operationalConfigurationStore.replaceSetting(key, values, 'admin-dashboard');
      return reply.code(204).send();
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
