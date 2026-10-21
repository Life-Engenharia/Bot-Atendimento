import {
  SupabaseConversationStore,
  StoredConversation,
} from '../../../infra/supabase/conversation-store.js';
import {
  commercialServices,
  commercialServiceByOption,
  commercialServiceMenu,
} from '../../commercial/domain/commercial-services.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  AdministrativeMenuService,
  AdministrativeResponse,
  OperationalConfigurationStore,
} from '../../internal_operations/application/administrative-menu-service.js';
import type { OperationalNotifier } from '../../internal_operations/application/operational-notifier.js';
import { IncomingMessage, WebhookResult } from '../../webhook/application/webhook-processor.js';
import { MenuResponse } from './menu-service.js';
import { TriageAnalyzer } from './triage-analyzer.js';
import { ResponseRefiner } from './response-refiner.js';
import { identifyEquipment } from '../domain/equipment-catalog.js';
import { MediaIngestionService } from './media-ingestion-service.js';

type BotResponse = MenuResponse | AdministrativeResponse;

export type OutboundSender = {
  sendText(to: string, body: string): Promise<{ messageId: string }>;
  sendImage?(
    to: string,
    content: Uint8Array,
    mimeType?: string,
    fileName?: string,
  ): Promise<{ messageId: string }>;
  sendButtons?(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<{ messageId: string }>;
  sendList?(
    to: string,
    body: string,
    buttonText: string,
    rows: Array<{ id: string; title: string; description?: string }>,
    sectionTitle?: string,
  ): Promise<{ messageId: string }>;
};

const consentMessage =
  'Olá! Eu sou a assistente virtual da Life Engenharia. Vou fazer algumas perguntas rápidas para encaminhar seu atendimento ao time certo.\n\nSeus dados serão usados apenas para tratar esta solicitação. Podemos continuar?';
const routeMenu =
  'Perfeito! Como posso te ajudar hoje?\n\n1. Quero contratar um serviço ou pedir um orçamento\n2. Já sou cliente Life e preciso de assistência técnica\n3. Quero falar com uma pessoa';
const humanMessage =
  'Claro! Vou encaminhar sua solicitação para uma pessoa da equipe Life. Assim que possível, ela seguirá com você por aqui.';

export class PersistedMenuService {
  constructor(
    private readonly store: SupabaseConversationStore,
    private readonly administrativeMenu?: AdministrativeMenuService,
    private readonly triageAnalyzer?: TriageAnalyzer,
    private readonly outboundSender?: OutboundSender,
    private readonly responseRefiner?: ResponseRefiner,
    private readonly mediaIngestionService?: MediaIngestionService,
    private readonly operationalNotifier?: OperationalNotifier,
    private readonly onInboundPersisted?: () => void,
    private readonly operationalConfigurationStore?: OperationalConfigurationStore,
  ) {}

  async process(
    messages: IncomingMessage[],
  ): Promise<WebhookResult & { responses: BotResponse[] }> {
    let processed = 0;
    let duplicates = 0;
    const acceptedMessages: IncomingMessage[] = [];
    const responses: BotResponse[] = [];
    for (const message of messages) {
      const accepted = await this.store.acceptInbound(message);
      if (!accepted) {
        duplicates += 1;
        continue;
      }
      processed += 1;
      acceptedMessages.push(message);
      this.onInboundPersisted?.();
      await this.mediaIngestionService?.ingest(accepted.conversation, message.media);
      const administrativeResponse = await this.administrativeMenu?.handle(
        message.from,
        message.text,
      );
      responses.push(
        administrativeResponse ??
          (accepted.surveyResponse === 'resolved'
            ? await this.handleResolutionSurvey(message, accepted.conversation)
            : accepted.reopened
              ? await this.handleReopened(message, accepted.conversation)
              : await this.handle(message, accepted.conversation)),
      );
    }
    return { processed, duplicates, acceptedMessages, responses };
  }

  private async handleReopened(
    message: IncomingMessage,
    conversation: StoredConversation,
  ): Promise<MenuResponse> {
    await this.store.recordHandoff(conversation, 'customer_reopened', 'customer');
    await this.store.audit('conversation.reopened_by_customer', 'customer', {
      conversationId: conversation.id,
      phone: message.from,
    });
    return this.finish(
      conversation,
      message.from,
      'Seu atendimento foi reaberto e voltou para a fila da equipe Life. Se puder, envie uma atualização breve sobre o que ainda precisa de ajuda.',
    );
  }

  private async handleResolutionSurvey(
    message: IncomingMessage,
    conversation: StoredConversation,
  ): Promise<MenuResponse> {
    await this.store.audit('conversation.resolution_confirmed', 'customer', {
      conversationId: conversation.id,
      phone: message.from,
    });
    return this.finish(
      conversation,
      message.from,
      'Obrigado pela confirmação. Ficamos à disposição sempre que precisar.',
    );
  }

  private async handle(
    message: IncomingMessage,
    conversation: StoredConversation,
  ): Promise<MenuResponse> {
    const interactionText: Record<string, string> = {
      consent_yes: '1',
      human: '2',
      route_commercial: '1',
      route_technical: '2',
      confirm: 'confirmar',
      edit: 'editar',
      impact_stopped: 'totalmente parado',
      impact_partial: 'parcialmente operante',
      impact_working: 'funcionando',
      answer_yes: 'sim',
      answer_no: 'não',
      answer_unknown: 'não sei',
      edit_location: 'editar local',
      edit_contact: 'editar nome',
      edit_company: 'editar empresa',
      edit_phone: 'editar telefone',
      edit_email: 'editar e-mail',
      edit_timeline: 'editar prazo',
      edit_need: 'editar necessidade',
      edit_document: 'editar cnpj',
      tech_edit_contact: 'editar nome',
      tech_edit_company: 'editar empresa',
      tech_edit_location: 'editar local',
      tech_edit_equipment: 'editar equipamento',
      tech_edit_symptom: 'editar problema',
      tech_edit_impact: 'editar impacto',
      tech_edit_contingency: 'editar contingência',
      tech_edit_risk: 'editar risco',
    };
    const input = (interactionText[message.interactiveId ?? ''] ?? message.text ?? '').trim();
    const text = normalize(input);
    const firstGreeting =
      conversation.state === 'consent' && !conversation.context.greetingImageSent;
    if (firstGreeting && this.outboundSender?.sendImage) {
      try {
        const image = await readFile(resolve(process.cwd(), 'assets/life-atendimento.png'));
        const delivery = await this.outboundSender.sendImage(
          message.from,
          image,
          'image/png',
          'life-atendimento.png',
        );
        conversation.context.greetingImageSent = true;
        await this.store.saveOutbound(conversation.id, '[Imagem de saudação Life Engenharia]', {
          messageId: delivery.messageId,
          status: 'sent',
        });
      } catch {
        // A mensagem textual continua sendo enviada mesmo se a imagem falhar.
      }
    }
    if (text === 'status' || text === 'andamento') {
      const stateLabel: Record<StoredConversation['state'], string> = {
        started: 'iniciado',
        consent: 'aguardando confirmação',
        route: 'aguardando escolha do atendimento',
        collecting: 'em triagem',
        review: 'aguardando confirmação dos dados',
        queued: 'na fila da equipe',
        human: 'em atendimento humano',
        closed: 'concluído',
      };
      return this.finish(
        conversation,
        message.from,
        `Status do atendimento: ${stateLabel[conversation.state] ?? 'em andamento'}.`,
      );
    }
    if (text === 'cancelar' || text === 'cancelamento') {
      conversation.state = 'closed';
      await this.store.audit('conversation.cancelled_by_customer', 'customer', {
        phone: message.from,
      });
      return this.finish(
        conversation,
        message.from,
        'Tudo bem. O atendimento foi cancelado. Quando precisar, envie uma nova mensagem para iniciar outro atendimento.',
      );
    }
    if (['reiniciar', 'recomeçar', 'recomecar', 'menu', 'início', 'inicio'].includes(text)) {
      conversation.state = 'consent';
      conversation.route = null;
      conversation.context = {};
      conversation.context.initialIntent = undefined;
      return this.finish(conversation, message.from, consentMessage);
    }
    let responseText: string;
    if (conversation.state === 'consent') {
      if (!text && message.media?.length) {
        responseText = `Recebi ${describeMedia(message.media)}. ${consentMessage}`;
      } else if (!text) responseText = consentMessage;
      else if (isHuman(text) || text === '2') {
        conversation.state = 'human';
        conversation.route = 'human';
        responseText = humanMessage;
        await this.store.recordHandoff(conversation, 'customer_requested', 'customer');
        await this.store.audit('menu.handoff_requested', 'customer', { phone: message.from });
      } else if (isConsent(text)) {
        conversation.state = 'route';
        const suggestedRoute =
          inferRoute(conversation.context.initialIntent) ??
          (await this.tryClassify(conversation.context.initialIntent ?? ''));
        if (suggestedRoute) {
          conversation.context.suggestedRoute = suggestedRoute;
          responseText =
            suggestedRoute === 'technical'
              ? 'Pelo que você descreveu, parece que precisa de assistência técnica. Posso seguir com essa triagem? Responda SIM para continuar ou escolha outra opção abaixo.\n\n1. Orçamento ou serviço\n2. Assistência técnica\n3. Falar com uma pessoa'
              : 'Pelo que você descreveu, parece que busca um serviço ou orçamento. Posso seguir por esse caminho? Responda SIM para continuar ou escolha outra opção abaixo.\n\n1. Orçamento ou serviço\n2. Assistência técnica\n3. Falar com uma pessoa';
        } else responseText = routeMenu;
        await this.store.audit('menu.consent_accepted', 'customer', { phone: message.from });
      } else if (isHuman(text) || text === '2') {
        conversation.state = 'human';
        conversation.route = 'human';
        responseText = humanMessage;
        await this.store.recordHandoff(conversation, 'customer_requested', 'customer');
      } else {
        conversation.context.initialIntent = input;
        const equipment = identifyEquipment(input);
        if (equipment) {
          conversation.context.equipmentDomain = equipment.domain;
          conversation.context.identifiedEquipment = equipment.label;
        }
        const intentAcknowledgement = equipment
          ? `Entendi que você precisa de apoio técnico com ${equipment.label}. `
          : inferRoute(input) === 'technical'
            ? 'Entendi que você precisa de apoio técnico. '
            : inferRoute(input) === 'commercial'
              ? 'Entendi que você quer falar sobre um serviço ou orçamento. '
              : 'Entendi que você precisa de atendimento. ';
        responseText = `${intentAcknowledgement}Para organizar sua solicitação e encaminhá-la ao time responsável, preciso registrar as informações desta conversa. Podemos continuar?\n\n1. Sim, vamos lá\n2. Prefiro falar com uma pessoa\n\nResponda 1 para autorizar o registro e continuar, ou 2 para falar com uma pessoa.`;
      }
    } else if (conversation.state === 'route') {
      if (isHuman(text) || text === '3') {
        conversation.state = 'human';
        conversation.route = 'human';
        responseText = humanMessage;
        await this.store.recordHandoff(conversation, 'customer_requested', 'customer');
        await this.store.audit('menu.handoff_requested', 'customer', { phone: message.from });
      } else if (text === 'sim' && conversation.context.suggestedRoute === 'commercial') {
        conversation.state = 'collecting';
        conversation.route = 'commercial';
        delete conversation.context.suggestedRoute;
        responseText = commercialServiceMenu();
      } else if (text === 'sim' && conversation.context.suggestedRoute === 'technical') {
        conversation.state = 'collecting';
        conversation.route = 'technical';
        delete conversation.context.suggestedRoute;
        responseText = `Entendi. Vou organizar as informações para a equipe técnica, sem orientar nenhuma intervenção no equipamento.\n\n${technicalQuestion('contactName')}`;
      } else if ((text === 'não' || text === 'nao') && conversation.context.suggestedRoute) {
        delete conversation.context.suggestedRoute;
        responseText = routeMenu;
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
        responseText = `Entendi. Vou fazer algumas perguntas rápidas para organizar o chamado. Por segurança, não mexa no equipamento nem em painéis energizados; a equipe técnica vai validar as informações antes de orientar qualquer ação.\n\n${technicalQuestion('contactName')}`;
        await this.store.audit('menu.technical_selected', 'customer', { phone: message.from });
      } else {
        const analysis = await this.tryClassify(text);
        if (analysis === 'commercial') {
          conversation.state = 'collecting';
          conversation.route = 'commercial';
          responseText = commercialServiceMenu();
          await this.store.audit('menu.ai_commercial_selected', 'openai', { phone: message.from });
        } else if (analysis === 'technical') {
          conversation.state = 'collecting';
          conversation.route = 'technical';
          responseText = `Entendi. Vou fazer algumas perguntas rápidas para organizar o chamado. Por segurança, não mexa no equipamento nem em painéis energizados; a equipe técnica vai validar as informações antes de orientar qualquer ação.\n\n${technicalQuestion('contactName')}`;
          await this.store.audit('menu.ai_technical_selected', 'openai', { phone: message.from });
        } else {
          conversation.state = 'human';
          conversation.route = 'human';
          responseText =
            'Não consegui identificar sua solicitação com segurança. Vou encaminhar esta conversa para uma pessoa da equipe Life.';
          await this.store.recordHandoff(conversation, 'classification_unresolved', 'bot');
          await this.store.audit('menu.classification_unresolved', 'bot', { phone: message.from });
        }
      }
    } else if (
      conversation.state === 'collecting' &&
      conversation.route === 'commercial' &&
      !conversation.context.service
    ) {
      const service = commercialServiceByOption(text);
      if (!service)
        responseText =
          'Não reconheci esse serviço. Escolha um item da lista, envie o número de 1 a 10 ou digite o nome do serviço (por exemplo: Projetos).';
      else {
        conversation.context.service = service;
        responseText = `Perfeito, você selecionou ${service}. Em qual cidade e unidade será o atendimento?`;
        await this.store.audit('commercial.service_selected', 'customer', {
          phone: message.from,
          service,
        });
      }
    } else if (conversation.state === 'collecting' && conversation.route === 'technical') {
      const editing = conversation.context.editingTechnicalField as
        TechnicalContextField | undefined;
      if (conversation.context.selectingTechnicalEditField) {
        const field = technicalFieldFromLabel(text.slice(7));
        if (!field) responseText = 'Escolha o dado que deseja corrigir na lista acima.';
        else {
          delete conversation.context.selectingTechnicalEditField;
          conversation.context.editingTechnicalField = field;
          responseText = technicalQuestion(field, conversation);
        }
      } else if (conversation.context.impactConfirmation) {
        if (!/(parcial|parado|totalmente|funcionando)/i.test(input)) {
          responseText =
            'Para registrar corretamente, responda se o equipamento está TOTALMENTE PARADO, PARCIALMENTE OPERANTE ou FUNCIONANDO.';
        } else {
          conversation.context.operationalImpact = input;
          delete conversation.context.impactConfirmation;
          responseText = technicalQuestion('contingency');
        }
      } else {
        const nextField = editing ?? nextTechnicalField(conversation);
        if (!nextField) throw new Error('Não há campo técnico pendente.');
        if (!input) responseText = technicalQuestion(nextField, conversation);
        else {
          if (
            nextField === 'operationalImpact' &&
            hasImpactConflict(conversation.context.symptom, input)
          ) {
            conversation.context.impactConfirmation = input;
            responseText =
              'Só para confirmar a urgência: você informou que o equipamento “apagou de vez”, mas agora mencionou operação parcial. Ele está TOTALMENTE PARADO, PARCIALMENTE OPERANTE ou já voltou a FUNCIONAR?';
          } else {
            conversation.context[nextField] = input;
            delete conversation.context.editingTechnicalField;
            if (nextField === 'contractReference' && hasNoLifeHistory(input)) {
              conversation.route = 'commercial';
              conversation.context.service = 'Assistência avulsa';
              responseText =
                'Entendi. Como não há contrato ou histórico Life identificado, vou encaminhar como assistência avulsa para o Comercial, sem perder os dados que você já informou. Informe o CNPJ ou responda “pessoa física”.';
              await this.store.audit('technical.assistance_avulsa_routed', 'rules', {
                phone: message.from,
              });
            } else {
              const following = nextTechnicalField(conversation);
              if (following) responseText = technicalQuestion(following, conversation);
              else {
                const priority = suggestTechnicalPriority(conversation);
                conversation.state = 'review';
                responseText = technicalSummary(conversation, priority);
                await this.store.audit('technical.review_ready', 'rules', {
                  phone: message.from,
                  priority: priority.level,
                  reason: priority.reason,
                });
              }
            }
          }
        }
      }
    } else if (conversation.state === 'collecting' && conversation.route === 'commercial') {
      const editing = conversation.context.editingField as CommercialContextField | undefined;
      if (conversation.context.selectingEditField) {
        const field = commercialFieldFromLabel(text.slice(7));
        if (!field) responseText = 'Escolha o dado que deseja corrigir na lista acima.';
        else {
          delete conversation.context.selectingEditField;
          conversation.context.editingField = field;
          responseText = commercialQuestion(field);
        }
      } else {
        const nextField = editing ?? nextCommercialField(conversation);
        if (!nextField) throw new Error('Não há campo comercial pendente.');
        if (!input) responseText = commercialQuestion(nextField);
        else {
          const value = input;
          if (
            nextField === 'cnpj' &&
            !isOptionalDocumentAnswer(value) &&
            !isValidCnpjOrCpf(value)
          ) {
            responseText =
              'Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos. Se não souber, responda “não sei” para continuar e deixar essa informação pendente.';
          } else if (
            nextField === 'email' &&
            value.toLocaleLowerCase('pt-BR') !== 'pular' &&
            !isValidEmail(value)
          ) {
            responseText =
              'Informe um e-mail válido ou responda “pular” para continuar sem esse dado.';
          } else if (nextField === 'contactPhone' && !isValidPhone(value)) {
            responseText =
              'Informe o telefone com DDD, somente números ou no formato +55 79 99999-9999.';
          } else {
            conversation.context[nextField] =
              isOptionalDocumentAnswer(value)
                ? 'pendente de confirmação'
                : value;
            delete conversation.context.editingField;
            const followingField = nextCommercialField(conversation);
            if (followingField) responseText = commercialQuestion(followingField);
            else {
              conversation.state = 'review';
              responseText = commercialSummary(conversation);
              await this.store.audit('commercial.review_ready', 'customer', {
                phone: message.from,
              });
            }
          }
        }
      }
    } else if (conversation.state === 'review' && conversation.route === 'commercial') {
      if (text === 'confirmar' || text === 'sim') {
        const reference = await this.store.createCommercialProtocol(conversation);
        conversation.state = 'queued';
        void this.operationalNotifier?.commercial(reference, conversation).catch(() => undefined);
        responseText = `Solicitação confirmada. Seu protocolo é ${reference}. A equipe comercial seguirá com você por aqui.${(await this.isOutsideBusinessHours('commercial')) ? ' Recebemos sua solicitação fora do horário comercial e ela será direcionada no próximo período de atendimento.' : ''}`;
      } else if (text === 'editar') {
        conversation.state = 'collecting';
        conversation.context.selectingEditField = true;
        responseText = 'Qual dado deseja corrigir? Escolha uma opção abaixo.';
      } else if (text.startsWith('editar ')) {
        const field = commercialFieldFromLabel(text.slice(7));
        if (!field)
          responseText =
            'Você pode editar: local, nome, empresa, cnpj, telefone, e-mail, prazo ou necessidade.';
        else {
          conversation.state = 'collecting';
          conversation.context.editingField = field;
          responseText = commercialQuestion(field);
        }
      } else {
        responseText =
          'Revise os dados acima. Responda CONFIRMAR para gerar o protocolo ou “editar nome do campo” para corrigir uma informação.';
      }
    } else if (conversation.state === 'review' && conversation.route === 'technical') {
      if (text === 'confirmar' || text === 'sim') {
        const priority = suggestTechnicalPriority(conversation);
        const reference = await this.store.createTechnicalProtocol(
          conversation,
          priority.level,
          priority.reason,
        );
        conversation.state = 'queued';
        void this.operationalNotifier
          ?.technical(reference, priority.level, conversation)
          .catch(() => undefined);
        responseText = `Pré-triagem confirmada. Seu protocolo é ${reference}, com prioridade ${priority.level}. A equipe Life vai validar as informações e retornar por aqui.${priority.level === 'P1' || priority.level === 'P2' ? ' O plantão foi notificado para acompanhamento prioritário.' : (await this.isOutsideBusinessHours('technical')) ? ' Recebemos seu chamado fora do horário regular; ele será encaminhado conforme a escala de plantão.' : ''} Em caso de risco imediato, mantenha o local seguro e acione também os procedimentos internos da unidade.`;
        await this.store.recordHandoff(conversation, `technical_${priority.level}`, 'system');
        await this.store.audit('technical.priority_suggested', 'rules', {
          phone: message.from,
          priority: priority.level,
          reason: priority.reason,
        });
      } else if (text === 'editar') {
        conversation.state = 'collecting';
        conversation.context.selectingTechnicalEditField = true;
        responseText = 'Qual dado da pré-triagem deseja corrigir? Escolha uma opção abaixo.';
      } else if (text.startsWith('editar ')) {
        const field = technicalFieldFromLabel(text.slice(7));
        if (!field)
          responseText =
            'Você pode corrigir: nome, local, equipamento, problema, impacto, contingência ou risco.';
        else {
          conversation.state = 'collecting';
          conversation.context.editingTechnicalField = field;
          responseText = technicalQuestion(field, conversation);
        }
      } else {
        responseText =
          'Revise os dados acima. Responda CONFIRMAR para registrar a pré-triagem ou descreva o dado que precisa corrigir para ser encaminhado à equipe.';
      }
    } else if (conversation.state === 'human') {
      // Atendimento humano ativo: não envie respostas automáticas que concorram com o operador.
      responseText = '';
    } else if (conversation.state === 'queued' && conversation.route === 'technical')
      responseText = isThanks(text)
        ? 'Por nada! Sua pré-triagem já está registrada. Se surgir alguma alteração importante, como parada total ou risco, envie por aqui para que a equipe veja no histórico.'
        : 'Sua pré-triagem já foi registrada e está com a equipe Life. Você pode enviar informações adicionais por aqui enquanto aguarda o retorno.';
    else if (conversation.state === 'queued' && conversation.route === 'commercial')
      responseText = isThanks(text)
        ? 'Por nada! Sua solicitação já está registrada com a equipe comercial. Se lembrar de algum detalhe útil, pode enviar por aqui.'
        : 'Sua solicitação comercial já foi registrada. Você pode enviar informações adicionais por aqui enquanto aguarda o retorno da equipe.';
    else
      responseText =
        'Perfeito, recebi sua escolha. Vamos seguir com as próximas informações por aqui.';
    if (message.media?.length && conversation.state !== 'consent')
      responseText = `Recebi ${describeMedia(message.media)} e anexei ao seu atendimento. ${responseText}`;
    responseText = await this.refineSupportReply(conversation, message.text, responseText);
    await this.store.saveConversation(conversation);
    await this.deliverOutbound(conversation, message.from, responseText);
    return { to: message.from, state: menuState(conversation), text: responseText };
  }

  private async finish(
    conversation: StoredConversation,
    to: string,
    text: string,
  ): Promise<MenuResponse> {
    await this.store.saveConversation(conversation);
    await this.deliverOutbound(conversation, to, text);
    return { to, state: menuState(conversation), text };
  }

  private async deliverOutbound(
    conversation: StoredConversation,
    to: string,
    text: string,
  ): Promise<void> {
    if (!text.trim()) return;
    if (!this.outboundSender) {
      await this.store.saveOutbound(conversation.id, text);
      return;
    }
    try {
      const buttons = interactiveButtons(conversation, text);
      const list = interactiveServiceList(conversation);
      const selectingCorrection = Boolean(
        conversation.context.selectingEditField || conversation.context.selectingTechnicalEditField,
      );
      const send = () =>
        list && this.outboundSender!.sendList
          ? this.outboundSender!.sendList(
              to,
              text,
              selectingCorrection ? 'Corrigir dado' : 'Ver serviços',
              list,
              selectingCorrection ? 'Dados para corrigir' : 'Serviços',
            )
          : buttons && this.outboundSender!.sendButtons
            ? this.outboundSender!.sendButtons(to, text, buttons)
            : this.outboundSender!.sendText(to, text);
      let result;
      try {
        result = await send();
      } catch (firstError) {
        // Falhas transitórias de rede/Meta não devem encerrar o turno do bot.
        // Uma segunda tentativa curta evita que o cliente fique sem a próxima
        // pergunta quando a primeira chamada perde a conexão.
        await new Promise((resolve) => setTimeout(resolve, 350));
        try {
          result = await send();
        } catch {
          throw firstError;
        }
      }
      await this.store.saveOutbound(conversation.id, text, {
        messageId: result.messageId,
        status: 'sent',
      });
      await this.store.audit('meta.outbound_sent', 'system', {
        conversationId: conversation.id,
        metaMessageId: result.messageId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro desconhecido ao enviar mensagem.';
      await this.store.saveOutbound(conversation.id, text, {
        messageId: `failed-outbound:${crypto.randomUUID()}`,
        status: 'failed',
      });
      await this.store.audit('meta.outbound_failed', 'system', {
        conversationId: conversation.id,
        error: message,
      });
    }
  }

  private async tryClassify(text: string): Promise<'commercial' | 'technical' | undefined> {
    if (!this.triageAnalyzer || !text) return undefined;
    try {
      const analysis = await this.triageAnalyzer.classify(text);
      return analysis.confidence >= 0.8 && analysis.route !== 'human' ? analysis.route : undefined;
    } catch {
      return undefined;
    }
  }

  private async isOutsideBusinessHours(area: 'commercial' | 'technical'): Promise<boolean> {
    if (!this.operationalConfigurationStore) return false;
    try {
      const schedules = (await this.operationalConfigurationStore.listSettings()).filter(
        (setting) => setting.key === 'horarios' && setting.value.area?.toLowerCase() === area,
      );
      if (!schedules.length) return false;
      const now = new Date();
      const weekday = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][now.getDay()];
      const time = now.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return !schedules.some(
        ({ value }) =>
          scheduleIncludesDay(value.dias ?? '', weekday) &&
          time >= (value.inicio ?? '00:00') &&
          time <= (value.fim ?? '23:59'),
      );
    } catch {
      return false;
    }
  }

  private async refineSupportReply(
    conversation: StoredConversation,
    latestCustomerMessage: string | undefined,
    reply: string,
  ): Promise<string> {
    if (!reply.trim() || !this.responseRefiner || !latestCustomerMessage) return reply;
    // As perguntas, resumos, protocolos e decisões seguem sendo determinísticos.
    // A IA atua somente nas confirmações após a conversa já estar encaminhada.
    if (conversation.state !== 'human' && conversation.state !== 'queued') return reply;
    try {
      return await this.responseRefiner.refine(reply, latestCustomerMessage);
    } catch {
      return reply;
    }
  }
}

type CommercialContextField =
  'location' | 'contactName' | 'company' | 'cnpj' | 'contactPhone' | 'email' | 'timeline' | 'need';

const commercialFields: CommercialContextField[] = [
  'location',
  'contactName',
  'company',
  'cnpj',
  'contactPhone',
  'email',
  'timeline',
  'need',
];

type TechnicalContextField =
  | 'contactName'
  | 'company'
  | 'location'
  | 'contractReference'
  | 'equipment'
  | 'manufacturerModel'
  | 'assetIdentifier'
  | 'symptom'
  | 'alarm'
  | 'startedFrequency'
  | 'operationalImpact'
  | 'contingency'
  | 'reportedRisk';

const technicalFields: TechnicalContextField[] = [
  'contactName',
  'company',
  'location',
  'contractReference',
  'equipment',
  'manufacturerModel',
  'assetIdentifier',
  'symptom',
  'alarm',
  'startedFrequency',
  'operationalImpact',
  'contingency',
  'reportedRisk',
];

function nextTechnicalField(conversation: StoredConversation): TechnicalContextField | undefined {
  return technicalFields.find((field) => !conversation.context[field]);
}

function technicalQuestion(
  field: TechnicalContextField,
  conversation?: StoredConversation,
): string {
  const questions: Record<TechnicalContextField, string> = {
    contactName: 'Para identificar quem solicitou o atendimento, qual é o seu nome?',
    company: 'Qual é a empresa ou instituição responsável pela unidade?',
    location:
      'Para localizar o atendimento, qual unidade/local está com o problema e quem é o contato no local?',
    contractReference:
      'Para verificarmos o histórico do equipamento, há contrato ativo ou atendimento anterior da Life? Se não souber, escreva “não sei”.',
    equipment: 'Qual equipamento está afetado?',
    manufacturerModel:
      'Informe fabricante e modelo, se disponíveis. Caso não saiba, escreva “não identificado”.',
    assetIdentifier:
      'Informe o patrimônio ou número de série, se disponível. Caso não saiba, escreva “não identificado”.',
    symptom: 'Descreva o que está acontecendo. Não tente abrir equipamentos ou alterar painéis.',
    alarm:
      'Há algum código ou mensagem de alarme? Caso não exista ou não saiba, escreva “não informado”.',
    startedFrequency: 'Quando começou e acontece sempre ou de forma intermitente?',
    operationalImpact:
      'Para definir a urgência, o equipamento está totalmente parado, parcialmente operante ou funcionando?',
    contingency: 'Existe equipamento alternativo ou plano de contingência?',
    reportedRisk:
      conversation?.context.equipmentDomain === 'hemotherapy'
        ? 'Há risco para bolsas de sangue, hemocomponentes, doadores, pacientes ou uma operação essencial?'
        : 'Há risco para pessoas, sangue, medicamentos ou uma operação essencial?',
  };
  return questions[field];
}

function suggestTechnicalPriority(conversation: StoredConversation): {
  level: 'P1' | 'P2' | 'P3' | 'P4';
  reason: string;
} {
  const context = conversation.context;
  const value =
    `${context.operationalImpact} ${context.contingency} ${context.reportedRisk} ${context.symptom}`.toLocaleLowerCase(
      'pt-BR',
    );
  const criticalRisk = /(risco|pessoas|sangue|medicamento|essencial|vida)/.test(value);
  const stopped = /(parad|totalmente|inoperante|apagou|desligou|não liga|nao liga)/.test(value);
  const noBackup = /(sem conting|não.*alternativ|nao.*alternativ|nenhum)/.test(value);
  if (criticalRisk && stopped && noBackup)
    return {
      level: 'P1',
      reason: 'Risco crítico informado, equipamento parado e sem contingência.',
    };
  if (
    stopped ||
    (criticalRisk && noBackup) ||
    /(falha relevante|contingência limitada|contingencia limitada)/.test(value)
  )
    return {
      level: 'P2',
      reason:
        'Parada, risco relevante ou contingência insuficiente; requer retorno humano prioritário.',
    };
  if (/(parcial|reduz|intermitente|alarme)/.test(value))
    return { level: 'P3', reason: 'Falha parcial ou desempenho reduzido informado.' };
  return { level: 'P4', reason: 'Demanda sem interrupção crítica identificada na pré-triagem.' };
}

function nextCommercialField(conversation: StoredConversation): CommercialContextField | undefined {
  return commercialFields.find((field) => !conversation.context[field]);
}

function commercialQuestion(field: CommercialContextField): string {
  const questions: Record<CommercialContextField, string> = {
    location: 'Em qual cidade e unidade será o atendimento?',
    contactName: 'Qual é o seu nome para identificação?',
    company: 'Qual é a empresa ou instituição? Se for pessoa física, responda “pessoa física”.',
    cnpj:
      'Você sabe o CNPJ da empresa? Envie os 14 dígitos ou responda “não sei” para continuar e deixar essa informação pendente de confirmação.',
    contactPhone: 'Qual telefone devemos usar para retorno?',
    email: 'Qual e-mail devemos usar para retorno? Se preferir não informar, responda “pular”.',
    timeline: 'Qual é o prazo desejado para este atendimento?',
    need: 'Descreva brevemente a necessidade ou o objetivo do serviço.',
  };
  return questions[field];
}

function commercialSummary(conversation: StoredConversation): string {
  const context = conversation.context;
  return [
    'Confira os dados da sua solicitação',
    '',
    `Serviço: ${context.service}`,
    `Local: ${context.location}`,
    `Contato: ${context.contactName}`,
    `Empresa: ${context.company}`,
    `Documento: ${context.cnpj}`,
    `Telefone: ${formatPhone(context.contactPhone)}`,
    `E-mail: ${context.email}`,
    `Prazo: ${context.timeline}`,
    `Necessidade: ${context.need}`,
    '',
    'Use os botões abaixo para confirmar ou corrigir os dados.',
  ].join('\n');
}

function formatPhone(value?: string): string {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 13)
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return value ?? 'não informado';
}

function technicalSummary(
  conversation: StoredConversation,
  priority: { level: 'P1' | 'P2' | 'P3' | 'P4'; reason: string },
): string {
  const context = conversation.context;
  return [
    'Revise a pré-triagem técnica:',
    `• Contato: ${context.contactName} · ${context.company}`,
    `• Local: ${context.location}`,
    `• Contrato/histórico: ${context.contractReference}`,
    `• Equipamento: ${context.equipment} · ${context.manufacturerModel}`,
    `• Patrimônio/série: ${context.assetIdentifier}`,
    `• Sintoma: ${context.symptom}`,
    `• Alarme: ${context.alarm}`,
    `• Impacto: ${context.operationalImpact} · Contingência: ${context.contingency}`,
    `• Risco informado: ${context.reportedRisk}`,
    `• Prioridade sugerida: ${priority.level} — ${priority.reason}`,
    '',
    'Responda CONFIRMAR para registrar a pré-triagem. A prioridade será validada por uma pessoa da equipe Life.',
  ].join('\n');
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

function inferRoute(message?: string): 'commercial' | 'technical' | undefined {
  if (identifyEquipment(message)) return 'technical';
  const value = normalize(message);
  if (
    /(chiller|ar[ -]?condicionado|climatiza[cç][aã]o|compo[ -]?guard|compressor|evaporador|condensador|fan[ -]?coil|fancoil|bomba|equipamento|alarme|falha|parou|apagou|queimou|n[aã]o funciona|n[aã]o gela|n[aã]o resfria|vazamento|temperatura|manuten[cç][aã]o|assist[eê]ncia)/.test(
      value,
    )
  )
    return 'technical';
  if (/(orçamento|orcamento|proposta|contratar|projeto|comprar|locação|locacao)/.test(value))
    return 'commercial';
  return undefined;
}

function hasImpactConflict(symptom?: string, impact?: string): boolean {
  const reportedStop = /(apagou|parou|inoperante|não liga|nao liga|desligou)/i.test(symptom ?? '');
  const reportedPartial = /(parcial|funcionando)/i.test(impact ?? '');
  return reportedStop && reportedPartial;
}

function isThanks(value: string): boolean {
  return /\b(obrigad|valeu|agradeç|agradec|gratid)/i.test(value.trim());
}

function describeMedia(media: NonNullable<IncomingMessage['media']>): string {
  const types = [
    ...new Set(
      media.map(
        (item) =>
          ({ image: 'uma imagem', audio: 'um áudio', video: 'um vídeo', document: 'um documento' })[
            item.type
          ],
      ),
    ),
  ];
  return types.length === 1 ? types[0] : 'mídias anexadas';
}

function asksWhichDetails(value: string): boolean {
  return /(?:qual|quais|que).*detalh|o que.*enviar|mais coisa|mais informa/i.test(value);
}

function hasNoLifeHistory(value: string): boolean {
  return (
    /^(não|nao|sem)(\s+(tenho|contrato|hist[oó]rico|v[ií]nculo))?$/i.test(value.trim()) ||
    /(sem contrato|não tenho contrato|nao tenho contrato|nunca.*life)/i.test(value)
  );
}

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function isValidCnpjOrCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 && digits.length !== 14) return false;
  return !/^(\d)\1+$/.test(digits);
}

