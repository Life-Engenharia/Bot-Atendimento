import { IncomingMedia } from '../../webhook/application/webhook-processor.js';
import {
  StoredConversation,
  SupabaseConversationStore,
} from '../../../infra/supabase/conversation-store.js';

export type MediaDownloader = {
  downloadMedia(
    mediaId: string,
  ): Promise<{ content: Uint8Array; mimeType?: string; fileName?: string }>;
};
export type MediaAnalyzer = {
  analyze(input: {
    content: Uint8Array;
    mimeType: string;
    fileName: string;
    kind: 'audio' | 'document' | 'image' | 'video';
  }): Promise<{ extractedText: string; status: 'completed' | 'needs_review' } | undefined>;
};

/** Persiste mídia em bucket privado; falha de download nunca interrompe a conversa. */
export class MediaIngestionService {
  constructor(
    private readonly store: SupabaseConversationStore,
    private readonly downloader?: MediaDownloader,
    private readonly analyzer?: MediaAnalyzer,
  ) {}

  async ingest(
    conversation: StoredConversation,
    media: IncomingMedia[] | undefined,
  ): Promise<void> {
    for (const item of media ?? []) {
      if (!this.downloader) {
        await this.store.saveMediaAttachment(conversation, item, undefined, 'pending_connection');
        await this.store.audit('media.received_pending_connection', 'system', {
          conversationId: conversation.id,
          mediaId: item.id,
          type: item.type,
        });
        continue;
      }
      try {
        const downloaded = await this.downloader.downloadMedia(item.id);
        const attachmentId = await this.store.saveMediaAttachment(
          conversation,
          {
            ...item,
            mimeType: downloaded.mimeType ?? item.mimeType,
            fileName: downloaded.fileName ?? item.fileName,
          },
          downloaded.content,
          'stored',
        );
        if (this.analyzer) {
          try {
            const analysis = await this.analyzer.analyze({
              content: downloaded.content,
              mimeType: downloaded.mimeType ?? item.mimeType ?? 'application/octet-stream',
              fileName: downloaded.fileName ?? item.fileName ?? `${item.type}-${item.id}`,
              kind: item.type,
            });
            if (analysis) await this.store.saveMediaAnalysis(attachmentId, analysis);
          } catch (error) {
            await this.store.saveMediaAnalysis(attachmentId, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Falha na análise do anexo.',
            });
          }
        }
        await this.store.audit('media.stored_private', 'meta', {
          conversationId: conversation.id,
          mediaId: item.id,
          type: item.type,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Falha desconhecida ao baixar mídia.';
        await this.store.saveMediaAttachment(conversation, item, undefined, 'failed', message);
        await this.store.audit('media.download_failed', 'meta', {
          conversationId: conversation.id,
          mediaId: item.id,
          type: item.type,
          error: message,
        });
      }
    }
  }
}
