import { createHmac, timingSafeEqual } from 'node:crypto';
import { IncomingMedia, IncomingMessage } from '../../modules/webhook/application/webhook-processor.js';

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: Array<MetaMessage> };
    }>;
  }>;
};

type MetaMessage = {
  id?: string;
  from?: string;
  text?: { body?: string };
  image?: MetaMedia;
  audio?: MetaMedia;
  video?: MetaMedia;
  document?: MetaMedia;
};
type MetaMedia = { id?: string; mime_type?: string; filename?: string; caption?: string; sha256?: string };

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

/** Extrai texto e referências de mídias; o binário é baixado separadamente e autenticado. */
export function normalizeMetaWebhook(payload: MetaWebhookPayload): IncomingMessage[] {
  return (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .flatMap((change) => change.value?.messages ?? [])
    .flatMap((message) => {
      if (!message.id || !message.from) return [];
      const media = toMedia(message);
      return [{
        id: message.id,
        from: message.from,
        text: message.text?.body ?? media[0]?.caption,
        ...(media.length ? { media } : {}),
      }];
    });
}

function toMedia(message: MetaMessage): IncomingMedia[] {
  const variants: Array<[IncomingMedia['type'], MetaMedia | undefined]> = [
    ['image', message.image], ['audio', message.audio], ['video', message.video], ['document', message.document],
  ];
  return variants.flatMap(([type, media]) => media?.id ? [{
    id: media.id, type, mimeType: media.mime_type, fileName: media.filename, caption: media.caption, sha256: media.sha256,
  }] : []);
}
