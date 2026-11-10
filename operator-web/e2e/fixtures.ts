import type { Page } from '@playwright/test';

const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60_000).toISOString();

export const conversations = [
  { id: 'c1', protocolId: 'LFE-000142', contactName: 'Construtora Aurora', contactPhone: '5511987650142', state: 'open', suggestedPriority: 'P2', destinationArea: 'commercial', route: 'commercial', updatedAt: iso(38) },
  { id: 'c2', protocolId: 'LFE-000143', contactName: 'Roberto Almeida', contactPhone: '5511991230143', state: 'open', suggestedPriority: 'P1', destinationArea: 'technical', route: 'technical', updatedAt: iso(24) },
  { id: 'c3', protocolId: 'LFE-000137', contactName: 'Condomínio Vila Verde', contactPhone: '5511966780137', state: 'open', suggestedPriority: 'P2', destinationArea: 'technical', route: 'technical', assignedOperator: 'Mariana Costa', updatedAt: iso(5) },
  { id: 'c4', protocolId: 'LFE-000131', contactName: 'Paulo Menezes', contactPhone: '5511955500131', state: 'open', suggestedPriority: 'P4', destinationArea: 'commercial', route: 'commercial', assignedOperator: 'Mariana Costa', followUpAt: iso(-30), updatedAt: iso(300) },
  { id: 'c5', protocolId: 'LFE-000120', contactName: 'Imobiliária Prisma', contactPhone: '5511933210120', state: 'closed', suggestedPriority: 'P4', destinationArea: 'commercial', route: 'commercial', assignedOperator: 'Mariana Costa', updatedAt: iso(600) },
];

export const detail = (id: string) => ({
  ...conversations.find((c) => c.id === id),
  messages: [
    { id: 'm1', content: 'Bom dia, preciso de orçamento.', direction: 'inbound', receivedAt: iso(60) },
    { id: 'm2', content: 'Olá! Já estou cuidando do seu caso.', direction: 'outbound', receivedAt: iso(50), deliveryStatus: 'delivered' },
  ],
  notes: [],
  attachments: [],
});

/** Mock da API do backend. Guarda as chamadas de escrita em `writes`. */
export async function mockOperatorApi(page: Page, writes: string[] = []) {
  await page.route('**/api/operator/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET') writes.push(`${req.method()} ${p}`);
    if (p === '/api/operator/conversations') return json(conversations);
    const m = p.match(/^\/api\/operator\/conversations\/([^/]+)$/);
    if (m) return json(detail(m[1]));
    if (p.endsWith('/history') || p.endsWith('/operators')) return json([]);
    if (p.startsWith('/api/operator/crm/')) return json({ contacts: [], connected: false, reason: 'mock' });
    return json({});
  });
}

/** Sessão já autenticada e dica de primeira visita desligada. */
export async function asOperator(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('operatorToken', 'test');
    sessionStorage.setItem('operatorName', 'Mariana Costa');
    sessionStorage.setItem('operatorRole', 'admin');
    localStorage.setItem('life-operator-tip', '1');
  });
}
