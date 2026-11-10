/** Tipos e regras de domínio do painel, espelhando os dados devolvidos pelo backend atual. */

export type Conversation = {
  id: string;
  protocolId?: string | null;
  contactName?: string;
  contactPhone: string;
  state: string;
  assignedOperator?: string;
  suggestedPriority?: string;
  destinationArea?: string;
  route?: string;
  updatedAt: string;
  followUpAt?: string;
  context?: Record<string, string>;
  messages?: Message[];
  attachments?: Attachment[];
  notes?: Note[];
};
export type Note = { id: string; author: string; content: string; createdAt: string };
export type HistoryItem = {
  id: string;
  protocolId: string | null;
  state: string;
  destinationArea: string | null;
  priority: string | null;
  updatedAt: string;
  resolutionNote: string | null;
};
export type Operator = { id: string; name: string; role: string; area: string };
export type Message = {
  id: string;
  content: string;
  direction: string;
  receivedAt: string;
  deliveryStatus?: string | null;
};
export type Attachment = {
  id: string;
  fileName: string;
  mediaType: string;
  status: string;
  createdAt: string;
  analysisStatus?: string | null;
  extractedText?: string | null;
};

export type BoardColumn = 'waiting' | 'lead' | 'active' | 'followup' | 'closed';
export type NavKey = 'all' | 'commercial' | 'technical' | 'closed';
export type TabKey = 'action' | 'mine' | 'all';
export type Filters = { unassigned: boolean; urgent: boolean; due: boolean };
export type SavedView = { name: string; tab: string; nav: NavKey; group: boolean; filters: Filters };

export const COLUMNS: { id: BoardColumn; title: string; color: string; hint: string; icon: 'clock' | 'target' | 'chat' | 'transfer' | 'done' }[] = [
  { id: 'waiting', title: 'Aguardando', color: '#d9552b', hint: 'Atendimentos novos, sem responsável', icon: 'clock' },
  { id: 'lead', title: 'Lead', color: '#12a6c9', hint: 'Oportunidades comerciais', icon: 'target' },
  { id: 'active', title: 'Em atendimento', color: '#1d5fd1', hint: 'Conversas em andamento', icon: 'chat' },
  { id: 'followup', title: 'Retorno / atenção', color: '#b98a0b', hint: 'Retorno agendado ou aguardando o cliente', icon: 'transfer' },
  { id: 'closed', title: 'Concluídos', color: '#2f7a55', hint: 'Atendimentos encerrados', icon: 'done' },
];
export const COLUMN_TITLE_TO_ID: Record<string, BoardColumn> = Object.fromEntries(COLUMNS.map((c) => [c.title, c.id]));

/** Prazo da primeira resposta por prioridade (minutos). */
export const PRIORITY: Record<string, { symbol: string; limit: number; text: string }> = {
  P1: { symbol: '▲', limit: 15, text: 'Risco imediato · responder em até 15 min' },
  P2: { symbol: '◆', limit: 30, text: 'Urgente · até 30 min' },
  P3: { symbol: '●', limit: 60, text: 'Normal · até 1 h' },
  P4: { symbol: '○', limit: 240, text: 'Baixa · até 4 h' },
};
export const AREA_COLOR: Record<string, string> = { commercial: '#1d5fd1', technical: '#c4631d', other: '#6a7f8c' };
export const DELIVERY: Record<string, string> = {
  queued: 'Na fila',
  sent: '✓ Enviada',
  delivered: '✓✓ Entregue',
  read: '✓✓ Lida',
  failed: 'Falha no envio',
  retried: 'Reenviada',
};
export const QUICK_REPLIES = [
  'Já estou verificando o seu caso.',
  'Pode enviar fotos do local?',
  'Qual o endereço completo?',
  'Retorno ainda hoje, ok?',
];
export const TEMPLATES: [string, string][] = [
  ['Boas-vindas', 'Olá, {nome}! Aqui é {operador}, da Life Engenharia. Recebi seu contato e já estou cuidando do seu caso.'],
  ['Solicitar fotos', '{nome}, para avançarmos, pode enviar fotos do local e o endereço completo?'],
  ['Agendar visita', '{nome}, podemos agendar uma visita técnica? Quais dias e horários ficam melhores para você?'],
  ['Retomar contato', 'Olá, {nome}! Retomando o seu atendimento. Conseguimos conversar hoje?'],
];
export const RESOLUTION_HINTS = ['Proposta enviada', 'Visita técnica agendada', 'Cliente sem interesse', 'Dúvida esclarecida'];
export const MORE_LIMIT = 8;
export const VIEWS_KEY = 'life-operator-views';
export const TIP_KEY = 'life-operator-tip';

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtWait = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`);
export const minutesSince = (iso: string | undefined, nowMs: number) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : Math.max(0, Math.round((nowMs - t) / 60000));
};
export const priorityOf = (c: Conversation) => {
  const key = (c.suggestedPriority || '').toUpperCase();
  return PRIORITY[key] ? { key, ...PRIORITY[key] } : null;
};
export const areaKey = (c: Conversation): 'commercial' | 'technical' | 'other' => {
  const a = c.destinationArea || c.route || '';
  if (a === 'commercial') return 'commercial';
  if (a === 'technical' || a === 'on_call') return 'technical';
  return 'other';
};
export const areaLabel = (c: Conversation) => {
  const a = c.destinationArea || c.route || '';
  if (a === 'commercial') return 'Comercial';
  if (a === 'technical') return 'Técnico';
  if (a === 'on_call') return 'Plantão';
  return a || 'Atendimento';
};
export const columnOf = (c: Conversation): BoardColumn =>
  c.state === 'closed'
    ? 'closed'
    : c.followUpAt
      ? 'followup'
      : c.assignedOperator
        ? 'active'
        : c.route === 'commercial'
          ? 'lead'
          : 'waiting';
export const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export const prettyKey = (k: string) => {
  const s = k.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const atHour = (daysAhead: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
};
export const dayLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
};
export const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return p;
};
export const isImage = (a: Attachment) => a.mediaType.startsWith('image/');
export const isDue = (c: Conversation, nowMs: number) => {
  if (c.state === 'closed') return false;
  if (c.followUpAt) {
    const t = Date.parse(c.followUpAt);
    return !Number.isNaN(t) && t <= nowMs;
  }
  if (c.assignedOperator) return false;
  const p = priorityOf(c);
  return !!p && minutesSince(c.updatedAt, nowMs) > p.limit;
};
export const isUrgent = (c: Conversation) => {
  const k = priorityOf(c)?.key;
  return k === 'P1' || k === 'P2';
};
