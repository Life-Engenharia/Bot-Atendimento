import { InMemoryAuditLog } from '../../audit/audit-log.js';
import {
  assertCommercialValue,
  CommercialConversation,
  CommercialField,
  CommercialRequest,
  nextCommercialField,
  questionFor,
} from '../domain/commercial-conversation.js';
import { BusinessRuleError } from '../../../shared/domain/errors.js';

export class CommercialConversationService {
  private readonly conversations = new Map<string, CommercialConversation>();
  private protocolSequence = 0;

  constructor(private readonly auditLog: InMemoryAuditLog) { }

  start(customerPhone: string): CommercialConversation {
    const conversation: CommercialConversation = {
      id: crypto.randomUUID(),
      customerPhone,
      state: 'CONSENT',
      values: {},
    };
    this.conversations.set(conversation.id, conversation);
    this.auditLog.append({
      event: 'conversation.started',
      actor: 'system',
      payload: { customerPhone },
    });
    return conversation;
  }

  acceptConsent(id: string): CommercialConversation {
    const conversation = this.require(id);
    if (conversation.state !== 'CONSENT') {
      throw new BusinessRuleError('O consentimento não pode ser aceito neste estado.');
    }
    conversation.state = 'ROUTE';
    this.auditLog.append({
      event: 'conversation.consent_accepted',
      actor: 'customer',
      payload: { conversationId: id },
    });
    return conversation;
  }

  selectCommercialRoute(id: string): { conversation: CommercialConversation; question: string } {
    const conversation = this.require(id);
    if (conversation.state !== 'ROUTE') {
      throw new BusinessRuleError('A rota comercial não pode ser iniciada neste estado.');
    }
    conversation.state = 'COLLECTING';
    return { conversation, question: questionFor(conversation.values)! };
  }

  answer(
    id: string,
    value: string,
  ): { conversation: CommercialConversation; nextQuestion?: string; readyForReview: boolean } {
    const conversation = this.require(id);
    if (conversation.state !== 'COLLECTING') {
      throw new BusinessRuleError('A conversa não está aguardando um dado comercial.');
    }

    const field = nextCommercialField(conversation.values);
    if (!field) {
      throw new BusinessRuleError('Todos os dados comerciais já foram coletados.');
    }

    assertCommercialValue(field, value);
    conversation.values[field] = value.trim();
    this.auditLog.append({
      event: 'commercial.field_collected',
      actor: 'customer',
      payload: { conversationId: id, field },
    });

    const nextQuestion = questionFor(conversation.values);
    if (!nextQuestion) {
      conversation.state = 'REVIEW';
    }

    return { conversation, nextQuestion, readyForReview: conversation.state === 'REVIEW' };
  }

  summary(id: string): CommercialRequest {
    const conversation = this.require(id);
    if (conversation.state !== 'REVIEW' && conversation.state !== 'QUEUED') {
      throw new BusinessRuleError('O resumo só está disponível após a coleta obrigatória.');
    }
    return conversation.values as CommercialRequest;
  }

  confirm(id: string): CommercialConversation {
    const conversation = this.require(id);
    if (conversation.state !== 'REVIEW') {
      throw new BusinessRuleError(
        'A solicitação comercial ainda não está pronta para confirmação.',
      );
    }

    this.protocolSequence += 1;
    conversation.protocolId = `LFE-${String(this.protocolSequence).padStart(6, '0')}`;
    conversation.state = 'QUEUED';
    this.auditLog.append({
      event: 'commercial.protocol_queued',
      actor: 'customer',
      protocolId: conversation.protocolId,
      payload: { conversationId: id, route: 'commercial' },
    });
    return conversation;
  }

  private require(id: string): CommercialConversation {
    const conversation = this.conversations.get(id);
    if (!conversation) {
      throw new BusinessRuleError('Conversa não encontrada.');
    }
    return conversation;
  }
}
