import Fastify, { FastifyInstance } from "fastify";
import { loadEnvironment, Environment } from "./config/env.js";
import { InMemoryAuditLog } from "./modules/audit/audit-log.js";
import { WebhookProcessor, IncomingMessage } from "./modules/webhook/application/webhook-processor.js";

export type AppDependencies = {
  environment?: Environment;
  auditLog?: InMemoryAuditLog;
  webhookProcessor?: WebhookProcessor;
};

export function buildApp(dependencies: AppDependencies = {}): FastifyInstance {
  const environment = dependencies.environment ?? loadEnvironment();
  const auditLog = dependencies.auditLog ?? new InMemoryAuditLog();
  const webhookProcessor = dependencies.webhookProcessor ?? new WebhookProcessor(auditLog);
  const app = Fastify({ logger: environment.NODE_ENV !== "test" });

  app.get("/health", async () => ({ status: "ok" }));

  app.get<{ Querystring: { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string } }>(
    "/webhooks/whatsapp",
    async (request, reply) => {
      const query = request.query;
      const valid = query["hub.mode"] === "subscribe" && query["hub.verify_token"] === environment.WHATSAPP_VERIFY_TOKEN;
      if (!valid || !query["hub.challenge"]) {
        return reply.code(403).send({ error: "Webhook verification failed" });
      }
      return reply.type("text/plain").send(query["hub.challenge"]);
    }
  );

  app.post<{ Body: { messages?: IncomingMessage[] } }>("/webhooks/whatsapp", async (request, reply) => {
    const messages = request.body?.messages ?? [];
    const result = webhookProcessor.process(messages);
    return reply.code(200).send({ received: true, ...result });
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const message = error instanceof Error ? error.message : "Unexpected application error";
    return reply.code(400).send({ error: message });
  });

  return app;
}
