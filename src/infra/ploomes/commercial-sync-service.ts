import { CommercialSyncJob, SupabaseConversationStore } from '../supabase/conversation-store.js';
import { PloomesClient } from './ploomes-client.js';

/**
 * Processador idempotente da outbox comercial. O protocolo local já existe
 * antes deste código rodar; assim uma indisponibilidade do CRM nunca perde o
 * lead e pode ser reprocessada pelo endpoint protegido ou por um agendador.
 */
export class CommercialPloomesSyncService {
  constructor(
    private readonly store: SupabaseConversationStore,
    private readonly ploomes: PloomesClient,
  ) { }

  async run(limit = 10): Promise<{ processed: number; synced: number; failed: number }> {
    const jobs = await this.store.listPendingCommercialSyncJobs(limit);
    let synced = 0;
    let failed = 0;
    for (const job of jobs) {
      try {
        const result = await this.ploomes.syncCommercialLead(job.payload);
        await this.store.markCommercialSyncCompleted(job, result.contactId, result.dealId);
        synced += 1;
      } catch (error) {
        await this.store.markCommercialSyncFailed(job, messageFrom(error));
        failed += 1;
      }
    }
    return { processed: jobs.length, synced, failed };
  }

  async runProtocol(protocolId: string): Promise<{ processed: number; synced: number; failed: number }> {
    const job = await this.store.getPendingCommercialSyncJob(protocolId);
    if (!job) return { processed: 0, synced: 0, failed: 0 };
    try {
      const result = await this.ploomes.syncCommercialLead(job.payload);
      await this.store.markCommercialSyncCompleted(job, result.contactId, result.dealId);
      return { processed: 1, synced: 1, failed: 0 };
    } catch (error) {
      await this.store.markCommercialSyncFailed(job, messageFrom(error));
      return { processed: 1, synced: 0, failed: 1 };
    }
  }
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido na sincronização com Ploomes.';
}

export type { CommercialSyncJob };
