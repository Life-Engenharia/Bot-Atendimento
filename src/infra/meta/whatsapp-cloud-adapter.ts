import { createHmac, timingSafeEqual } from 'node:crypto';
import { IncomingMessage } from '../../modules/webhook/application/webhook-processor.js';

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: Array<{ id?: string; from?: string; text?: { body?: string } }> };
    }>;
  }>;
};

/** Verifica o corpo bruto antes de normalizar o evento recebido da Meta. */
export function isValidMetaSignature(
  rawBody: Buffer,
  signature: string | undefined,
  appSecret: string,
): boolean {
  if (!signature?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

/** Extrai somente mensagens de texto tratadas pelo fluxo atual. */
export function normalizeMetaWebhook(payload: MetaWebhookPayload): IncomingMessage[] {
  return (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .flatMap((change) => change.value?.messages ?? [])
    .flatMap((message) =>
      message.id && message.from
        ? [{ id: message.id, from: message.from, text: message.text?.body }]
        : [],
    );
}
