import type { StoredConversation, SupabaseConversationStore } from '../../../infra/supabase/conversation-store.js';
import type { OutboundSender } from '../../conversations/application/persisted-menu-service.js';

/**
 * Entrega o resumo ao destino corporativo. O envio é deliberadamente separado
 * da criação do protocolo: falha no WhatsApp nunca pode descartar a triagem.
 * Em produção, use um template Meta aprovado para iniciar a conversa fora da
 * janela de 24 horas; após a resposta do operador, as ações ficam disponíveis
 * na Central de Operação autenticada.
 */
export class OperationalNotifier {
  constructor(
    private readonly store: SupabaseConversationStore,
    private readonly sender: OutboundSender | undefined,
    private readonly destinations: { commercial?: string; technical?: string },
  ) {}

  async commercial(reference: string, conversation: StoredConversation): Promise<void> {
    await this.send('commercial', reference, conversation, [
      `Serviço: ${conversation.context.service ?? 'não informado'}`,
      `Cliente: ${conversation.context.contactName ?? 'não informado'}`,
      `Empresa: ${conversation.context.company ?? 'não informada'}`,
      `Local: ${conversation.context.location ?? 'não informado'}`,
      `Prazo: ${conversation.context.timeline ?? 'não informado'}`,
      `Necessidade: ${conversation.context.need ?? 'não informada'}`,
    ]);
  }

  async technical(
    reference: string,
    priority: string,
    conversation: StoredConversation,
  ): Promise<void> {
    await this.send('technical', reference, conversation, [
      `Prioridade sugerida: ${priority}`,
      `Cliente: ${conversation.context.contactName ?? 'não informado'}`,
      `Local: ${conversation.context.location ?? 'não informado'}`,
      `Equipamento: ${conversation.context.equipment ?? 'não informado'}`,
      `Sintoma: ${conversation.context.symptom ?? 'não informado'}`,
      `Impacto: ${conversation.context.operationalImpact ?? 'não informado'}`,
      `Risco informado: ${conversation.context.reportedRisk ?? 'não informado'}`,
    ]);
  }

  private async send(
    area: 'commercial' | 'technical',
    reference: string,
    conversation: StoredConversation,
    lines: string[],
  ): Promise<void> {
    const destination = this.destinations[area];
    if (!destination || !this.sender) return;
    const title = area === 'commercial' ? 'NOVA POSSÍVEL PROPOSTA' : 'NOVO CHAMADO TÉCNICO';
    const text = [title, `Protocolo: ${reference}`, ...lines, '', 'Abra a Central de Operação para assumir e registrar a ação.'].join('\n');
    try {
      let delivery;
      try {
        delivery = await this.sender.sendText(destination, text);
      } catch (firstError) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          delivery = await this.sender.sendText(destination, text);
        } catch {
          throw firstError;
        }
      }
      await this.store.audit('operation.notification_sent', 'system', {
        area,
        conversationId: conversation.id,
        protocolReference: reference,
        destination,
        metaMessageId: delivery.messageId,
      });
    } catch (error) {
      await this.store.audit('operation.notification_failed', 'system', {
        area,
        conversationId: conversation.id,
        protocolReference: reference,
        destination,
        error: error instanceof Error ? error.message : 'Erro desconhecido.',
      });
    }
  }
}
