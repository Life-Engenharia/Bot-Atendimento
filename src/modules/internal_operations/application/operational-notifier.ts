import type { StoredConversation, SupabaseConversationStore } from '../../../infra/supabase/conversation-store.js';
import type { OutboundSender } from '../../conversations/application/persisted-menu-service.js';

export type OperationalEmailMessage = { to: string; subject: string; text: string };
export type OperationalEmailSender = {
  send(message: OperationalEmailMessage): Promise<void>;
};

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
    private readonly templates: { commercial?: string; technical?: string } = {},
    private readonly emailSender?: OperationalEmailSender,
    private readonly emailDestinations: { commercial?: string; technical?: string } = {},
  ) { }

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
    const emailDestination = this.emailDestinations[area];
    if ((!destination || !this.sender) && (!emailDestination || !this.emailSender)) return;
    const title = area === 'commercial' ? '*NOVA POSSÍVEL PROPOSTA*' : '*NOVO CHAMADO TÉCNICO*';
    const action = area === 'commercial'
      ? [
        '',
        '*Ação*',
        'Entre em contato com o cliente pelo WhatsApp:',
        `https://wa.me/${toWhatsAppLink(conversation.context.contactPhone)}`,
        '',
        '*Ploomes*',
        'No Operator, use o botão “Cadastrar cliente” para incluir o contato e a oportunidade no Ploomes, ou “Cadastro manual” se o CRM exigir conferência.',
      ]
      : ['', 'Abra a Central de Operação para assumir e registrar a ação.'];
    const text = [title, '', '*Protocolo:*', `\`\`\`${reference}\`\`\``, '', ...lines, ...action].join('\n');
    const deliveries: Promise<void>[] = [];
    if (destination && this.sender) {
      deliveries.push(this.sendWhatsApp(area, destination, reference, conversation, text));
    }
    if (emailDestination && this.emailSender) {
      const subjectPrefix = area === 'commercial' ? 'Nova oportunidade' : 'Novo chamado técnico';
      const emailText = [
        title.replaceAll('*', ''),
        '',
        'Protocolo:',
        reference,
        '',
        ...lines,
        ...action.map((line) => line.replaceAll('*', '')),
      ].join('\n');
      deliveries.push(this.sendEmail(area, emailDestination, {
        to: emailDestination,
        subject: `[Life Engenharia] ${subjectPrefix} ${reference}`,
        text: emailText,
      }, reference, conversation));
    }
    await Promise.all(deliveries);
  }

  private async sendWhatsApp(
    area: 'commercial' | 'technical',
    destination: string,
    reference: string,
    conversation: StoredConversation,
    text: string,
  ): Promise<void> {
    if (!this.sender) return;
    try {
      // Em falha de rede o resultado é ambíguo: a Meta pode ter aceitado o
      // primeiro envio. Repetir aqui causava notificações duplicadas ao time.
      const template = this.templates[area];
      const delivery = template && this.sender.sendTemplate
        ? await this.sender.sendTemplate(destination, template, 'pt_BR', [reference])
        : await this.sender.sendText(destination, text);
      await this.store.audit('operation.notification_sent', 'system', {
        area,
        channel: 'whatsapp',
        conversationId: conversation.id,
        protocolReference: reference,
        destination,
        metaMessageId: delivery.messageId,
      });
    } catch (error) {
      await this.store.audit('operation.notification_failed', 'system', {
        area,
        channel: 'whatsapp',
        conversationId: conversation.id,
        protocolReference: reference,
        destination,
        error: error instanceof Error ? error.message : 'Erro desconhecido.',
      });
    }
  }

  private async sendEmail(
    area: 'commercial' | 'technical',
    destination: string,
    message: OperationalEmailMessage,
    reference: string,
    conversation: StoredConversation,
  ): Promise<void> {
    if (!this.emailSender) return;
    try {
      await this.emailSender.send(message);
      await this.store.audit('operation.notification_sent', 'system', {
        area,
        channel: 'email',
        conversationId: conversation.id,
        protocolReference: reference,
        destination,
      });
    } catch (error) {
      await this.store.audit('operation.notification_failed', 'system', {
        area,
        channel: 'email',
        conversationId: conversation.id,
        protocolReference: reference,
        destination,
        error: error instanceof Error ? error.message : 'Erro desconhecido.',
      });
    }
  }
}

function toWhatsAppLink(value?: string): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
