import { InMemoryAuditLog } from '../../audit/audit-log.js';

export type IncomingMedia = {
  id: string;
  type: 'image' | 'audio' | 'video' | 'document';
  mimeType?: string;
  fileName?: string;
  caption?: string;
  sha256?: string;
};

export type IncomingMessage = {
  id: string;
  from: string;
  text?: string;
  media?: IncomingMedia[];
};

export type WebhookResult = {
  processed: number;
  duplicates: number;
  acceptedMessages: IncomingMessage[];
};

export class WebhookProcessor {
  private readonly receivedMessageIds = new Set<string>();

  constructor(private readonly auditLog: InMemoryAuditLog) {}

  process(messages: IncomingMessage[]): WebhookResult {
    let processed = 0;
    let duplicates = 0;
    const acceptedMessages: IncomingMessage[] = [];

    for (const message of messages) {
      if (this.receivedMessageIds.has(message.id)) {
        duplicates += 1;
        continue;
      }

      this.receivedMessageIds.add(message.id);
      processed += 1;
      acceptedMessages.push(message);
      this.auditLog.append({
        event: 'webhook.message_received',
        actor: 'meta',
        payload: { messageId: message.id, from: message.from, hasText: Boolean(message.text), mediaCount: message.media?.length ?? 0 },
      });
    }

    return { processed, duplicates, acceptedMessages };
  }
}
