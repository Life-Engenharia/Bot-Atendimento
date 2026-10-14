import { LogController, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { Environment } from './env.js';

export function loggerOptions(environment: Environment): FastifyServerOptions['logger'] {
  if (environment.NODE_ENV === 'test') return false;
  if (environment.NODE_ENV === 'production') return { level: 'info' };

  return {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: true,
      },
    },
  };
}

export function logController(environment: Environment): LogController {
  return new LogController({ disableRequestLogging: environment.NODE_ENV === 'development' });
}

export function configureDevelopmentRequestLogging(
  app: FastifyInstance,
  environment: Environment,
): void {
  if (environment.NODE_ENV !== 'development') return;

  app.addHook('onRequest', async (request) => {
    request.log.info({ requestId: request.id, method: request.method, url: request.url }, `→ ${request.method} ${request.url}`);
  });
  app.addHook('onSend', async (request, reply, payload) => {
    const response = summarizeResponse(payload);
    request.log.info(
      { requestId: request.id, method: request.method, url: request.url, statusCode: reply.statusCode, response },
      `↳ resposta · ${response}`,
    );
    return payload;
  });
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        requestId: request.id,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: Number(reply.elapsedTime.toFixed(1)),
      },
      `← ${request.method} ${request.url} · ${reply.statusCode} · ${reply.elapsedTime.toFixed(1)} ms`,
    );
  });
}

function summarizeResponse(payload: unknown): string {
  const value = parseJsonPayload(payload);
  if (value === undefined || value === null || value === '') return 'sem conteúdo';
  if (Array.isArray(value)) return `${value.length} item(ns) retornado(s)`;
  if (typeof value !== 'object') return String(value).slice(0, 180);

  const body = value as Record<string, unknown>;
  if (typeof body.error === 'string') return `erro: ${body.error.slice(0, 180)}`;
  if (body.accepted === true) return 'aceito para envio';
  if (body.created === true) return 'criado com sucesso';
  if (typeof body.status === 'string') return `status: ${body.status}`;
  if (typeof body.connected === 'boolean') return body.connected ? 'integração conectada' : 'integração indisponível';
  return `objeto retornado (${Object.keys(body).length} campo(s))`;
}

function parseJsonPayload(payload: unknown): unknown {
  if (Buffer.isBuffer(payload)) return parseJsonPayload(payload.toString('utf8'));
  if (typeof payload !== 'string') return payload;
  const text = payload.trim();
  if (!text) return text;
  try {
    return JSON.parse(text);
  } catch {
    return '[resposta não JSON]';
  }
}
