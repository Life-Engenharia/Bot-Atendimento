import { IncomingMedia } from '../../webhook/application/webhook-processor.js';
import { StoredConversation, SupabaseConversationStore } from '../../../infra/supabase/conversation-store.js';

export type MediaDownloader = {
  downloadMedia(mediaId: string): Promise<{ content: Uint8Array; mimeType?: string; fileName?: string }>;
};

/** Persiste mídia em bucket privado; falha de download nunca interrompe a conversa. */
export class MediaIngestionService {
  constructor(
    private readonly store: SupabaseConversationStore,
    private readonly downloader?: MediaDownloader,
  ) { }

  async ingest(conversation: StoredConversation, media: IncomingMedia[] | undefined): Promise<void> {
    for (const item of media ?? []) {
      if (!this.downloader) {
        await this.store.saveMediaAttachment(conversation, item, undefined, 'pending_connection');
        await this.store.audit('media.received_pending_connection', 'system', { conversationId: conversation.id, mediaId: item.id, type: item.type });
        continue;
      }
      try {
        const downloaded = await this.downloader.downloadMedia(item.id);
        await this.store.saveMediaAttachment(conversation, { ...item, mimeType: downloaded.mimeType ?? item.mimeType, fileName: downloaded.fileName ?? item.fileName }, downloaded.content, 'stored');
        await this.store.audit('media.stored_private', 'meta', { conversationId: conversation.id, mediaId: item.id, type: item.type });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida ao baixar mídia.';
        await this.store.saveMediaAttachment(conversation, item, undefined, 'failed', message);
        await this.store.audit('media.download_failed', 'meta', { conversationId: conversation.id, mediaId: item.id, type: item.type, error: message });
      }
    }
  }
}
