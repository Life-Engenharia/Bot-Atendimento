import {
  SupabaseConversationStore,
  StoredConversation,
} from '../../../infra/supabase/conversation-store.js';
import {
  commercialServiceByOption,
  commercialServiceMenu,
} from '../../commercial/domain/commercial-services.js';
import { IncomingMessage, WebhookResult } from '../../webhook/application/webhook-processor.js';
import { MenuResponse } from './menu-service.js';

const consentMessage =
  'Olá! Tudo bem? Eu sou a assistente virtual da Life Engenharia. Posso te ajudar a organizar sua solicitação e encaminhá-la para o time responsável.\n\nPara isso, vou registrar as informações desta conversa. Podemos continuar?\n\n1. Sim, vamos lá\n2. Prefiro falar com uma pessoa';
const routeMenu =
  'Perfeito! Como posso te ajudar hoje?\n\n1. Quero contratar um serviço ou pedir um orçamento\n2. Já sou cliente Life e preciso de assistência técnica\n3. Quero falar com uma pessoa';
const humanMessage =
  'Claro! Vou encaminhar sua solicitação para uma pessoa da equipe Life. Assim que possível, ela seguirá com você por aqui.';

export class PersistedMenuService {
  constructor(private readonly store: SupabaseConversationStore) {}

  async process(
    messages: IncomingMessage[],
  ): Promise<WebhookResult & { responses: MenuResponse[] }> {
    let processed = 0;
    let duplicates = 0;
    const acceptedMessages: IncomingMessage[] = [];
    const responses: MenuResponse[] = [];
    for (const message of messages) {
      const accepted = await this.store.acceptInbound(message);
      if (!accepted) {
        duplicates += 1;
        continue;
      }
      processed += 1;
      acceptedMessages.push(message);
      responses.push(await this.handle(message, accepted.conversation));
    }
    return { processed, duplicates, acceptedMessages, responses };
  }

  private async handle(
    message: IncomingMessage,
    conversation: StoredConversation,
  ): Promise<MenuResponse> {
    const text = normalize(message.text);
    let responseText: string;
    if (conversation.state === 'consent') {
      if (!text) responseText = consentMessage;
      else if (isHuman(text) || text === '2') {
        conversation.state = 'human';
        conversation.route = 'human';
        responseText = humanMessage;
        await this.store.audit('menu.handoff_requested', 'customer', { phone: message.from });
      } else if (isConsent(text)) {
        conversation.state = 'route';
        responseText = routeMenu;
        await this.store.audit('menu.consent_accepted', 'customer', { phone: message.from });
      } else
        responseText =
          'Sem problema. Para seguir, responda 1 e eu começo a te ajudar. Se preferir falar com alguém da equipe, responda 2.';
    } else if (conversation.state === 'route') {
      if (isHuman(text) || text === '3') {
        conversation.state = 'human';
        conversation.route = 'human';
        responseText = humanMessage;
        await this.store.audit('menu.handoff_requested', 'customer', { phone: message.from });
      } else if (
        text === '1' ||
        text.includes('orçamento') ||
        text.includes('orcamento') ||
        text.includes('contratar')
      ) {
        conversation.state = 'collecting';
        conversation.route = 'commercial';
        responseText = commercialServiceMenu();
        await this.store.audit('menu.commercial_selected', 'customer', { phone: message.from });
      } else if (text === '2' || text.includes('assistência') || text.includes('assistencia')) {
        conversation.state = 'collecting';
        conversation.route = 'technical';
        responseText =
          'Entendi. Vou fazer algumas perguntas rápidas para organizar o chamado. Por segurança, não mexa no equipamento nem em painéis energizados; a equipe técnica vai validar as informações antes de orientar qualquer ação.';
        await this.store.audit('menu.technical_selected', 'customer', { phone: message.from });
      } else
        responseText =
          'Não consegui identificar a opção. Você pode responder 1 para orçamento, 2 para assistência técnica ou 3 para falar com uma pessoa?';
    } else if (
      conversation.state === 'collecting' &&
      conversation.route === 'commercial' &&
      !conversation.context.service
    ) {
      const service = commercialServiceByOption(text);
      if (!service) responseText = 'Escolha uma opção de 1 a 10 para informar o serviço desejado.';
      else {
        conversation.context.service = service;
        responseText = `Perfeito, você selecionou ${service}. Em qual cidade e unidade será o atendimento?`;
        await this.store.audit('commercial.service_selected', 'customer', {
          phone: message.from,
          service,
        });
      }
    } else if (conversation.state === 'human')
      responseText =
        'Sua solicitação já está com a equipe Life. Se quiser, pode enviar mais detalhes por aqui enquanto aguarda.';
    else
      responseText =
        'Perfeito, recebi sua escolha. Vamos seguir com as próximas informações por aqui.';
    await this.store.saveConversation(conversation);
    await this.store.saveOutbound(conversation.id, responseText);
    return { to: message.from, state: menuState(conversation), text: responseText };
  }
}

function menuState(conversation: StoredConversation): MenuResponse['state'] {
  if (conversation.state === 'consent') return 'CONSENT';
  if (conversation.state === 'route') return 'ROUTE';
  if (conversation.state === 'human') return 'HANDOFF_HUMANO';
  if (conversation.route === 'technical') return 'TECHNICAL_PENDING';
  return conversation.context.service ? 'COMMERCIAL_COLLECTING' : 'COMMERCIAL_SERVICE_MENU';
}
function normalize(value?: string): string {
  return (value ?? '').trim().toLocaleLowerCase('pt-BR');
}
function isConsent(value: string): boolean {
  return value === '1' || value === 'sim' || value === 'sim, continuar' || value === 'continuar';
}
function isHuman(value: string): boolean {
  return (
    value.includes('falar com uma pessoa') ||
    value.includes('atendente') ||
    value.includes('humano')
  );
}
