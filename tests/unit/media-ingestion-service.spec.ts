import { describe, expect, it } from 'vitest';
import { MediaIngestionService } from '../../src/modules/conversations/application/media-ingestion-service.js';
import { SupabaseConversationStore } from '../../src/infra/supabase/conversation-store.js';

describe('MediaIngestionService', () => {
  it('stores downloaded media privately with its original Meta reference', async () => {
    const saved: unknown[][] = [];
    const audits: string[] = [];
    const store = {
      saveMediaAttachment: async (...args: unknown[]) => {
        saved.push(args);
      },
      audit: async (event: string) => {
        audits.push(event);
      },
    } as unknown as SupabaseConversationStore;
    const service = new MediaIngestionService(store, {
      downloadMedia: async () => ({ content: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }),
    });

    await service.ingest({ id: 'conversation-1', state: 'consent', route: null, context: {} }, [
      { id: 'media-1', type: 'image', mimeType: 'image/jpeg' },
    ]);

    expect(saved[0]?.[1]).toMatchObject({ id: 'media-1', type: 'image', mimeType: 'image/png' });
    expect(saved[0]?.[3]).toBe('stored');
    expect(audits).toContain('media.stored_private');
  });

  it('records a pending item without attempting external download when Meta is not configured', async () => {
    const saved: unknown[][] = [];
    const store = {
      saveMediaAttachment: async (...args: unknown[]) => {
        saved.push(args);
      },
      audit: async () => undefined,
    } as unknown as SupabaseConversationStore;
    const service = new MediaIngestionService(store);

    await service.ingest({ id: 'conversation-1', state: 'consent', route: null, context: {} }, [
      { id: 'media-1', type: 'audio' },
    ]);

    expect(saved[0]?.[3]).toBe('pending_connection');
  });
});