function interactiveButtons(
  conversation: StoredConversation,
  text: string,
): Array<{ id: string; title: string }> | undefined {
  const normalized = normalize(text);
  if (conversation.state === 'consent')
    return [
      { id: 'consent_yes', title: 'Sim, continuar' },
      { id: 'human', title: 'Falar com pessoa' },
    ];
  if (conversation.state === 'route')
    return [
      { id: 'route_commercial', title: 'Orçamento' },
      { id: 'route_technical', title: 'Assistência técnica' },
      { id: 'human', title: 'Falar com pessoa' },
    ];
  if (
    conversation.state === 'collecting' &&
    conversation.route === 'technical' &&
    !conversation.context.operationalImpact &&
    normalized.includes('equipamento está')
  )
    return [
      { id: 'impact_stopped', title: 'Totalmente parado' },
      { id: 'impact_partial', title: 'Parcialmente operante' },
      { id: 'impact_working', title: 'Funcionando' },
    ];
  if (
    conversation.state === 'collecting' &&
    conversation.route === 'technical' &&
    normalized.includes('existe equipamento alternativo')
  )
    return [
      { id: 'answer_yes', title: 'Sim' },
      { id: 'answer_no', title: 'Não' },
      { id: 'answer_unknown', title: 'Não sei' },
    ];
  if (
    conversation.state === 'collecting' &&
    conversation.route === 'technical' &&
    normalized.includes('há risco para')
  )
    return [
      { id: 'answer_yes', title: 'Sim' },
      { id: 'answer_no', title: 'Não' },
    ];
  if (
    conversation.state === 'collecting' &&
    conversation.route === 'commercial' &&
    !conversation.context.service
  )
    return undefined;
  if (conversation.state === 'review')
    return [
      { id: 'confirm', title: 'Confirmar' },
      { id: 'edit', title: 'Corrigir dados' },
    ];
  if (normalized.includes('não consegui identificar'))
    return [{ id: 'human', title: 'Falar com pessoa' }];
  return undefined;
}

