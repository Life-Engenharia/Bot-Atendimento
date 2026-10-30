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
});
