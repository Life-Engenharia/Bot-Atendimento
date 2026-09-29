import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment, Environment } from './config/env.js';
import { InMemoryAuditLog } from './modules/audit/audit-log.js';
import { MenuService } from './modules/conversations/application/menu-service.js';
import { PersistedMenuService } from './modules/conversations/application/persisted-menu-service.js';
import {
  WebhookProcessor,
  IncomingMessage,
} from './modules/webhook/application/webhook-processor.js';
import { SupabaseConversationStore } from './infra/supabase/conversation-store.js';

export type AppDependencies = {
  environment?: Environment;
  auditLog?: InMemoryAuditLog;
  webhookProcessor?: WebhookProcessor;
  menuService?: MenuService;
  persistedMenuService?: PersistedMenuService;
};

export function buildApp(dependencies: AppDependencies = {}): FastifyInstance {
  const environment = dependencies.environment ?? loadEnvironment();
  const auditLog = dependencies.auditLog ?? new InMemoryAuditLog();
  const webhookProcessor = dependencies.webhookProcessor ?? new WebhookProcessor(auditLog);
  const menuService = dependencies.menuService ?? new MenuService(auditLog);
  const persistedMenuService =
    dependencies.persistedMenuService ??
    (environment.SUPABASE_URL && environment.SUPABASE_API
      ? new PersistedMenuService(
          new SupabaseConversationStore(environment.SUPABASE_URL, environment.SUPABASE_API),
        )
      : undefined);
  const app = Fastify({ logger: environment.NODE_ENV !== 'test' });
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

  app.post<{ Body: { messages?: IncomingMessage[] } }>(
    '/webhooks/whatsapp',
    async (request, reply) => {
      const messages = request.body?.messages ?? [];
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
    return reply.code(400).send({ error: message });
  });

  return app;
}
