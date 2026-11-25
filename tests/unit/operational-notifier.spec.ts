import { describe, expect, it, vi } from 'vitest';
import type { StoredConversation, SupabaseConversationStore } from '../../src/infra/supabase/conversation-store.js';
import { OperationalNotifier } from '../../src/modules/internal_operations/application/operational-notifier.js';

const conversation: StoredConversation = {
  id: 'conversation-1',
  state: 'queued',
  route: 'technical',
  context: {
    contactName: 'Ana Cliente',
    contactPhone: '5511999999999',
    location: 'Unidade Norte',
    equipment: 'Chiller',
    symptom: 'Não resfria',
  },
};

function createStore() {
  const audits: Array<{ event: string; details: Record<string, unknown> }> = [];
  return {
    audits,
    store: {
      audit: async (event: string, _actor: string, details: Record<string, unknown>) => {
        audits.push({ event, details });
      },
    } as unknown as SupabaseConversationStore,
  };
}

describe('operational notifier', () => {
  it('sends technical WhatsApp and test email to their configured destinations', async () => {
    const { store, audits } = createStore();
    const whatsapp = { sendText: vi.fn().mockResolvedValue({ messageId: 'wamid-1' }) };
    const email = { send: vi.fn().mockResolvedValue(undefined) };
    const notifier = new OperationalNotifier(
      store,
      whatsapp,
      { technical: '5579998901667' },
      {},
      email,
      { technical: 'informatica@life.eng.br' },
    );

    await notifier.technical('LFE-TECH-0001', 'P1', conversation);

    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '5579998901667',
      expect.stringContaining('LFE-TECH-0001'),
    );
    expect(email.send).toHaveBeenCalledWith({
      to: 'informatica@life.eng.br',
      subject: '[Life Engenharia] Novo chamado técnico LFE-TECH-0001',
      text: expect.stringContaining('Equipamento: Chiller'),
    });
    expect(audits.map((audit) => audit.details.channel).sort()).toEqual(['email', 'whatsapp']);
  });

  it('sends commercial notifications to the sales phone and sales email when in department mode', async () => {
    const { store } = createStore();
    const whatsapp = { sendText: vi.fn().mockResolvedValue({ messageId: 'wamid-2' }) };
    const email = { send: vi.fn().mockResolvedValue(undefined) };
    const notifier = new OperationalNotifier(
      store,
      whatsapp,
      { commercial: '5579999250532' },
      {},
      email,
      { commercial: 'vendas@life.eng.br' },
    );

    await notifier.commercial('LFE-COM-0001', {
      ...conversation,
      route: 'commercial',
      context: { ...conversation.context, service: 'PMOC', company: 'Empresa Alfa' },
    });

    expect(whatsapp.sendText).toHaveBeenCalledWith(
      '5579999250532',
      expect.stringContaining('Empresa Alfa'),
    );
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'vendas@life.eng.br',
      subject: '[Life Engenharia] Nova oportunidade LFE-COM-0001',
      text: expect.stringContaining('Serviço: PMOC'),
    }));
  });

  it('notifies active on-call users instead of every technician for P1 and P2 calls', async () => {
    const { store } = createStore();
    (store as unknown as { listUsers: () => Promise<unknown[]> }).listUsers = async () => [
      { email: 'tecnico@life.eng.br', active: true, role: 'technical', area: 'technical' },
      { email: 'plantao@life.eng.br', active: true, role: 'on_call', area: 'on_call' },
      { email: 'comercial@life.eng.br', active: true, role: 'commercial', area: 'commercial' },
      { email: 'inativo@life.eng.br', active: false, role: 'technical', area: 'technical' },
    ];
    const email = { send: vi.fn().mockResolvedValue(undefined) };
    const notifier = new OperationalNotifier(store, undefined, {}, {}, email, {
      technical: 'tecnica@life.eng.br',
    });

    await notifier.technical('LFE-TECH-0002', 'P2', conversation);

    expect(email.send).toHaveBeenCalledTimes(2);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'plantao@life.eng.br',
      text: expect.stringContaining('aguardando ser assumido'),
    }));
    expect(email.send).not.toHaveBeenCalledWith(expect.objectContaining({ to: 'tecnico@life.eng.br' }));
    expect(email.send).not.toHaveBeenCalledWith(expect.objectContaining({ to: 'comercial@life.eng.br' }));
  });

  it('sends an email when an operator assumes a conversation', async () => {
    const { store } = createStore();
    const email = { send: vi.fn().mockResolvedValue(undefined) };
    const notifier = new OperationalNotifier(store, undefined, {}, {}, email, {
      commercial: 'vendas@life.eng.br',
    });

    await notifier.claimed('LFE-COM-0002', 'João Victor', {
      id: 'conversation-1',
      destinationArea: 'commercial',
      contactName: 'Ana Cliente',
      contactPhone: '5511999999999',
      suggestedPriority: 'P3',
    });

    expect(email.send).toHaveBeenCalledWith({
      to: 'vendas@life.eng.br',
      subject: '[Life Engenharia] Oportunidade assumida LFE-COM-0002',
      text: expect.stringContaining('Responsável: João Victor'),
    });
  });

  it('records and reports when the SMTP sender is not initialized for a new conversation', async () => {
    const { store, audits } = createStore();
    const notifier = new OperationalNotifier(store, undefined, {});

    await expect(notifier.conversationStarted(conversation, 'Olá')).rejects.toThrow(
      'Verifique SMTP_PASSWORD no ambiente do serviço',
    );
    expect(audits).toContainEqual(expect.objectContaining({
      event: 'operation.notification_failed',
      details: expect.objectContaining({ area: 'inbound', channel: 'email' }),
    }));
  });
});
