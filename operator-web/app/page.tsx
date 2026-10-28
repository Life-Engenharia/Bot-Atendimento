// @ts-nocheck
'use client';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

type Conversation = {
  id: string;
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
type Note = { id: string; author: string; content: string; createdAt: string };
type HistoryItem = {
  id: string;
  protocolId: string | null;
  state: string;
  destinationArea: string | null;
  priority: string | null;
  updatedAt: string;
  resolutionNote: string | null;
};
type Operator = { id: string; name: string; role: string; area: string };
type Message = {
  id: string;
  content: string;
  direction: string;
  receivedAt: string;
  deliveryStatus?: string | null;
};
type Attachment = {
  id: string;
  fileName: string;
  mediaType: string;
  status: string;
  createdAt: string;
  analysisStatus?: string | null;
  extractedText?: string | null;
};
type ActionKind = 'followup' | 'ploomesManual' | 'serviceOrder' | null;
type BoardColumn = 'waiting' | 'lead' | 'active' | 'followup' | 'closed';
type NavKey = 'all' | 'commercial' | 'technical' | 'closed';
type SavedView = {
  name: string;
  tab: string;
  nav: NavKey;
  group: boolean;
  filters: { unassigned: boolean; urgent: boolean; due: boolean };
};

const COLUMNS: { id: BoardColumn; title: string; color: string; hint: string }[] = [
  { id: 'waiting', title: 'Aguardando', color: '#d9552b', hint: 'Atendimentos novos, sem responsável' },
  { id: 'lead', title: 'Lead', color: '#12a6c9', hint: 'Oportunidades comerciais' },
  { id: 'active', title: 'Em atendimento', color: '#1d5fd1', hint: 'Conversas em andamento' },
  { id: 'followup', title: 'Retorno / atenção', color: '#b98a0b', hint: 'Retorno agendado ou aguardando o cliente' },
  { id: 'closed', title: 'Concluídos', color: '#2f7a55', hint: 'Atendimentos encerrados' },
];
const boardColumnByTitle: Record<string, BoardColumn> = Object.fromEntries(
  COLUMNS.map((c) => [c.title, c.id]),
);
const PRIORITY: Record<string, { symbol: string; limit: number; text: string }> = {
  P1: { symbol: '▲', limit: 15, text: 'Risco imediato · responder em até 15 min' },
  P2: { symbol: '◆', limit: 30, text: 'Urgente · até 30 min' },
  P3: { symbol: '●', limit: 60, text: 'Normal · até 1 h' },
  P4: { symbol: '○', limit: 240, text: 'Baixa · até 4 h' },
};
const AREA_COLOR: Record<string, string> = { commercial: '#1d5fd1', technical: '#c4631d', other: '#6a7f8c' };
const DELIVERY: Record<string, string> = {
  queued: 'Na fila',
  sent: '✓ Enviada',
  delivered: '✓✓ Entregue',
  read: '✓✓ Lida',
  failed: 'Falha no envio',
  retried: 'Reenviada',
};
const QUICK_REPLIES = [
  'Já estou verificando o seu caso.',
  'Pode enviar fotos do local?',
  'Qual o endereço completo?',
  'Retorno ainda hoje, ok?',
];
const TEMPLATES: [string, string][] = [
  ['Boas-vindas', 'Olá, {nome}! Aqui é {operador}, da Life Engenharia. Recebi seu contato e já estou cuidando do seu caso.'],
  ['Solicitar fotos', '{nome}, para avançarmos, pode enviar fotos do local e o endereço completo?'],
  ['Agendar visita', '{nome}, podemos agendar uma visita técnica? Quais dias e horários ficam melhores para você?'],
  ['Retomar contato', 'Olá, {nome}! Retomando o seu atendimento. Conseguimos conversar hoje?'],
];
const RESOLUTION_HINTS = ['Proposta enviada', 'Visita técnica agendada', 'Cliente sem interesse', 'Dúvida esclarecida'];
const MORE_LIMIT = 8;
const VIEWS_KEY = 'life-operator-views';
const TIP_KEY = 'life-operator-tip';

const apiBase = '';
const auth = () => ({ Authorization: `Bearer ${sessionStorage.getItem('operatorToken') || ''}` });
async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(apiBase + path, {
      ...init,
      headers: { ...auth(), ...(init.headers || {}) },
    });
  } catch {
    throw new Error(
      'Não foi possível conectar ao servidor de atendimento. Verifique se o backend está ativo e tente novamente.',
    );
  }
  const raw = r.status === 204 ? '' : await r.text().catch(() => '');
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const errorMessage =
    body && typeof body === 'object' && 'error' in body ? String(body.error) : undefined;
  if (!r.ok) throw new Error(errorMessage || `A API retornou HTTP ${r.status}.`);
  return body as T;
}

