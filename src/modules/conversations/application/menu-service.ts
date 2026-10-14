import { InMemoryAuditLog } from '../../audit/audit-log.js';
import {
  commercialServiceByOption,
  commercialServiceMenu,
} from '../../commercial/domain/commercial-services.js';

type MenuState =
  | 'CONSENT'
  | 'ROUTE'
  | 'COMMERCIAL_SERVICE_MENU'
  | 'COMMERCIAL_COLLECTING'
  | 'TECHNICAL_PENDING'
  | 'HANDOFF_HUMANO';

type MenuConversation = {
  phone: string;
  state: MenuState;
  selectedService?: string;
};

export type MenuResponse = {
  to: string;
  state: MenuState;
  text: string;
};

const consentMessage =
  'Olá! Tudo bem? Eu sou a assistente virtual da Life Engenharia. Posso te ajudar a organizar sua solicitação e encaminhá-la para o time responsável.\n\nPara isso, vou registrar as informações desta conversa. Podemos continuar?\n\n1. Sim, vamos lá\n2. Prefiro falar com uma pessoa';

const routeMenu =
  'Perfeito! Como posso te ajudar hoje?\n\n1. Quero contratar um serviço ou pedir um orçamento\n2. Já sou cliente Life e preciso de assistência técnica\n3. Quero falar com uma pessoa';

const humanMessage =
  'Claro! Vou encaminhar sua solicitação para uma pessoa da equipe Life. Assim que possível, ela seguirá com você por aqui.';

export class MenuService {
  private readonly conversations = new Map<string, MenuConversation>();

  constructor(private readonly auditLog: InMemoryAuditLog) { }

  handle(phone: string, incomingText?: string): MenuResponse {
    const existing = this.conversations.get(phone);
    if (!existing) {
      const conversation = { phone, state: 'CONSENT' as const };
      this.conversations.set(phone, conversation);
      this.auditLog.append({
        event: 'menu.conversation_started',
        actor: 'system',
        payload: { phone },
      });
      return this.response(conversation, consentMessage);
    }

    const text = normalize(incomingText);
    const wantsHuman =
      isHumanRequest(text) ||
      (existing.state === 'CONSENT' && text === '2') ||
      (existing.state === 'ROUTE' && text === '3');
    if (wantsHuman) {
      existing.state = 'HANDOFF_HUMANO';
      this.auditLog.append({
        event: 'menu.handoff_requested',
        actor: 'customer',
        payload: { phone },
      });
      return this.response(existing, humanMessage);
    }

    if (existing.state === 'CONSENT') {
      if (isConsentAccepted(text)) {
        existing.state = 'ROUTE';
        this.auditLog.append({
          event: 'menu.consent_accepted',
          actor: 'customer',
          payload: { phone },
        });
        return this.response(existing, routeMenu);
      }
      return this.response(
        existing,
        'Sem problema. Para seguir, responda 1 e eu começo a te ajudar. Se preferir falar com alguém da equipe, responda 2.',
      );
    }

    if (existing.state === 'ROUTE') {
      if (
        text === '1' ||
        text.includes('orçamento') ||
        text.includes('orcamento') ||
        text.includes('contratar')
      ) {
        existing.state = 'COMMERCIAL_SERVICE_MENU';
        this.auditLog.append({
          event: 'menu.commercial_selected',
          actor: 'customer',
          payload: { phone },
        });
        return this.response(existing, commercialServiceMenu());
      }
      if (text === '2' || text.includes('assistência') || text.includes('assistencia')) {
        existing.state = 'TECHNICAL_PENDING';
        this.auditLog.append({
          event: 'menu.technical_selected',
          actor: 'customer',
          payload: { phone },
        });
        return this.response(
          existing,
          'Entendi. Vou fazer algumas perguntas rápidas para organizar o chamado. Por segurança, não mexa no equipamento nem em painéis energizados; a equipe técnica vai validar as informações antes de orientar qualquer ação.',
        );
      }
      return this.response(
        existing,
        'Não consegui identificar a opção. Você pode responder 1 para orçamento, 2 para assistência técnica ou 3 para falar com uma pessoa?',
      );
    }

    if (existing.state === 'COMMERCIAL_SERVICE_MENU') {
      const service = commercialServiceByOption(text);
      if (!service)
        return this.response(
          existing,
          'Escolha uma opção de 1 a 10 para informar o serviço desejado.',
        );
      existing.state = 'COMMERCIAL_COLLECTING';
      existing.selectedService = service;
      this.auditLog.append({
        event: 'commercial.service_selected',
        actor: 'customer',
        payload: { phone, service },
      });
      return this.response(
        existing,
        `Perfeito, você selecionou ${service}. Em qual cidade e unidade será o atendimento?`,
      );
    }

    if (existing.state === 'HANDOFF_HUMANO') {
      return this.response(
        existing,
        'Sua solicitação já está com a equipe Life. Se quiser, pode enviar mais detalhes por aqui enquanto aguarda.',
      );
    }

    return this.response(
      existing,
      'Perfeito, recebi sua escolha. Vamos seguir com as próximas informações por aqui.',
    );
  }

  private response(conversation: MenuConversation, text: string): MenuResponse {
    return { to: conversation.phone, state: conversation.state, text };
  }
}

function normalize(value?: string): string {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR');
}

function isConsentAccepted(value: string): boolean {
  return value === '1' || value === 'sim' || value === 'sim, continuar' || value === 'continuar';
}

function isHumanRequest(value: string): boolean {
  return (
    value.includes('falar com uma pessoa') ||
    value.includes('atendente') ||
    value.includes('humano')
  );
}
