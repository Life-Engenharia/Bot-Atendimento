import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { PersistedMenuService } from '../src/modules/conversations/application/persisted-menu-service.js';
import { loadEnvironment } from '../src/config/env.js';
import { OpenAiResponseRefiner } from '../src/infra/openai/openai-response-refiner.js';
import {
  StoredConversation,
  SupabaseConversationStore,
} from '../src/infra/supabase/conversation-store.js';

/** Simula apenas o cliente e o bot; não conecta Meta, Supabase ou Ploomes. */
class TerminalConversationStore {
  conversation: StoredConversation = {
    id: 'terminal-conversation',
    state: 'consent',
    route: null,
    context: {},
  };
  private readonly received = new Set<string>();
  private protocolNumber = 0;

  async acceptInbound(message: { id: string }) {
    if (this.received.has(message.id)) return undefined;
    this.received.add(message.id);
    return { conversation: this.conversation };
  }

  async saveConversation(conversation: StoredConversation) {
    this.conversation = {
      ...conversation,
      context: { ...conversation.context },
    };
  }

  async saveOutbound() {
    /* A resposta já é exibida no terminal. */
  }
  async audit() {
    /* A auditoria é intencionalmente local nesta simulação. */
  }
  async recordHandoff() {
    /* A fila humana é simulada pelo estado da conversa. */
  }

  async createCommercialProtocol() {
    this.protocolNumber += 1;
    return `LFE-SIM-${String(this.protocolNumber).padStart(4, '0')}`;
  }

  async createTechnicalProtocol() {
    this.protocolNumber += 1;
    return `LFE-SIM-${String(this.protocolNumber).padStart(4, '0')}`;
  }
}

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const environment = loadEnvironment();
const store = new TerminalConversationStore();
const responseRefiner =
  environment.OPENAI_API_KEY && environment.OPENAI_MODEL
    ? new OpenAiResponseRefiner(environment.OPENAI_API_KEY, environment.OPENAI_MODEL)
    : undefined;
const bot = new PersistedMenuService(
  store as unknown as SupabaseConversationStore,
  undefined,
  undefined,
  undefined,
  responseRefiner,
);
const phone = '5511999999999';
const sessionId = randomUUID();
let messageNumber = 0;
const terminal = createInterface({ input, output, terminal: true });

console.log('\nSimulação Life Engenharia — cliente no terminal');
console.log('Digite como cliente. Use /reiniciar para uma nova conversa ou /sair para encerrar.\n');
console.log(
  `Tom assistido por IA: ${responseRefiner ? 'ativo' : 'desativado (configure OPENAI_API_KEY e OPENAI_MODEL)'}\n`,
);

try {
  while (true) {
    const text = (await terminal.question('Você: ')).trim();
    if (!text) continue;
    if (text.toLocaleLowerCase('pt-BR') === '/sair') break;
    if (text.toLocaleLowerCase('pt-BR') === '/reiniciar') {
      store.conversation = {
        id: `terminal-${randomUUID()}`,
        state: 'consent',
        route: null,
        context: {},
      };
      console.log('Bot: Nova conversa iniciada. Envie uma mensagem para continuar.\n');
      continue;
    }

    const result = await bot.process([
      {
        id: `terminal:${sessionId}:${++messageNumber}`,
        from: phone,
        text,
      },
    ]);
    const response = result.responses[0];
    console.log(`\nBot [${response.state}]: ${response.text}\n`);
  }
} finally {
  terminal.close();
}

console.log('Simulação encerrada.');