/* ---------- helpers de domínio ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
const fmtWait = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`);
const minutesSince = (iso: string | undefined, nowMs: number) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : Math.max(0, Math.round((nowMs - t) / 60000));
};
const priorityOf = (c: Conversation) => {
  const key = (c.suggestedPriority || '').toUpperCase();
  return PRIORITY[key] ? { key, ...PRIORITY[key] } : null;
};
const areaKey = (c: Conversation): 'commercial' | 'technical' | 'other' => {
  const a = c.destinationArea || c.route || '';
  if (a === 'commercial') return 'commercial';
  if (a === 'technical' || a === 'on_call') return 'technical';
  return 'other';
};
const areaLabel = (c: Conversation) => {
  const a = c.destinationArea || c.route || '';
  if (a === 'commercial') return 'Comercial';
  if (a === 'technical') return 'Técnico';
  if (a === 'on_call') return 'Plantão';
  return a || 'Atendimento';
};
const columnOf = (c: Conversation): BoardColumn =>
  c.state === 'closed'
    ? 'closed'
    : c.followUpAt
      ? 'followup'
      : c.assignedOperator
        ? 'active'
        : c.route === 'commercial'
          ? 'lead'
          : 'waiting';
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
const prettyKey = (k: string) => {
  const s = k.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const toLocalInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const atHour = (daysAhead: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR');
};
const fmtPhone = (p: string) => {
  const d = p.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return p;
};
const isImage = (a: Attachment) => a.mediaType.startsWith('image/');

export default function OperatorPage() {
  const [logged, setLogged] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [notice, setNotice] = useState(''),
    [name, setName] = useState(''),
    [role, setRole] = useState('');
  const [items, setItems] = useState<Conversation[]>([]),
    [selected, setSelected] = useState<Conversation | null>(null),
    [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({}),
    [tab, setTab] = useState('action'),
    [nav, setNav] = useState<NavKey>('all'),
    [query, setQuery] = useState(''),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [closeDialogOpen, setCloseDialogOpen] = useState(false),
    [closeTargets, setCloseTargets] = useState<Conversation[]>([]),
    [resolution, setResolution] = useState(''),
    [closeError, setCloseError] = useState(''),
    [closing, setClosing] = useState(false),
    [actionKind, setActionKind] = useState<ActionKind>(null),
    [actionValue, setActionValue] = useState(''),
    [actionError, setActionError] = useState(''),
    [acting, setActing] = useState(false),
    [sending, setSending] = useState(false),
    [sendError, setSendError] = useState(''),
    [draggingId, setDraggingId] = useState(''),
    [dropTarget, setDropTarget] = useState<BoardColumn | null>(null),
    [movingId, setMovingId] = useState(''),
    [boardNotice, setBoardNotice] = useState(''),
    [operators, setOperators] = useState<Operator[]>([]),
    [transferOpen, setTransferOpen] = useState(false),
    [transferTo, setTransferTo] = useState(''),
    [transferReason, setTransferReason] = useState(''),
    [transferError, setTransferError] = useState(''),
    [transferring, setTransferring] = useState(false),
    [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply'),
    [noteText, setNoteText] = useState(''),
    [noteSending, setNoteSending] = useState(false),
    [noteError, setNoteError] = useState(''),
    [history, setHistory] = useState<HistoryItem[]>([]),
    [retryingId, setRetryingId] = useState(''),
    [undo, setUndo] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const [filters, setFilters] = useState({ unassigned: false, urgent: false, due: false }),
    [group, setGroup] = useState(false),
    [views, setViews] = useState<SavedView[]>([]),
    [savingView, setSavingView] = useState(false),
    [viewName, setViewName] = useState(''),
    [bulk, setBulk] = useState<Set<string>>(new Set()),
    [more, setMore] = useState<Record<string, boolean>>({}),
    [mobileColumn, setMobileColumn] = useState<BoardColumn>('waiting'),
    [mobileOpen, setMobileOpen] = useState(false),
    [isMobile, setIsMobile] = useState(false),
    [templatesOpen, setTemplatesOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [tipVisible, setTipVisible] = useState(false),
    [lightbox, setLightbox] = useState<{ url: string; name: string; text?: string | null } | null>(null),
    [sound, setSound] = useState(false),
    [dark, setDark] = useState<boolean | null>(null),
    [nowMs, setNowMs] = useState(() => Date.now());
  const [crmOpen, setCrmOpen] = useState(false),
    [crmContacts, setCrmContacts] = useState<any[]>([]),
    [crmDeals, setCrmDeals] = useState<any[]>([]),
    [crmSearch, setCrmSearch] = useState(''),
    [crmBusy, setCrmBusy] = useState(false),
    [crmError, setCrmError] = useState(''),
    [crmStatus, setCrmStatus] = useState(''),
    [crmFormOpen, setCrmFormOpen] = useState(false),
    [crmSaving, setCrmSaving] = useState(false),
    [crmForm, setCrmForm] = useState({ name: '', company: '', document: '', phone: '', email: '' });
  const selectedRef = useRef<Conversation | null>(null);
  selectedRef.current = selected;
  const audioRef = useRef<AudioContext | null>(null);
  const lastFireRef = useRef(0);
  const focusIdRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offerUndo = (label: string, run: () => Promise<void>) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ label, run });
    undoTimerRef.current = setTimeout(() => setUndo(null), 10_000);
  };
  const dismissNotice = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo(null);
    setBoardNotice('');
  };
  const runUndo = async () => {
    const current = undo;
    if (!current) return;
    dismissNotice();
    try {
      await current.run();
      await load();
      setBoardNotice('Ação desfeita.');
    } catch (error) {
      setBoardNotice(
        error instanceof Error ? 'Não foi possível desfazer: ' + error.message : 'Não foi possível desfazer.',
      );
    }
  };
  const selectedId = selected?.id;
  useEffect(() => {
    setComposerMode('reply');
    setNoteText('');
    setNoteError('');
    setHistory([]);
    if (!selectedId) return;
    let alive = true;
    api<HistoryItem[]>('/api/operator/conversations/' + selectedId + '/history')
      .then((rows) => alive && setHistory(Array.isArray(rows) ? rows : []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const load = async () => {
    const rows = await api<Conversation[]>('/api/operator/conversations?includeClosed=true');
    setItems(rows);
    const current = selectedRef.current;
    if (current) {
      const row = rows.find((x: Conversation) => x.id === current.id);
      if (row) {
        const detail = await api<Conversation>('/api/operator/conversations/' + row.id);
        if (selectedRef.current?.id === detail.id) setSelected(detail);
      }
    }
  };
  const refresh = () => {
    void load().catch((error) => {
      setBoardNotice(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a fila. Tente novamente.',
      );
    });
  };

  /* ---------- sessão ---------- */
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hashToken = hash.get('operatorToken');
    if (hashToken) {
      sessionStorage.setItem('operatorToken', hashToken);
      sessionStorage.setItem('operatorName', hash.get('operatorName') || 'Operador');
      sessionStorage.setItem('operatorRole', hash.get('operatorRole') || 'admin');
      window.history.replaceState(null, '', '/');
    }
    const loginError = new URLSearchParams(window.location.search).get('loginError');
    if (loginError) setNotice(loginError);
    const n = sessionStorage.getItem('operatorName'),
      t = sessionStorage.getItem('operatorToken'),
      r = sessionStorage.getItem('operatorRole');
    if (n && t) {
      setName(n);
      setRole(r || '');
      load()
        .then(() => setLogged(true))
        .catch(() => {
          sessionStorage.clear();
          setNotice('Sua sessão expirou. Entre novamente.');
        });
    }
    try {
      setViews(JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]'));
      setTipVisible(!localStorage.getItem(TIP_KEY));
    } catch {
      setTipVisible(true);
    }
    const mq = window.matchMedia('(max-width: 900px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* atualização automática e relógio dos prazos */
  useEffect(() => {
    if (!logged) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
      if (!document.hidden) refresh();
    }, 30000);
    return () => window.clearInterval(id);
  }, [logged]);

  /* anexos de imagem do atendimento aberto */
  useEffect(() => {
    let cancelled = false;
    const images = (selected?.attachments || []).filter(
      (attachment) => attachment.status === 'stored' && isImage(attachment),
    );
    if (!images.length) {
      setAttachmentUrls({});
      return;
    }
    Promise.all(
      images.map(async (attachment) => {
        try {
          const result = await api<{ url: string }>(
            '/api/operator/conversations/' + selected!.id + '/attachments/' + attachment.id + '/url',
          );
          return [attachment.id, result.url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!cancelled)
        setAttachmentUrls(Object.fromEntries(entries.filter(Boolean) as Array<[string, string]>));
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.attachments]);

  /* rola a conversa até a última mensagem ao abrir ou receber */
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected?.id, selected?.messages?.length]);

  const login = async (e: FormEvent) => {
    e.preventDefault();
    setNotice('Entrando…');
    try {
      const r = await fetch(apiBase + '/api/operator/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!r.ok) {
        const error = await r.json().catch(() => ({ error: 'E-mail ou senha inválidos.' }));
        throw new Error(error.error || 'E-mail ou senha inválidos.');
      }
      const raw = await r.text();
      let s: { token?: string; user?: { name?: string; role?: string } };
      try {
        s = JSON.parse(raw);
      } catch {
        throw new Error('O servidor retornou uma resposta vazia ou inválida. Reinicie o backend.');
      }
      if (!s.token || !s.user?.name || !s.user.role)
        throw new Error('Sessão inválida retornada pelo servidor.');
      sessionStorage.setItem('operatorToken', s.token);
      sessionStorage.setItem('operatorName', s.user.name);
      sessionStorage.setItem('operatorRole', s.user.role);
      setName(s.user.name);
      setRole(s.user.role);
      await load();
      setLogged(true);
      setNotice('');
    } catch (x) {
      sessionStorage.clear();
      setLogged(false);
      setNotice(
        x instanceof Error
          ? x.message
          : 'Não foi possível carregar a fila. Verifique se o backend está online.',
      );
    }
  };
  const submitLogin = () => {
    void login({ preventDefault: () => undefined } as FormEvent);
  };

  /* ---------- prazos e urgência ---------- */
  const isDue = (c: Conversation) => {
    if (c.state === 'closed') return false;
    if (c.followUpAt) {
      const t = Date.parse(c.followUpAt);
      return !Number.isNaN(t) && t <= nowMs;
    }
    if (c.assignedOperator) return false;
    const p = priorityOf(c);
    return !!p && minutesSince(c.updatedAt, nowMs) > p.limit;
  };
  const isUrgent = (c: Conversation) => {
    const k = priorityOf(c)?.key;
    return k === 'P1' || k === 'P2';
  };
  const fire = useMemo(
    () =>
      items
        .filter((c) => isUrgent(c) && isDue(c))
        .sort(
          (a, b) =>
            Number(priorityOf(a)?.key.slice(1)) - Number(priorityOf(b)?.key.slice(1)) ||
            minutesSince(b.updatedAt, nowMs) - minutesSince(a.updatedAt, nowMs),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, nowMs],
  );
  const beep = () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioRef.current = audioRef.current || new Ctx();
      const o = audioRef.current.createOscillator();
      const g = audioRef.current.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(audioRef.current.destination);
      o.start();
      o.stop(audioRef.current.currentTime + 0.18);
    } catch {
      /* áudio indisponível */
    }
  };
  useEffect(() => {
    document.title = (fire.length ? `(${fire.length}) ` : '') + 'Life Engenharia · Central de atendimento';
    if (fire.length > lastFireRef.current && sound) beep();
    lastFireRef.current = fire.length;
  }, [fire.length, sound]);

  /* ---------- filtros e colunas ---------- */
  const matchesNav = (c: Conversation) =>
    nav === 'all' ||
    (nav === 'closed' && c.state === 'closed') ||
    (nav === 'commercial' && areaKey(c) === 'commercial') ||
    (nav === 'technical' && areaKey(c) === 'technical');
  const matchesSearch = (c: Conversation) => {
    if (!query) return true;
    const hay = (c.contactName || '') + ' ' + c.contactPhone;
    return hay.toLowerCase().includes(query.toLowerCase());
  };
  const matchesTab = (c: Conversation, t: string) => {
    const action = c.state !== 'closed' && (!c.assignedOperator || c.followUpAt);
    return t === 'all' || (t === 'mine' ? c.assignedOperator === name : action);
  };
  const baseItems = useMemo(
    () => items.filter((c) => matchesSearch(c) && matchesNav(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, query, nav],
  );
  const visible = useMemo(
    () =>
      baseItems.filter((c) => {
        if (!matchesTab(c, tab)) return false;
        if (filters.unassigned && c.assignedOperator) return false;
        if (filters.urgent && !isUrgent(c)) return false;
        if (filters.due && !isDue(c)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseItems, tab, name, filters, nowMs],
  );
  const groups = [
    [
      'Aguardando',
      visible.filter(
        (c) =>
          c.state !== 'closed' && !c.assignedOperator && !c.followUpAt && c.route !== 'commercial',
      ),
    ],
    [
      'Lead',
      visible.filter(
        (c) =>
          (c.state !== 'closed' || c.route === 'commercial') &&
          c.route === 'commercial' &&
          !c.assignedOperator,
      ),
    ],
    [
      'Em atendimento',
      visible.filter((c) => c.state !== 'closed' && !!c.assignedOperator && !c.followUpAt),
    ],
    ['Retorno / atenção', visible.filter((c) => c.state !== 'closed' && !!c.followUpAt)],
    ['Concluídos', visible.filter((c) => c.state === 'closed' && c.route !== 'commercial')],
  ] as [string, Conversation[]][];
  const shownGroups = nav === 'closed' ? groups.filter(([t]) => t === 'Concluídos') : groups;
  const sortRows = (rows: Conversation[]) =>
    [...rows].sort(
      (a, b) =>
        Number(isDue(b)) - Number(isDue(a)) ||
        Number(priorityOf(a)?.key.slice(1) || 9) - Number(priorityOf(b)?.key.slice(1) || 9) ||
        Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
    );
  const tabCount = (t: string) => baseItems.filter((c) => matchesTab(c, t)).length;
  const open_ = items.filter((c) => c.state !== 'closed');
  const navCounts: Record<NavKey, number> = {
    all: open_.length,
    commercial: open_.filter((c) => areaKey(c) === 'commercial').length,
    technical: open_.filter((c) => areaKey(c) === 'technical').length,
    closed: items.filter((c) => c.state === 'closed').length,
  };
  const chipBase = baseItems.filter((c) => c.state !== 'closed');
  const chipCounts = {
    unassigned: chipBase.filter((c) => !c.assignedOperator).length,
    urgent: chipBase.filter(isUrgent).length,
    due: chipBase.filter(isDue).length,
  };

  /* ---------- ações ---------- */
  const open = async (id: string) => {
    try {
      setSelected(await api<Conversation>('/api/operator/conversations/' + id));
      setBoardNotice('');
    } catch (error) {
      setBoardNotice(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar este atendimento. Tente atualizar a fila.',
      );
    }
  };
  const openCard = (id: string) => {
    focusIdRef.current = id;
    setTemplatesOpen(false);
    if (isMobile) setMobileOpen(true);
    void open(id);
  };
  const openClose = (targets: Conversation[]) => {
    setCloseTargets(targets);
    setResolution('');
    setCloseError('');
    setCloseDialogOpen(true);
  };
  const moveToColumn = async (conversation: Conversation, target: BoardColumn) => {
    if (movingId) return;
    const isClosed = conversation.state === 'closed';
    const current = columnOf(conversation);
    if (target === current) return;
    setBoardNotice('');

    if (isClosed) {
      setBoardNotice(
        'Atendimentos concluídos são somente leitura. Reabra o atendimento antes de movê-lo.',
      );
      return;
    }
    if (
      (target === 'waiting' || target === 'lead') &&
      (current === 'active' || current === 'followup') &&
      conversation.assignedOperator
    ) {
      if (conversation.assignedOperator !== name) {
        setBoardNotice('Só é possível devolver à fila um atendimento que está atribuído a você.');
        return;
      }
      if (target === 'lead' && conversation.route !== 'commercial') {
        setBoardNotice('A etapa Lead é reservada para atendimentos classificados como comerciais.');
        return;
      }
      if (target === 'waiting' && conversation.route === 'commercial') {
        setBoardNotice(
          'Este atendimento é comercial; ele permanece na etapa Lead quando devolvido.',
        );
        return;
      }
      setMovingId(conversation.id);
      try {
        await api('/api/operator/conversations/' + conversation.id + '/release', {
          method: 'POST',
        });
        await load();
        setBoardNotice('Atendimento devolvido à fila.');
      } catch (error) {
        setBoardNotice(
          error instanceof Error ? error.message : 'Não foi possível devolver à fila.',
        );
      } finally {
        setMovingId('');
      }
      return;
    }
    if (target === 'active') {
      if (conversation.assignedOperator && conversation.assignedOperator !== name) {
        setBoardNotice('Este atendimento já está em atendimento por outra pessoa.');
        return;
      }
      setMovingId(conversation.id);
      try {
        if (!conversation.assignedOperator)
          await api('/api/operator/conversations/' + conversation.id + '/claim', {
            method: 'POST',
          });
        if (conversation.followUpAt)
          await api('/api/operator/conversations/' + conversation.id + '/follow-up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followUpAt: null }),
          });
        await load();
        setBoardNotice('Atendimento assumido por você.');
      } catch (error) {
        setBoardNotice(
          error instanceof Error ? error.message : 'Não foi possível assumir o atendimento.',
        );
      } finally {
        setMovingId('');
      }
      return;
    }
    if (target === 'followup') {
      try {
        await open(conversation.id);
        setActionValue('');
        setActionError('');
        setActionKind('followup');
        setBoardNotice('Escolha a data e o horário para agendar o retorno.');
      } catch (error) {
        setBoardNotice(
          error instanceof Error ? error.message : 'Não foi possível abrir o atendimento.',
        );
      }
      return;
    }
    if (target === 'closed') {
      try {
        await open(conversation.id);
        openClose([conversation]);
        setBoardNotice('Registre a resolução para concluir o atendimento.');
      } catch (error) {
        setBoardNotice(
          error instanceof Error ? error.message : 'Não foi possível abrir o atendimento.',
        );
      }
      return;
    }
    if (target === 'waiting' || target === 'lead') {
      if (target === 'lead' && conversation.route !== 'commercial') {
        setBoardNotice('A etapa Lead é reservada para atendimentos classificados como comerciais.');
        return;
      }
      if (target === 'waiting' && conversation.route === 'commercial') {
        setBoardNotice(
          'A etapa Aguardando não altera a classificação comercial deste atendimento.',
        );
        return;
      }
      if (current === 'followup') {
        setMovingId(conversation.id);
        try {
          await api('/api/operator/conversations/' + conversation.id + '/follow-up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followUpAt: null }),
          });
          await load();
          setBoardNotice('Retorno cancelado; atendimento voltou para a fila.');
        } catch (error) {
          setBoardNotice(
            error instanceof Error ? error.message : 'Não foi possível cancelar o retorno.',
          );
        } finally {
          setMovingId('');
        }
        return;
      }
    }
    setBoardNotice('Essa mudança não está disponível para este atendimento.');
  };
  const claim = async (target?: Conversation) => {
    const conversation = target || selected;
    if (!conversation) return;
    if (
      (conversation.destinationArea === 'commercial' || conversation.route === 'commercial') &&
      !conversation.assignedOperator
    ) {
      setBoardNotice('Leads comerciais são tratados diretamente pelo comercial.');
      return;
    }
    try {
      await api('/api/operator/conversations/' + conversation.id + '/claim', { method: 'POST' });
      await load();
      await open(conversation.id);
      setBoardNotice('Atendimento assumido por você.');
      offerUndo('Desfazer', async () => {
        await api('/api/operator/conversations/' + conversation.id + '/release', { method: 'POST' });
        if (selectedRef.current?.id === conversation.id) await open(conversation.id);
      });
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível assumir o atendimento.');
    }
  };
  const release = async (target?: Conversation) => {
    const conversation = target || selected;
    if (!conversation) return;
    try {
      await api('/api/operator/conversations/' + conversation.id + '/release', { method: 'POST' });
      await load();
      await open(conversation.id);
      setBoardNotice('Atendimento devolvido à fila.');
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível devolver à fila.');
    }
  };
  const canActOn = (c: Conversation) =>
    (!!c.assignedOperator && c.assignedOperator === name) ||
    ['admin', 'coordination'].includes(role);
  const openCloseDialog = (target?: Conversation) => {
    const conversation = target || selected;
    if (!conversation || (!conversation.assignedOperator && !['admin', 'coordination'].includes(role))) {
      setBoardNotice('Assuma o atendimento antes de encerrá-lo.');
      return;
    }
    openClose([conversation]);
  };
  const canActOnSelected = !!selected && canActOn(selected!);
  const isCommercialLead =
    !!selected &&
    (selected!.destinationArea === 'commercial' || selected!.route === 'commercial') &&
    !selected!.assignedOperator;
  const close = async () => {
    if (!closeTargets.length) return;
    if (resolution.trim().length < 3) {
      setCloseError('Descreva a resolução em pelo menos 3 caracteres.');
      return;
    }
    setClosing(true);
    setCloseError('');
    let done = 0;
    let lastError = '';
    for (const target of closeTargets) {
      try {
        await api('/api/operator/conversations/' + target.id + '/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resolutionNote: resolution.trim() }),
        });
        done += 1;
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Não foi possível finalizar o atendimento.';
      }
    }
    if (!done) {
      setCloseError(lastError || 'Não foi possível finalizar o atendimento.');
      setClosing(false);
      return;
    }
    setCloseDialogOpen(false);
    setResolution('');
    setBulk(new Set());
    if (selectedRef.current && closeTargets.some((t) => t.id === selectedRef.current?.id)) {
      // Evita que `load` reabra automaticamente o atendimento recém-finalizado.
      selectedRef.current = null;
      setSelected(null);
      setMobileOpen(false);
    }
    setTab('all');
    try {
      await load();
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível atualizar a fila.');
    }
    setBoardNotice(
      done === closeTargets.length
        ? done > 1
          ? `${done} atendimentos concluídos.`
          : 'Atendimento concluído.'
        : `${done} de ${closeTargets.length} concluídos. ${lastError}`,
    );
    setClosing(false);
  };
  const reopen = async () => {
    if (!selected) return;
    try {
      await api('/api/operator/conversations/' + selected.id + '/reopen', { method: 'POST' });
      await load();
      await open(selected.id);
      setBoardNotice('Atendimento reaberto.');
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível reabrir o atendimento.');
    }
  };
  const text = selected ? drafts[selected!.id] || '' : '';
  const setText = (value: string) => {
    if (selected) setDrafts((d) => ({ ...d, [selected!.id]: value }));
  };
  const send = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!selected || !text.trim() || sending) return;
    const message = text.trim();
    const id = selected.id;
    setSending(true);
    setSendError('');
    try {
      await api('/api/operator/conversations/' + id + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      setDrafts((d) => ({ ...d, [id]: '' }));
      await open(id);
      void load().catch(() => undefined);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };
  const runAction = async () => {
    if (!selected || !actionKind) return;
    const value = actionValue.trim();
    if (!value) return setActionError('Preencha este campo para concluir a ação.');
    setActing(true);
    setActionError('');
    try {
      let previousFollowUp: string | null = null;
      if (actionKind === 'followup') {
        previousFollowUp = selected.followUpAt || null;
        const date = new Date(value);
        if (Number.isNaN(date.valueOf())) throw new Error('Informe uma data e horário válidos.');
        await api('/api/operator/conversations/' + selected.id + '/follow-up', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followUpAt: date.toISOString() }),
        });
      } else if (actionKind === 'ploomesManual') {
        await api('/api/operator/conversations/' + selected.id + '/commercial/manual-ploomes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ploomesId: value }),
        });
      } else {
        await api(
          '/api/operator/conversations/' + selected.id + '/technical/manual-service-order',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceOrderNumber: value }),
          },
        );
      }
      setActionKind(null);
      setActionValue('');
      await load();
      await open(selected.id);
      setBoardNotice(actionKind === 'followup' ? 'Retorno agendado.' : 'Registro salvo.');
      if (actionKind === 'followup') {
        const conversationId = selected.id;
        offerUndo('Desfazer', async () => {
          await api('/api/operator/conversations/' + conversationId + '/follow-up', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followUpAt: previousFollowUp }),
          });
          if (selectedRef.current?.id === conversationId) await open(conversationId);
        });
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    } finally {
      setActing(false);
    }
  };
  const syncPloomes = async () => {
    if (!selected) return;
    try {
      await api('/api/operator/conversations/' + selected.id + '/commercial/sync-ploomes', {
        method: 'POST',
      });
      refresh();
      setBoardNotice('Oportunidade enviada ao Ploomes.');
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível cadastrar a oportunidade.');
    }
  };
  const openTransfer = () => {
    setTransferTo('');
    setTransferReason('');
    setTransferError('');
    setTransferOpen(true);
    api<Operator[]>('/api/operator/operators')
      .then((rows) => setOperators(Array.isArray(rows) ? rows : []))
      .catch(() => setTransferError('Não foi possível carregar a lista de pessoas.'));
  };
  const transferCandidates = operators.filter((o) => {
    if (!selected || o.name === name) return false;
    if (['admin', 'coordination'].includes(o.role)) return true;
    const areas = o.role === 'on_call' ? ['on_call', 'technical'] : [o.area];
    return !!selected.destinationArea && areas.includes(selected.destinationArea);
  });
  const doTransfer = async () => {
    if (!selected) return;
    if (!transferTo) return setTransferError('Escolha quem vai receber o atendimento.');
    if (transferReason.trim().length < 3) return setTransferError('Informe o motivo da transferência (mínimo 3 caracteres).');
    setTransferring(true);
    setTransferError('');
    try {
      await api('/api/operator/conversations/' + selected.id + '/transfer-operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: transferTo, reason: transferReason.trim() }),
      });
      setTransferOpen(false);
      await load();
      await open(selected.id);
      setBoardNotice('Atendimento transferido para ' + transferTo + '.');
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : 'Não foi possível transferir.');
    } finally {
      setTransferring(false);
    }
  };
  const saveNote = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!selected || !noteText.trim() || noteSending) return;
    setNoteSending(true);
    setNoteError('');
    try {
      await api('/api/operator/conversations/' + selected.id + '/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText.trim() }),
      });
      setNoteText('');
      await open(selected.id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : 'Não foi possível salvar a nota.');
    } finally {
      setNoteSending(false);
    }
  };
  const retryMessage = async (message: Message) => {
    if (!selected || retryingId) return;
    setRetryingId(message.id);
    setSendError('');
    try {
      await api('/api/operator/conversations/' + selected.id + '/messages/' + message.id + '/retry', {
        method: 'POST',
      });
      await open(selected.id);
      void load().catch(() => undefined);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Não foi possível reenviar a mensagem.');
    } finally {
      setRetryingId('');
    }
  };
  const openAttachment = async (attachment: Attachment) => {
    if (!selected || attachment.status !== 'stored') return;
    try {
      const result = await api<{ url: string }>(
        '/api/operator/conversations/' + selected.id + '/attachments/' + attachment.id + '/url',
      );
      setAttachmentUrls((current) => ({ ...current, [attachment.id]: result.url }));
      if (isImage(attachment))
        setLightbox({ url: result.url, name: attachment.fileName, text: attachment.extractedText });
      else window.open(result.url, '_blank', 'noopener');
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível abrir o anexo.');
    }
  };

  /* ---------- seleção em lote ---------- */
  const bulkItems = items.filter((c) => bulk.has(c.id));
  const bulkClaim = async () => {
    const claimable = bulkItems.filter(
      (c) => !c.assignedOperator && c.state !== 'closed' && c.route !== 'commercial',
    );
    if (!claimable.length) {
      setBoardNotice('Nenhum selecionado pode ser assumido. Leads comerciais não são assumidos aqui.');
      return;
    }
    let ok = 0;
    for (const c of claimable) {
      try {
        await api('/api/operator/conversations/' + c.id + '/claim', { method: 'POST' });
        ok += 1;
      } catch {
        /* segue para o próximo */
      }
    }
    setBulk(new Set());
    await load().catch(() => undefined);
    setBoardNotice(`${ok} de ${claimable.length} atendimentos assumidos.`);
  };
  const bulkClose = () => {
    const closable = bulkItems.filter((c) => c.state !== 'closed' && !!c.assignedOperator && canActOn(c));
    if (!closable.length) {
      setBoardNotice('Nenhum selecionado pode ser concluído por você. Assuma os atendimentos antes.');
      return;
    }
    openClose(closable);
  };
  const toggleBulk = (id: string, on: boolean) =>
    setBulk((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  /* ---------- vistas salvas ---------- */
  const persistViews = (next: SavedView[]) => {
    setViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      /* armazenamento indisponível */
    }
  };
  const saveView = () => {
    const n = viewName.trim();
    if (!n) return;
    persistViews([...views, { name: n, tab, nav, group, filters: { ...filters } }]);
    setSavingView(false);
    setViewName('');
    setBoardNotice('Vista salva neste navegador.');
  };
  const applyView = (v: SavedView) => {
    setTab(v.tab);
    setNav(v.nav);
    setGroup(v.group);
    setFilters({ ...v.filters });
  };

  /* ---------- teclado ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (closeDialogOpen || actionKind || helpOpen || lightbox) {
        if (e.key === 'Escape' && !closing && !acting) {
          setCloseDialogOpen(false);
          setActionKind(null);
          setHelpOpen(false);
          setLightbox(null);
        }
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDialogOpen, actionKind, helpOpen, lightbox, mobileOpen, closing, acting]);

  const onCardKey = (e: ReactKeyboardEvent<HTMLDivElement>, c: Conversation) => {
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const key = e.key.toLowerCase();
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openCard(c.id);
      return;
    }
    const column = el.closest('.column');
    const cards = column ? Array.from(column.querySelectorAll<HTMLElement>('.case-card')) : [];
    const idx = cards.indexOf(el);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (cards[idx + 1] || el).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (cards[idx - 1] || el).focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const cols = Array.from(document.querySelectorAll<HTMLElement>('.column'));
      const ci = column ? cols.indexOf(column as HTMLElement) : -1;
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      for (let j = ci + dir; j >= 0 && j < cols.length; j += dir) {
        const cs = cols[j].querySelectorAll<HTMLElement>('.case-card');
        if (cs.length) {
          cs[Math.min(idx, cs.length - 1)].focus();
          break;
        }
      }
    } else if (key === 'a' && !c.assignedOperator && c.state !== 'closed') {
      focusIdRef.current = c.id;
      void claim(c);
    } else if (key === 'c' && c.state !== 'closed' && canActOn(c)) {
      openCloseDialog(c);
    } else if (key === 'l' && c.state !== 'closed' && c.assignedOperator === name) {
      focusIdRef.current = c.id;
      void release(c);
    }
  };
  useEffect(() => {
    const id = focusIdRef.current;
    if (!id) return;
    const el = document.querySelector<HTMLElement>(`.case-card[data-id="${CSS.escape(id)}"]`);
    focusIdRef.current = null;
    if (el && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) el.focus();
  });

  /* ---------- derivados da conversa aberta ---------- */
  const lastInbound = useMemo(() => {
    const msgs = selected?.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].direction === 'inbound') return msgs[i];
    return null;
  }, [selected?.messages]);
  const windowLeft = lastInbound
    ? Math.round((Date.parse(lastInbound.receivedAt) + 24 * 3600 * 1000 - nowMs) / 60000)
    : null;
  const windowState: 'ok' | 'warn' | 'dead' | null =
    windowLeft === null ? null : windowLeft <= 0 ? 'dead' : windowLeft < 180 ? 'warn' : 'ok';
  const lastMessage = selected?.messages?.length ? selected.messages[selected.messages.length - 1] : null;
  const customerWaiting = !!lastMessage && lastMessage.direction === 'inbound' && selected?.state !== 'closed';
  const fillTemplate = (t: string) =>
    t
      .replace('{nome}', (selected?.contactName || '').split(' ')[0] || 'tudo bem')
      .replace('{operador}', name.split(' ')[0] || 'a equipe');
  const themeClass = dark === null ? '' : dark ? 'theme-dark' : 'theme-light';

  const renderCard = (c: Conversation) => {
    const p = priorityOf(c);
    const due = isDue(c);
    const wait = minutesSince(c.updatedAt, nowMs);
    const k = areaKey(c);
    const closed = c.state === 'closed';
    return (
      <div
        className={
          'case-card ' +
          (selected?.id === c.id ? 'selected ' : '') +
          (bulk.has(c.id) ? 'picked ' : '') +
          (draggingId === c.id ? 'dragging' : '')
        }
        key={c.id}
        data-id={c.id}
        tabIndex={0}
        role="group"
        draggable={!movingId}
        aria-label={`${c.contactName || c.contactPhone}${p ? ', prioridade ' + p.key : ''}, ${areaLabel(c)}${due ? ', prazo vencido' : ''}. Arraste para outra etapa.`}
        onClick={(e) => {
          if ((e.target as HTMLElement).classList.contains('pick')) return;
          openCard(c.id);
        }}
        onKeyDown={(e) => onCardKey(e, c)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', c.id);
          setDraggingId(c.id);
        }}
        onDragEnd={() => {
          setDraggingId('');
          setDropTarget(null);
        }}
      >
        <div className="case-top">
          <span className="case-id">
            <input
              className="pick"
              type="checkbox"
              checked={bulk.has(c.id)}
              onChange={(e) => toggleBulk(c.id, e.target.checked)}
              aria-label={`Selecionar ${c.contactName || c.contactPhone}`}
            />
          </span>
          <span className="badges">
            {due && <span className="badge due">Prazo</span>}
            {p && (
              <span className={'badge ' + p.key.toLowerCase()} title={p.text}>
                {p.symbol} {p.key}
              </span>
            )}
            {movingId === c.id && <span className="badge moving">Movendo…</span>}
          </span>
        </div>
        <strong>{c.contactName || c.contactPhone}</strong>
        {c.contactName && <span className="mono case-phone">{fmtPhone(c.contactPhone)}</span>}
        <div className="case-foot">
          <span className="area" style={{ ['--a' as string]: AREA_COLOR[k] }}>
            {areaLabel(c)}
          </span>
          {!closed && (
            <span className={'mono wait' + (due ? ' due' : '')}>
              {c.followUpAt
                ? due
                  ? 'Retorno vencido'
                  : 'Retorno ' + new Date(c.followUpAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : fmtWait(wait)}
            </span>
          )}
          {c.assignedOperator ? (
            <span className={'avatar' + (c.assignedOperator === name ? ' me' : '')} title={c.assignedOperator}>
              {initials(c.assignedOperator)}
            </span>
          ) : (
            <span className="avatar none" title="Sem responsável">
              ?
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderColumnBody = (id: BoardColumn, rows: Conversation[], hint: string) => {
    const sorted = sortRows(rows);
    const showAll = !!more[id];
    const list = showAll ? sorted : sorted.slice(0, MORE_LIMIT);
    const hidden = sorted.length - list.length;
    if (!sorted.length)
      return (
        <div className="empty">
          {query || filters.unassigned || filters.urgent || filters.due
            ? 'Nenhum atendimento com esses filtros.'
            : hint}
        </div>
      );
    const urgent = list.filter(isUrgent);
    const rest = list.filter((c) => !isUrgent(c));
    return (
      <>
        {group ? (
          <>
            {urgent.length > 0 && <div className="grp">Urgentes · P1 e P2 ({urgent.length})</div>}
            {urgent.map(renderCard)}
            {rest.length > 0 && <div className="grp">Demais ({rest.length})</div>}
            {rest.map(renderCard)}
          </>
        ) : (
          list.map(renderCard)
        )}
        {hidden > 0 && (
          <button type="button" className="more" onClick={() => setMore((m) => ({ ...m, [id]: true }))}>
            Mostrar mais {hidden}
          </button>
        )}
        {showAll && sorted.length > MORE_LIMIT && (
          <button type="button" className="more" onClick={() => setMore((m) => ({ ...m, [id]: false }))}>
            Mostrar menos
          </button>
        )}
      </>
    );
  };

  const selectedColumn = selected ? columnOf(selected) : null;
  const selectedPriority = selected ? priorityOf(selected) : null;
  const selectedDue = !!selected && isDue(selected);
  const contextEntries = Object.entries(selected?.context || {}).filter(([, v]) => v && String(v).trim());
  const workspaceOpen = mobileOpen && !!selected;
  const gridCols = isMobile
    ? undefined
    : shownGroups
        .map(([, rows]) => (rows.length ? 'minmax(230px, 1fr)' : 'minmax(150px, 0.45fr)'))
        .join(' ');
  const loadCrm = async (search = '') => {
    setCrmBusy(true);
    setCrmError('');
    setCrmStatus('');
    try {
      const query = search.trim();
      const response = await api<{ contacts: any[]; source: string }>(
        '/api/operator/crm/contacts' + (query ? '?q=' + encodeURIComponent(query) : ''),
      );
      setCrmContacts(response.contacts || []);
      const overview = await api<{ connected: boolean; overview?: { deals: any[] } }>('/api/operator/crm/overview');
      setCrmDeals(overview.overview?.deals || []);
      if (!overview.connected) setCrmStatus('Configure PLOOMES_USER_KEY no backend para conectar o Ploomes.');
    } catch (error) {
      setCrmError(error instanceof Error ? error.message : 'Não foi possível consultar o Ploomes.');
      setCrmContacts([]);
      setCrmDeals([]);
    } finally {
      setCrmBusy(false);
    }
  };
  useEffect(() => {
    if (crmOpen) void loadCrm(crmSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crmOpen]);
  const saveCrmCustomer = async (event: FormEvent) => {
    event.preventDefault();
    setCrmSaving(true);
    setCrmError('');
    setCrmStatus('');
    try {
      const response = await api<{ contact: any }>('/api/operator/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(crmForm),
      });
      setCrmForm({ name: '', company: '', document: '', phone: '', email: '' });
      setCrmFormOpen(false);
      setCrmStatus('Cliente cadastrado no Ploomes. ID: ' + (response.contact?.Id ?? 'confirmado'));
      await loadCrm(crmSearch);
    } catch (error) {
      setCrmError(error instanceof Error ? error.message : 'Não foi possível cadastrar o cliente.');
    } finally {
      setCrmSaving(false);
    }
  };

  if (!logged)
    return (
      <main className="login">
        <form className="login-card" action="/api/operator/login" method="post" onSubmit={login}>
          <img className="logo" src="/life-logo.png" alt="Life Engenharia" />
          <p className="eyebrow">Central de atendimento</p>
          <h1>Bem-vindo de volta</h1>
          <p>Entre para acompanhar, assumir e responder aos atendimentos.</p>
          <label className="field">
            E-mail corporativo
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            Senha
            <input
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="btn" style={{ width: '100%' }} onClick={submitLogin}>
            Entrar
          </button>
          <p className="notice">{notice}</p>
        </form>
      </main>
    );

  return (
    <main className={'app ' + themeClass + (crmOpen ? ' crm-open' : '')}>
      <aside className="rail">
        <div className="brand">
          <img src="/life-logo.png" alt="Life Engenharia" />
          <div>
            <strong>Life Engenharia</strong>
            <small>Central de atendimento</small>
          </div>
        </div>
        <nav className="nav" aria-label="Filtrar por área">
          <h4>Áreas</h4>
          {(
            [
              ['all', 'Fila geral'],
              ['commercial', 'Comercial'],
              ['technical', 'Técnico'],
              ['closed', 'Concluídos'],
            ] as [NavKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={nav === key ? 'active' : ''}
              aria-pressed={nav === key}
              onClick={() => { setCrmOpen(false); setNav(key); }}
            >
              <span>{label}</span>
              <small>{navCounts[key]}</small>
            </button>
          ))}
        </nav>
        <button type="button" className={'crm-nav' + (crmOpen ? ' active' : '')} onClick={() => setCrmOpen(!crmOpen)}>
          Clientes · Ploomes
        </button>
        <div className="rail-tools">
          <button
            type="button"
            aria-pressed={sound}
            onClick={() => {
              setSound(!sound);
              if (!sound) beep();
            }}
          >
            <span>Alerta sonoro</span>
            <span>{sound ? 'Ligado' : 'Desligado'}</span>
          </button>
          <button type="button" onClick={() => setHelpOpen(true)}>
            <span>Legenda e atalhos</span>
            <span>?</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setDark(
                dark === null
                  ? !window.matchMedia('(prefers-color-scheme: dark)').matches
                  : !dark,
              )
            }
          >
            <span>Tema</span>
            <span>{dark === null ? 'Auto' : dark ? 'Escuro' : 'Claro'}</span>
          </button>
        </div>
        <div className="account">
          <span className="avatar big">{initials(name)}</span>
          <div>
            <b>{name}</b>
            <span>Disponível para atender</span>
          </div>
          <button
            type="button"
            onClick={() => {
              sessionStorage.clear();
              location.reload();
            }}
          >
            Sair
          </button>
        </div>
      </aside>

      {crmOpen ? (
        <section className="crm-page" aria-label="Clientes no Ploomes">
          <header className="crm-head">
            <div><p className="eyebrow">Ploomes</p><h1>Clientes e oportunidades</h1><p>Consulta e cadastro pelo CRM da Life.</p></div>
            <div className="crm-head-actions"><button type="button" className="btn alt" onClick={() => { setCrmOpen(false); setNav('all'); }}>Voltar à fila</button><button type="button" className="btn alt" onClick={() => void loadCrm(crmSearch)} disabled={crmBusy}>Atualizar dados</button></div>
          </header>
          {crmError && <div className="crm-alert error" role="alert">{crmError}</div>}
          {crmStatus && <div className="crm-alert" role="status">{crmStatus}</div>}
          <div className="crm-controls">
            <form onSubmit={(event) => { event.preventDefault(); void loadCrm(crmSearch); }}>
              <input type="search" value={crmSearch} onChange={(event) => setCrmSearch(event.target.value)} placeholder="Buscar nome, empresa, CPF/CNPJ, telefone ou e-mail" />
              <button className="btn" disabled={crmBusy}>Buscar</button>
            </form>
            <button type="button" className="btn" onClick={() => setCrmFormOpen(!crmFormOpen)}>Cadastrar cliente</button>
          </div>
          {crmFormOpen && <form className="crm-form" onSubmit={saveCrmCustomer}>
            <label>Nome do contato<input required minLength={2} value={crmForm.name} onChange={e => setCrmForm({...crmForm,name:e.target.value})} /></label>
            <label>Empresa<input value={crmForm.company} onChange={e => setCrmForm({...crmForm,company:e.target.value})} /></label>
            <label>CPF/CNPJ<input value={crmForm.document} onChange={e => setCrmForm({...crmForm,document:e.target.value})} /></label>
            <label>Telefone<input value={crmForm.phone} onChange={e => setCrmForm({...crmForm,phone:e.target.value})} /></label>
            <label>E-mail<input type="email" value={crmForm.email} onChange={e => setCrmForm({...crmForm,email:e.target.value})} /></label>
            <div className="crm-form-actions"><button className="btn" disabled={crmSaving}>{crmSaving ? 'Salvando…' : 'Salvar no Ploomes'}</button><button type="button" className="btn alt" onClick={() => setCrmFormOpen(false)}>Cancelar</button></div>
          </form>}
          <div className="crm-columns">
            <section className="crm-panel"><h2>Clientes <span>{crmContacts.length}</span></h2>{crmBusy ? <p className="crm-empty">Consultando Ploomes…</p> : crmContacts.length ? <div className="crm-list">{crmContacts.map((c, i) => <article className="crm-record" key={c.Id || i}><strong>{c.Name || c.LegalName || c.CompanyName || 'Cadastro sem nome'}</strong><p>{[c.LegalName || c.CompanyName, c.CNPJ || c.Register || c.CPF, c.Phone, c.Email].filter(Boolean).join(' · ') || 'Sem dados complementares'}</p><small>Ploomes ID {c.Id ?? '—'}</small></article>)}</div> : <p className="crm-empty">{crmSearch ? 'Nenhum cliente encontrado para esta busca.' : 'Nenhum cliente retornado pelo Ploomes.'}</p>}</section>
            <section className="crm-panel"><h2>Oportunidades recentes <span>{crmDeals.length}</span></h2>{crmDeals.length ? <div className="crm-list">{crmDeals.map((d, i) => <article className="crm-record" key={d.Id || i}><strong>{d.Title || d.Name || 'Oportunidade sem título'}</strong><p>{d.Stage?.Name || d.StageName || 'Etapa não informada'} · {d.Amount ? new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(d.Amount)) : 'Valor não informado'}</p><small>Ploomes ID {d.Id ?? '—'}</small></article>)}</div> : <p className="crm-empty">Sem oportunidades disponíveis no Ploomes.</p>}</section>
          </div>
        </section>
      ) : <>
      <section className="queue">
        <header className="queue-head">
          <div className="queue-title">
            <div>
              <p className="eyebrow">Minha operação</p>
              <h1>
                {nav === 'all'
                  ? 'Fila de atendimento'
                  : nav === 'commercial'
                    ? 'Fila comercial'
                    : nav === 'technical'
                      ? 'Fila técnica'
                      : 'Atendimentos concluídos'}{' '}
                <span className="count">({visible.length})</span>
              </h1>
            </div>
            <button type="button" className="btn alt" onClick={refresh}>
              Atualizar fila
            </button>
          </div>
          {tipVisible && (
            <div className="tip">
              <span>Primeira vez aqui? Veja o que significam as prioridades, as colunas e os atalhos.</span>
              <span className="row">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => {
                    setTipVisible(false);
                    try {
                      localStorage.setItem(TIP_KEY, '1');
                    } catch {
                      /* ignorar */
                    }
                    setHelpOpen(true);
                  }}
                >
                  Abrir legenda
                </button>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => {
                    setTipVisible(false);
                    try {
                      localStorage.setItem(TIP_KEY, '1');
                    } catch {
                      /* ignorar */
                    }
                  }}
                >
                  Dispensar
                </button>
              </span>
            </div>
          )}
          {fire.length > 0 && (
            <div className="fire" role="status">
              <strong>
                {fire.length} urgente{fire.length > 1 ? 's' : ''} fora do prazo
              </strong>
              {fire.slice(0, 3).map((c) => (
                <button key={c.id} type="button" onClick={() => openCard(c.id)}>
                  {priorityOf(c)?.symbol} {c.contactName || c.contactPhone} ·{' '}
                  {c.followUpAt ? 'retorno vencido' : fmtWait(minutesSince(c.updatedAt, nowMs))}
                </button>
              ))}
              {fire.length > 3 && <span>+{fire.length - 3}</span>}
            </div>
          )}
          <div className="toolbar">
            <div className="tabs" role="group" aria-label="Visão da fila">
              {(
                [
                  ['action', 'Para agir'],
                  ['mine', 'Minha fila'],
                  ['all', 'Todas'],
                ] as [string, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={tab === key ? 'active' : ''}
                  aria-pressed={tab === key}
                  onClick={() => setTab(key)}
                >
                  {label}
                  <span className="n">{tabCount(key)}</span>
                </button>
              ))}
            </div>
            <div className="search-wrap">
              <label className="sr-only" htmlFor="search">
                Buscar cliente ou telefone
              </label>
              <input
                id="search"
                ref={searchRef}
                className="search"
                type="search"
                placeholder="Buscar cliente ou telefone"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="kbd" aria-hidden="true">
                /
              </span>
            </div>
          </div>
          <div className="chips" role="group" aria-label="Filtros rápidos">
            {(
              [
                ['unassigned', 'Sem responsável', chipCounts.unassigned, false],
                ['urgent', 'P1 e P2', chipCounts.urgent, false],
                ['due', 'Prazo vencido', chipCounts.due, true],
              ] as ['unassigned' | 'urgent' | 'due', string, number, boolean][]
            ).map(([key, label, count, alert]) => (
              <button
                key={key}
                type="button"
                className={'chip' + (alert && count ? ' alert' : '')}
                aria-pressed={filters[key]}
                onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
              >
                {label} <b>{count}</b>
              </button>
            ))}
            <button type="button" className="chip" aria-pressed={group} onClick={() => setGroup(!group)}>
              Agrupar por prioridade
            </button>
            <span className="sep" />
            {views.map((v, i) => (
              <span className="view" key={v.name + i}>
                <button type="button" onClick={() => applyView(v)}>
                  {v.name}
                </button>
                <button
                  type="button"
                  className="x"
                  aria-label={`Excluir vista ${v.name}`}
                  onClick={() => persistViews(views.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            ))}
            {savingView ? (
              <input
                className="view-name"
                autoFocus
                maxLength={24}
                value={viewName}
                placeholder="Nome da vista"
                aria-label="Nome da vista"
                onChange={(e) => setViewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveView();
                  if (e.key === 'Escape') setSavingView(false);
                }}
                onBlur={() => window.setTimeout(() => setSavingView(false), 120)}
              />
            ) : (
              <button type="button" className="chip" onClick={() => setSavingView(true)}>
                + Salvar vista
              </button>
            )}
          </div>
        </header>

        {bulk.size > 0 && (
          <div className="bulk">
            <strong>
              {bulk.size} selecionado{bulk.size > 1 ? 's' : ''}
            </strong>
            <button type="button" className="btn alt sm" onClick={() => void bulkClaim()}>
              Assumir
            </button>
            <button type="button" className="btn alt sm" onClick={bulkClose}>
              Concluir
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setBulk(new Set())}>
              Limpar
            </button>
          </div>
        )}

        <div className="column-nav" role="group" aria-label="Etapa do quadro">
          {shownGroups.map(([title, rows]) => (
            <button
              key={title}
              type="button"
              aria-pressed={mobileColumn === boardColumnByTitle[title]}
              onClick={() => setMobileColumn(boardColumnByTitle[title])}
            >
              {title} <b>{rows.length}</b>
            </button>
          ))}
        </div>

        <div className={'board' + (bulk.size ? ' has-pick' : '')} style={{ gridTemplateColumns: gridCols }}>
          {shownGroups.map(([title, rows]) => {
            const id = boardColumnByTitle[title];
            const def = COLUMNS.find((c) => c.id === id)!;
            return (
              <section
                className={
                  'column ' +
                  (dropTarget === id ? 'drop-target ' : '') +
                  (isMobile && mobileColumn === id ? 'm-on' : '')
                }
                style={{ ['--c' as string]: def.color }}
                key={title}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTarget(id);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                    setDropTarget(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const dragged = event.dataTransfer.getData('text/plain') || draggingId;
                  const card = items.find((item) => item.id === dragged);
                  setDropTarget(null);
                  setDraggingId('');
                  if (card) void moveToColumn(card, id);
                }}
                aria-label={`${title}, ${rows.length} atendimentos. Solte um cartão aqui para mover.`}
              >
                <div className="column-head">
                  <strong>
                    <i aria-hidden="true" />
                    {title}
                  </strong>
                  <span>{rows.length}</span>
                </div>
                <div className="cards">{renderColumnBody(id, rows, def.hint)}</div>
              </section>
            );
          })}
        </div>
        {boardNotice && (
          <p className="board-notice" role="status" aria-live="polite">
            <span>{boardNotice}</span>
            {undo && (
              <button type="button" className="undo" onClick={() => void runUndo()}>
                {undo.label}
              </button>
            )}
            <button type="button" onClick={dismissNotice} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}
      </section>

      <section className={'workspace' + (workspaceOpen ? ' open' : '')} aria-label="Conversa">
        {selected ? (
          <>
            <header className="workspace-head">
              <div className="head-row">
                <button type="button" className="back" onClick={() => setMobileOpen(false)}>
                  ‹ Fila
                </button>
                <div className="head-main">
                  <h2>{selected.contactName || selected.contactPhone}</h2>
                  <div className="meta">
                    <span className="mono">{fmtPhone(selected.contactPhone)}</span>
                    {selectedPriority && (
                      <span className={'badge ' + selectedPriority.key.toLowerCase()} title={selectedPriority.text}>
                        {selectedPriority.symbol} {selectedPriority.key}
                      </span>
                    )}
                    <span className="area" style={{ ['--a' as string]: AREA_COLOR[areaKey(selected)] }}>
                      {areaLabel(selected)}
                    </span>
                  </div>
                </div>
              </div>
              <div className={'state' + (selectedDue || (customerWaiting && !selected.assignedOperator) ? ' due' : '')}>
                <span>
                  {selected.state === 'closed'
                    ? 'Atendimento concluído. O histórico está preservado.'
                    : isCommercialLead
                      ? 'Lead recebido pelo comercial'
                      : selected.assignedOperator
                        ? selected.assignedOperator === name
                          ? customerWaiting
                            ? `Você é o responsável · cliente aguarda há ${fmtWait(minutesSince(lastMessage?.receivedAt, nowMs))}`
                            : 'Você é o responsável'
                          : `Em atendimento por ${selected.assignedOperator}`
                        : `Aguardando alguém assumir · há ${fmtWait(minutesSince(selected.updatedAt, nowMs))}`}
                </span>
                <span className="row">
                  {selected.state === 'closed' ? (
                    <button type="button" className="btn alt" onClick={reopen}>
                      Reabrir atendimento
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void claim()}
                        disabled={selected.assignedOperator === name || isCommercialLead}
                      >
                        {selected.assignedOperator === name
                          ? 'Em atendimento por você'
                          : isCommercialLead
                            ? 'Lead comercial — sem assumir'
                            : 'Assumir atendimento'}
                      </button>
                      {!isCommercialLead && (
                        <>
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => openCloseDialog()}
                            disabled={!canActOnSelected}
                            title={!canActOnSelected ? 'Assuma o atendimento antes de encerrá-lo.' : undefined}
                          >
                            Finalizar
                          </button>
                          <button
                            type="button"
                            className="btn alt"
                            onClick={() => void release()}
                            disabled={!selected.assignedOperator}
                          >
                            Devolver à fila
                          </button>
                        </>
                      )}
                    </>
                  )}
                </span>
              </div>
              {selected.state !== 'closed' && (
                <div className="quick-actions">
                  {!isCommercialLead && canActOnSelected && role !== 'viewer' && (
                    <button type="button" className="action-link" onClick={openTransfer}>
                      Transferir
                    </button>
                  )}
                  {!isCommercialLead && (
                    <button
                      type="button"
                      className="action-link"
                      onClick={() => {
                        setActionValue('');
                        setActionError('');
                        setActionKind('followup');
                      }}
                    >
                      Agendar retorno
                    </button>
                  )}
                  {selected.destinationArea === 'commercial' && (
                    <>
                      <button type="button" className="action-link" onClick={() => void syncPloomes()}>
                        Cadastrar oportunidade
                      </button>
                      <button
                        type="button"
                        className="action-link"
                        onClick={() => {
                          setActionValue('');
                          setActionError('');
                          setActionKind('ploomesManual');
                        }}
                      >
                        Cadastro manual
                      </button>
                    </>
                  )}
                  {['technical', 'on_call'].includes(selected.destinationArea || '') && (
                    <button
                      type="button"
                      className="action-link"
                      onClick={() => {
                        setActionValue('');
                        setActionError('');
                        setActionKind('serviceOrder');
                      }}
                    >
                      Registrar OS manual
                    </button>
                  )}
                  {selectedColumn && selected.assignedOperator === name && (
                    <label className="move">
                      Mover para
                      <select
                        value={selectedColumn}
                        disabled={movingId === selected.id}
                        onChange={(e) => void moveToColumn(selected, e.target.value as BoardColumn)}
                      >
                        {COLUMNS.filter((c) => c.id !== 'closed').map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </header>

            <div className="context">
              {contextEntries.length > 0 && (
                <div className="triage" aria-label="Triagem do bot">
                  {contextEntries.slice(0, 8).map(([k, v]) => (
                    <span key={k}>
                      <em>{prettyKey(k)}</em>
                      {String(v)}
                    </span>
                  ))}
                </div>
              )}
              {history.length > 0 && (
                <details className="history">
                  <summary>Histórico do cliente ({history.length})</summary>
                  <ul>
                    {history.map((h) => (
                      <li key={h.id}>
                        <b>{h.protocolId || 'Sem protocolo'}</b>
                        {' · '}
                        {h.destinationArea === 'commercial' ? 'Comercial' : h.destinationArea === 'technical' ? 'Técnico' : h.destinationArea || 'Atendimento'}
                        {' · '}
                        {h.state === 'closed' ? 'Concluído' : 'Em aberto'}
                        {' · '}
                        {new Date(h.updatedAt).toLocaleDateString('pt-BR')}
                        {h.resolutionNote ? <small>{h.resolutionNote}</small> : null}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {selected.state !== 'closed' && windowState === 'dead' && (
                <div className="window dead">
                  A janela de 24 h do WhatsApp está encerrada. Uma resposta livre pode ser recusada; use um modelo aprovado.
                </div>
              )}
              {selected.state !== 'closed' && windowState === 'warn' && windowLeft !== null && (
                <div className="window warn">
                  A janela de 24 h fecha em {fmtWait(windowLeft)}. Depois só modelos aprovados.
                </div>
              )}
              {selected.state !== 'closed' && windowState === 'ok' && windowLeft !== null && (
                <div className="window">Janela de 24 h aberta por mais {fmtWait(windowLeft)}</div>
              )}
            </div>

            {!!selected.attachments?.length && (
              <div className="attachments" aria-label="Anexos da conversa">
                <strong>Anexos</strong>
                {selected.attachments.map((attachment) => (
                  <div className="attachment-wrap" key={attachment.id}>
                    {attachmentUrls[attachment.id] && isImage(attachment) && (
                      <img
                        className="attachment-preview"
                        src={attachmentUrls[attachment.id]}
                        alt={attachment.fileName}
                        onClick={() =>
                          setLightbox({
                            url: attachmentUrls[attachment.id],
                            name: attachment.fileName,
                            text: attachment.extractedText,
                          })
                        }
                      />
                    )}
                    <button
                      type="button"
                      className="attachment"
                      disabled={attachment.status !== 'stored'}
                      onClick={() => void openAttachment(attachment)}
                    >
                      {attachment.fileName}
                      <small>{attachment.status === 'stored' ? (isImage(attachment) ? 'Ampliar' : 'Abrir') : attachment.status}</small>
                    </button>
                    {attachment.extractedText && (
                      <details>
                        <summary>
                          {attachment.mediaType.startsWith('audio/') ? 'Transcrição' : 'Leitura IA'}
                        </summary>
                        <p>{attachment.extractedText}</p>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="messages" ref={threadRef} tabIndex={0} aria-label="Mensagens">
              {(selected.messages || []).map((m, i, arr) => {
                const label = dayLabel(m.receivedAt);
                const showDay = i === 0 || label !== dayLabel(arr[i - 1].receivedAt);
                return (
                  <div key={m.id} className="message-wrap">
                    {showDay && label && <span className="day">{label}</span>}
                    <div className={'message ' + (m.direction !== 'inbound' ? 'out' : '')}>
                      <span className="author">
                        {m.direction === 'inbound'
                          ? 'Cliente'
                          : m.content.startsWith(name + ':')
                            ? 'Você'
                            : 'Bot Life'}
                      </span>
                      {m.content}
                      <small>
                        {new Date(m.receivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {m.direction === 'outbound' && m.deliveryStatus ? (
                          <>
                            {' · '}
                            <span className={'st ' + String(m.deliveryStatus).toLowerCase().split(':')[0]}>
                              {DELIVERY[String(m.deliveryStatus).toLowerCase().split(':')[0]] || m.deliveryStatus}
                            </span>
                            {String(m.deliveryStatus).toLowerCase().startsWith('failed') && canActOnSelected && (
                              <>
                                {' · '}
                                <button
                                  type="button"
                                  className="retry"
                                  disabled={retryingId === m.id}
                                  onClick={() => void retryMessage(m)}
                                >
                                  {retryingId === m.id ? 'Reenviando…' : 'Reenviar'}
                                </button>
                              </>
                            )}
                          </>
                        ) : null}
                      </small>
                    </div>
                  </div>
                );
              })}
            </div>

            {selected.state === 'closed' ? null : (
              <div className="reply">
                {canActOnSelected && !isCommercialLead && (
                  <>
                    <div className="reply-tools">
                      <div className="quick-replies" aria-label="Respostas rápidas">
                        {QUICK_REPLIES.map((q) => (
                          <button
                            type="button"
                            key={q}
                            onClick={() => setText(text ? text + ' ' + q : q)}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="link"
                        aria-expanded={templatesOpen}
                        onClick={() => setTemplatesOpen(!templatesOpen)}
                      >
                        Modelos
                      </button>
                    </div>
                    {templatesOpen && (
                      <div className="templates" role="menu">
                        {TEMPLATES.map(([title, body]) => (
                          <button
                            type="button"
                            role="menuitem"
                            key={title}
                            onClick={() => {
                              setText(fillTemplate(body));
                              setTemplatesOpen(false);
                            }}
                          >
                            {title}
                            <small>{fillTemplate(body)}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {role !== 'viewer' && (
                  <div className="reply-tabs" role="tablist" aria-label="Tipo de mensagem">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={composerMode === 'reply'}
                      className={composerMode === 'reply' ? 'active' : ''}
                      onClick={() => setComposerMode('reply')}
                    >
                      Responder ao cliente
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={composerMode === 'note'}
                      className={'note-tab' + (composerMode === 'note' ? ' active' : '')}
                      onClick={() => setComposerMode('note')}
                    >
                      Nota interna{selected.notes?.length ? ` (${selected.notes.length})` : ''}
                    </button>
                  </div>
                )}
                {composerMode === 'note' && role !== 'viewer' ? (
                  <div className="notes">
                    <p className="hint">Só a equipe vê estas notas. O cliente não recebe nada.</p>
                    {!!selected.notes?.length && (
                      <ul className="note-list">
                        {selected.notes.map((n) => (
                          <li key={n.id}>
                            <b>{n.author}</b>
                            <small>
                              {new Date(n.createdAt).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </small>
                            <span>{n.content}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form className="composer note" onSubmit={saveNote}>
                      <label className="sr-only" htmlFor="note">
                        Nota interna
                      </label>
                      <textarea
                        id="note"
                        value={noteText}
                        rows={2}
                        maxLength={2000}
                        onChange={(e) => {
                          setNoteText(e.target.value);
                          setNoteError('');
                        }}
                        placeholder="Escreva uma nota para a equipe…"
                        disabled={noteSending}
                      />
                      <button className="btn alt" disabled={noteSending || !noteText.trim()}>
                        {noteSending ? 'Salvando…' : 'Salvar nota'}
                      </button>
                    </form>
                    {noteError && <small className="form-error">{noteError}</small>}
                  </div>
                ) : (
                <form className="composer" onSubmit={send}>
                  <label className="sr-only" htmlFor="message">
                    Mensagem
                  </label>
                  <textarea
                    id="message"
                    value={text}
                    rows={1}
                    onChange={(e) => {
                      setText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={
                      isCommercialLead
                        ? 'Lead tratado diretamente pelo comercial.'
                        : canActOnSelected
                          ? 'Digite uma mensagem para enviar…'
                          : 'Assuma o atendimento para responder…'
                    }
                    disabled={sending || !canActOnSelected}
                  />
                  <button className="btn" disabled={sending || !text.trim() || !canActOnSelected}>
                    {sending ? 'Enviando…' : 'Enviar'}
                  </button>
                </form>
                )}
                {sendError && composerMode === 'reply' && <small className="form-error">{sendError}</small>}
                {canActOnSelected && !isCommercialLead && (
                  <p className="hint">Enter envia · Shift+Enter quebra a linha</p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="empty-workspace">
            <p className="eyebrow">Fila organizada</p>
            <h2>Nenhum atendimento selecionado</h2>
            <p>Escolha um caso no quadro para ler a conversa e responder.</p>
          </div>
        )}
      </section>
      </>}

      {closeDialogOpen && (
        <div
          className={'modal-backdrop ' + themeClass}
          onMouseDown={() => !closing && setCloseDialogOpen(false)}
          role="presentation"
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-mark" aria-hidden="true">
              ✓
            </div>
            <p className="eyebrow">Encerrar atendimento</p>
            <h2 id="close-dialog-title">Registrar a resolução</h2>
            <p className="modal-copy">
              {closeTargets.length > 1
                ? `A mesma resolução será registrada em ${closeTargets.length} atendimentos.`
                : 'Informe brevemente como a solicitação foi resolvida antes de finalizar o atendimento.'}
            </p>
            <div className="hints">
              {RESOLUTION_HINTS.map((h) => (
                <button type="button" key={h} onClick={() => setResolution(h)} disabled={closing}>
                  {h}
                </button>
              ))}
            </div>
            <label className="field modal-field">
              Resolução do atendimento
              <textarea
                autoFocus
                value={resolution}
                onChange={(event) => {
                  setResolution(event.target.value);
                  if (closeError) setCloseError('');
                }}
                placeholder="Ex.: Cliente orientado, visita técnica agendada para 23/10."
                disabled={closing}
              />
            </label>
            <div className="modal-meta">{resolution.trim().length}/3 caracteres mínimos</div>
            {closeError && <p className="modal-error">{closeError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn alt"
                onClick={() => setCloseDialogOpen(false)}
                disabled={closing}
              >
                Cancelar
              </button>
              <button type="button" className="btn danger solid" onClick={close} disabled={closing}>
                {closing
                  ? 'Finalizando…'
                  : closeTargets.length > 1
                    ? `Finalizar ${closeTargets.length} atendimentos`
                    : 'Finalizar atendimento'}
              </button>
            </div>
          </section>
        </div>
      )}
      {transferOpen && selected && (
        <div
          className={'modal-backdrop ' + themeClass}
          onMouseDown={() => !transferring && setTransferOpen(false)}
          role="presentation"
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Transferir atendimento</p>
            <h2 id="transfer-title">Passar para outra pessoa</h2>
            <p className="modal-copy">
              Quem receber verá o motivo nas notas internas. O cliente não é avisado da troca.
            </p>
            <label className="field modal-field">
              Quem vai receber
              <select
                autoFocus
                value={transferTo}
                onChange={(e) => {
                  setTransferTo(e.target.value);
                  setTransferError('');
                }}
                disabled={transferring}
              >
                <option value="">Escolha uma pessoa…</option>
                {transferCandidates.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field modal-field">
              Motivo da transferência
              <textarea
                value={transferReason}
                onChange={(e) => {
                  setTransferReason(e.target.value);
                  setTransferError('');
                }}
                maxLength={500}
                placeholder="Ex.: Cliente pediu o técnico que atendeu a visita anterior."
                disabled={transferring}
              />
            </label>
            <div className="modal-meta">{transferReason.trim().length}/3 caracteres mínimos</div>
            {transferError && <p className="modal-error">{transferError}</p>}
            <div className="modal-actions">
              <button type="button" className="btn alt" onClick={() => setTransferOpen(false)} disabled={transferring}>
                Cancelar
              </button>
              <button type="button" className="btn solid" onClick={() => void doTransfer()} disabled={transferring}>
                {transferring ? 'Transferindo…' : 'Transferir'}
              </button>
            </div>
          </section>
        </div>
      )}
      {actionKind && (
        <div
          className={'modal-backdrop ' + themeClass}
          onMouseDown={() => !acting && setActionKind(null)}
          role="presentation"
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Ação operacional</p>
            <h2>
              {actionKind === 'followup'
                ? 'Agendar retorno'
                : actionKind === 'ploomesManual'
                  ? 'Registrar no Ploomes'
                  : 'Registrar abertura de OS'}
            </h2>
            <p className="modal-copy">
              {actionKind === 'followup'
                ? 'Defina quando a equipe deve retomar este atendimento.'
                : actionKind === 'ploomesManual'
                  ? 'Informe o identificador criado no Ploomes.'
                  : 'Informe o número da OS aberta manualmente. A integração Sankhya continua pendente.'}
            </p>
            {actionKind === 'followup' && (
              <div className="hints">
                <button type="button" onClick={() => setActionValue(toLocalInput(atHour(0, 18)))}>
                  Hoje 18:00
                </button>
                <button type="button" onClick={() => setActionValue(toLocalInput(atHour(1, 9)))}>
                  Amanhã 09:00
                </button>
                <button type="button" onClick={() => setActionValue(toLocalInput(atHour(3, 9)))}>
                  Em 3 dias 09:00
                </button>
              </div>
            )}
            <label className="field modal-field">
              {actionKind === 'followup'
                ? 'Data e horário'
                : actionKind === 'ploomesManual'
                  ? 'ID no Ploomes'
                  : 'Número da OS'}
              <input
                autoFocus
                type={actionKind === 'followup' ? 'datetime-local' : 'text'}
                value={actionValue}
                onChange={(event) => {
                  setActionValue(event.target.value);
                  setActionError('');
                }}
                disabled={acting}
              />
            </label>
            {actionError && <p className="modal-error">{actionError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn alt"
                onClick={() => setActionKind(null)}
                disabled={acting}
              >
                Cancelar
              </button>
              <button type="button" className="btn solid" onClick={runAction} disabled={acting}>
                {acting ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </section>
        </div>
      )}
      {helpOpen && (
        <div className={'modal-backdrop ' + themeClass} onMouseDown={() => setHelpOpen(false)} role="presentation">
          <section
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Ajuda</p>
            <h2 id="help-title">Legenda e atalhos</h2>
            <div className="legend">
              <h4>Prioridade (prazo da primeira resposta)</h4>
              {Object.entries(PRIORITY).map(([key, p]) => (
                <div className="legend-row" key={key}>
                  <span className={'badge ' + key.toLowerCase()}>
                    {p.symbol} {key}
                  </span>
                  <span>{p.text}</span>
                </div>
              ))}
              <h4>Etapas do quadro</h4>
              {COLUMNS.map((c) => (
                <div className="legend-row" key={c.id}>
                  <span>{c.title}</span>
                  <span>{c.hint}</span>
                </div>
              ))}
              <h4>WhatsApp</h4>
              <div className="legend-row">
                <span>Janela de 24 h</span>
                <span>Depois de 24 h da última mensagem do cliente, só modelos aprovados são aceitos.</span>
              </div>
              <h4>Atalhos</h4>
              <div className="legend-row">
                <kbd>/</kbd>
                <span>Buscar cliente ou telefone</span>
              </div>
              <div className="legend-row">
                <kbd>↑ ↓ ← →</kbd>
                <span>Navegar entre os cartões</span>
              </div>
              <div className="legend-row">
                <span>
                  <kbd>A</kbd> <kbd>C</kbd> <kbd>L</kbd>
                </span>
                <span>Assumir, concluir e devolver à fila (com o cartão em foco)</span>
              </div>
              <div className="legend-row">
                <kbd>Esc</kbd>
                <span>Fechar a conversa no celular ou uma janela aberta</span>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn solid" onClick={() => setHelpOpen(false)}>
                Entendi
              </button>
            </div>
          </section>
        </div>
      )}
      {lightbox && (
        <div className={'modal-backdrop ' + themeClass} onMouseDown={() => setLightbox(null)} role="presentation">
          <section
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-label={`Anexo ${lightbox.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>{lightbox.name}</h2>
            <img className="lightbox-img" src={lightbox.url} alt={lightbox.name} />
            {lightbox.text && <p className="modal-copy">{lightbox.text}</p>}
            <div className="modal-actions">
              <a className="btn alt" href={lightbox.url} target="_blank" rel="noopener noreferrer">
                Abrir em nova aba
              </a>
              <button type="button" className="btn solid" onClick={() => setLightbox(null)}>
                Fechar
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