function interactiveServiceList(
  conversation: StoredConversation,
): Array<{ id: string; title: string; description?: string }> | undefined {
  if (conversation.state !== 'collecting') return undefined;
  if (conversation.route === 'commercial' && conversation.context.selectingEditField)
    return [
      { id: 'edit_location', title: 'Local / unidade' },
      { id: 'edit_contact', title: 'Nome do contato' },
      { id: 'edit_company', title: 'Empresa' },
      { id: 'edit_document', title: 'CNPJ ou CPF' },
      { id: 'edit_phone', title: 'Telefone' },
      { id: 'edit_email', title: 'E-mail' },
      { id: 'edit_timeline', title: 'Prazo' },
      { id: 'edit_need', title: 'Necessidade' },
    ];
  if (conversation.route === 'technical' && conversation.context.selectingTechnicalEditField)
    return [
      { id: 'tech_edit_contact', title: 'Nome do contato' },
      { id: 'tech_edit_company', title: 'Empresa' },
      { id: 'tech_edit_location', title: 'Local / unidade' },
      { id: 'tech_edit_equipment', title: 'Equipamento' },
      { id: 'tech_edit_symptom', title: 'Problema / sintoma' },
      { id: 'tech_edit_impact', title: 'Impacto operacional' },
      { id: 'tech_edit_contingency', title: 'Contingência' },
      { id: 'tech_edit_risk', title: 'Risco informado' },
    ];
  if (conversation.route !== 'commercial' || conversation.context.service) return undefined;
  return commercialServices.map((service, index) => ({
    id: String(index + 1),
    title: service.slice(0, 24),
    description: service.length > 24 ? service : undefined,
  }));
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isOptionalDocumentAnswer(value: string): boolean {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
  return (
    normalized === 'pular' ||
    normalized.startsWith('nao sei') ||
    normalized === 'pessoa fisica' ||
    normalized.startsWith('sou pessoa fisica')
  );
}

function scheduleIncludesDay(days: string, weekday: string): boolean {
  const normalized = days
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
  const order = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const target = weekday === 'sáb' ? 'sab' : weekday;
  if (normalized.includes(target)) return true;
  const range = normalized.match(
    /(dom|seg|ter|qua|qui|sex|sab)\s*-\s*(dom|seg|ter|qua|qui|sex|sab)/,
  );
  if (!range) return false;
  const start = order.indexOf(range[1]);
  const end = order.indexOf(range[2]);
  const index = order.indexOf(target);
  return start <= end ? index >= start && index <= end : index >= start || index <= end;
}

function commercialFieldFromLabel(label: string): CommercialContextField | undefined {
  const aliases: Record<string, CommercialContextField> = {
    local: 'location',
    cidade: 'location',
    nome: 'contactName',
    contato: 'contactName',
    empresa: 'company',
    cnpj: 'cnpj',
    telefone: 'contactPhone',
    celular: 'contactPhone',
    email: 'email',
    'e-mail': 'email',
    prazo: 'timeline',
    necessidade: 'need',
  };
  return aliases[label.trim().toLocaleLowerCase('pt-BR')];
}

function technicalFieldFromLabel(label: string): TechnicalContextField | undefined {
  const aliases: Record<string, TechnicalContextField> = {
    nome: 'contactName',
    contato: 'contactName',
    empresa: 'company',
    local: 'location',
    equipamento: 'equipment',
    problema: 'symptom',
    sintoma: 'symptom',
    impacto: 'operationalImpact',
    contingência: 'contingency',
    contingencia: 'contingency',
    risco: 'reportedRisk',
  };
  return aliases[label.trim().toLocaleLowerCase('pt-BR')];
}
