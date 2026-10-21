import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  IncomingMedia,
  IncomingMessage,
} from '../../modules/webhook/application/webhook-processor.js';

type MetaWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: Array<MetaMessage>; statuses?: Array<MetaDeliveryStatus> };
    }>;
  }>;
};
export type MetaDeliveryStatus = {
  id: string;
  recipient_id?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; details?: string }>;
};

type MetaMessage = {
  id?: string;
  from?: string;
  text?: { body?: string };
  image?: MetaMedia;
  audio?: MetaMedia;
  video?: MetaMedia;
  document?: MetaMedia;
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};
type MetaMedia = {
  id?: string;
  mime_type?: string;
  filename?: string;
  caption?: string;
  sha256?: string;
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

/** Extrai texto e referências de mídias; o binário é baixado separadamente e autenticado. */
export function normalizeMetaWebhook(payload: MetaWebhookPayload): IncomingMessage[] {
  return (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .flatMap((change) => change.value?.messages ?? [])
    .flatMap((message) => {
      if (!message.id || !message.from) return [];
      const media = toMedia(message);
      return [
        {
          id: message.id,
          from: message.from,
          // A seleção de lista/botão não possui `text.body`. Preservamos o
          // título para que o fluxo também funcione quando a Meta não enviar
          // o id esperado ou quando o usuário responder digitando o nome.
          text:
            message.text?.body ??
            message.interactive?.button_reply?.title ??
            message.interactive?.list_reply?.title ??
            media[0]?.caption,
          interactiveId:
            message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id,
          ...(media.length ? { media } : {}),
        },
      ];
    });
}

/** Atualizações de envio chegam separadas das mensagens recebidas. */
export function normalizeMetaDeliveryStatuses(payload: MetaWebhookPayload): MetaDeliveryStatus[] {
  return (payload.entry ?? [])
    .flatMap((entry) => entry.changes ?? [])
    .flatMap((change) => change.value?.statuses ?? [])
    .filter((status): status is MetaDeliveryStatus => Boolean(status.id && status.status));
}

function toMedia(message: MetaMessage): IncomingMedia[] {
  const variants: Array<[IncomingMedia['type'], MetaMedia | undefined]> = [
    ['image', message.image],
    ['audio', message.audio],
    ['video', message.video],
    ['document', message.document],
  ];
  return variants.flatMap(([type, media]) =>
    media?.id
      ? [
          {
            id: media.id,
            type,
            mimeType: media.mime_type,
            fileName: media.filename,
            caption: media.caption,
            sha256: media.sha256,
          },
        ]
      : [],
  );
}
