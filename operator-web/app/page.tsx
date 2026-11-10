'use client';

import { DragEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, jsonInit } from '@/lib/api';
import {
  Attachment,
  BoardColumn,
  COLUMN_TITLE_TO_ID,
  COLUMNS,
  Conversation,
  Filters,
  HistoryItem,
  Message,
  NavKey,
  Operator,
  SavedView,
  TabKey,
  TIP_KEY,
  VIEWS_KEY,
  areaKey,
  columnOf,
  isDue,
  isImage,
  isUrgent,
  minutesSince,
  priorityOf,
} from '@/lib/domain';
import { Board, ColumnData } from '@/components/Board';
import { Icon } from '@/components/Icon';
import { ActionDialog, ActionKind, CloseDialog, HelpDialog, Lightbox, TransferDialog } from '@/components/Dialogs';
import { Login } from '@/components/Login';
import { Rail } from '@/components/Rail';
import { Toolbar } from '@/components/Toolbar';
import { Workspace } from '@/components/Workspace';
import CrmView from '@/components/CrmView';

type Undo = { label: string; run: () => Promise<void> };

export default function OperatorPage() {
  /* sessão */
  const [logged, setLogged] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');

  /* dados */
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [operators, setOperators] = useState<Operator[]>([]);

  /* filtros e visão */
  const [tab, setTab] = useState<TabKey>('action');
  const [nav, setNav] = useState<NavKey>('all');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ unassigned: false, urgent: false, due: false });
  const [group, setGroup] = useState(false);
  const [views, setViews] = useState<SavedView[]>([]);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [mobileColumn, setMobileColumn] = useState<BoardColumn>('waiting');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [bulk, setBulk] = useState<Set<string>>(new Set());
  const [crmOpen, setCrmOpen] = useState(false);

  /* quadro */
  const [draggingId, setDraggingId] = useState('');
  const [dropTarget, setDropTarget] = useState<BoardColumn | null>(null);
  const [movingId, setMovingId] = useState('');
  const [boardNotice, setBoardNotice] = useState('');
  const [undo, setUndo] = useState<Undo | null>(null);

  /* conversa */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [retryingId, setRetryingId] = useState('');
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply');
  const [noteText, setNoteText] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);

  /* diálogos */
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeTargets, setCloseTargets] = useState<Conversation[]>([]);
  const [resolution, setResolution] = useState('');
  const [closeError, setCloseError] = useState('');
  const [closing, setClosing] = useState(false);
  const [actionKind, setActionKind] = useState<ActionKind | null>(null);
  const [actionValue, setActionValue] = useState('');
  const [actionError, setActionError] = useState('');
  const [acting, setActing] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; name: string; text?: string | null } | null>(null);

  /* preferências */
  const [tipVisible, setTipVisible] = useState(false);
  const [sound, setSound] = useState(false);
  const [dark, setDark] = useState<boolean | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const selectedRef = useRef<Conversation | null>(null);
  selectedRef.current = selected;
  const audioRef = useRef<AudioContext | null>(null);
  const lastFireRef = useRef(0);
  const focusIdRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedId = selected?.id;
  const text = selected ? drafts[selected.id] || '' : '';
  const canActOn = (c: Conversation) => (!!c.assignedOperator && c.assignedOperator === name) || ['admin', 'coordination'].includes(role);
  const canActOnSelected = !!selected && canActOn(selected);
  const isCommercialLead =
    !!selected && (selected.destinationArea === 'commercial' || selected.route === 'commercial') && !selected.assignedOperator;

  /* ---------- notificações com desfazer ---------- */
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
      setBoardNotice(error instanceof Error ? 'Não foi possível desfazer: ' + error.message : 'Não foi possível desfazer.');
    }
  };

  /* ---------- carregamento ---------- */
  const load = async () => {
    const rows = await api<Conversation[]>('/api/operator/conversations?includeClosed=true');
    setItems(rows);
    const current = selectedRef.current;
    if (current) {
      const row = rows.find((x) => x.id === current.id);
      if (row) {
        const detail = await api<Conversation>('/api/operator/conversations/' + row.id);
        if (selectedRef.current?.id === detail.id) setSelected(detail);
      }
    }
  };
  const refresh = () => {
    void load().catch((error) => setBoardNotice(error instanceof Error ? error.message : 'Não foi possível atualizar a fila. Tente novamente.'));
  };
  const open = async (id: string) => {
    try {
      setSelected(await api<Conversation>('/api/operator/conversations/' + id));
      setBoardNotice('');
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível carregar este atendimento. Tente atualizar a fila.');
    }
  };
  const openCard = (id: string) => {
    focusIdRef.current = id;
    setTemplatesOpen(false);
    if (isMobile) setMobileOpen(true);
    void open(id);
  };

  /* histórico do cliente ao trocar de atendimento */
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

  /* sessão e preferências iniciais */
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
    const n = sessionStorage.getItem('operatorName');
    const t = sessionStorage.getItem('operatorToken');
    const r = sessionStorage.getItem('operatorRole');
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

  /* tema: "auto" segue o sistema; claro/escuro sobrescrevem via data-theme */
  useEffect(() => {
    const root = document.documentElement;
    if (dark === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  /* atualização automática e relógio dos prazos */
  useEffect(() => {
    if (!logged) return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
      if (!document.hidden) refresh();
    }, 30000);
    return () => window.clearInterval(id);
  }, [logged]);

  /* URLs assinadas das imagens do atendimento aberto */
  useEffect(() => {
    let cancelled = false;
    const images = (selected?.attachments || []).filter((a) => a.status === 'stored' && isImage(a));
    if (!images.length) {
      setAttachmentUrls({});
      return;
    }
    Promise.all(
      images.map(async (a) => {
        try {
          const result = await api<{ url: string }>('/api/operator/conversations/' + selected!.id + '/attachments/' + a.id + '/url');
          return [a.id, result.url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setAttachmentUrls(Object.fromEntries(entries.filter(Boolean) as Array<[string, string]>));
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.attachments]);

  /* rola a conversa até a última mensagem */
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected?.id, selected?.messages?.length]);

  /* ---------- login ---------- */
  const login = async () => {
    setLoginBusy(true);
    setNotice('Entrando…');
    try {
      const r = await fetch('/api/operator/login', jsonInit('POST', { email: email.trim(), password }));
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
      if (!s.token || !s.user?.name || !s.user.role) throw new Error('Sessão inválida retornada pelo servidor.');
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
      setNotice(x instanceof Error ? x.message : 'Não foi possível carregar a fila. Verifique se o backend está online.');
    } finally {
      setLoginBusy(false);
    }
  };

  /* ---------- derivados da fila ---------- */
  const fire = useMemo(
    () =>
      items
        .filter((c) => isUrgent(c) && isDue(c, nowMs))
        .sort(
          (a, b) =>
            Number(priorityOf(a)?.key.slice(1)) - Number(priorityOf(b)?.key.slice(1)) ||
            minutesSince(b.updatedAt, nowMs) - minutesSince(a.updatedAt, nowMs),
        ),
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

  const matchesNav = (c: Conversation) =>
    nav === 'all' ||
    (nav === 'closed' && c.state === 'closed') ||
    (nav === 'commercial' && areaKey(c) === 'commercial') ||
    (nav === 'technical' && areaKey(c) === 'technical');
  const matchesSearch = (c: Conversation) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return ((c.contactName || '') + ' ' + c.contactPhone + ' ' + (c.protocolId || '')).toLowerCase().includes(q);
  };
  const matchesTab = (c: Conversation, t: TabKey) => {
    const action = c.state !== 'closed' && (!c.assignedOperator || !!c.followUpAt);
    return t === 'all' || (t === 'mine' ? c.assignedOperator === name : action);
  };
  const baseItems = useMemo(() => items.filter((c) => matchesSearch(c) && matchesNav(c)), [items, query, nav]);
  const visible = useMemo(
    () =>
      baseItems.filter((c) => {
        if (!matchesTab(c, tab)) return false;
        if (filters.unassigned && c.assignedOperator) return false;
        if (filters.urgent && !isUrgent(c)) return false;
        if (filters.due && !isDue(c, nowMs)) return false;
        return true;
      }),
    [baseItems, tab, name, filters, nowMs],
  );
  const columnsData: ColumnData[] = useMemo(() => {
    const by: Record<BoardColumn, Conversation[]> = { waiting: [], lead: [], active: [], followup: [], closed: [] };
    visible.forEach((c) => by[columnOf(c)].push(c));
    const all = COLUMNS.map((c) => ({ id: c.id, rows: by[c.id] }));
    return nav === 'closed' ? all.filter((c) => c.id === 'closed') : all;
  }, [visible, nav]);
  /* no celular, mostra a coluna escolhida; se ela estiver vazia, cai na primeira com atendimentos */
  const activeMobileColumn: BoardColumn =
    columnsData.find((c) => c.id === mobileColumn && c.rows.length)?.id ?? columnsData.find((c) => c.rows.length)?.id ?? mobileColumn;
  const tabCounts: Record<TabKey, number> = {
    action: baseItems.filter((c) => matchesTab(c, 'action')).length,
    mine: baseItems.filter((c) => matchesTab(c, 'mine')).length,
    all: baseItems.filter((c) => matchesTab(c, 'all')).length,
  };
  const openItems = items.filter((c) => c.state !== 'closed');
  const navCounts: Record<NavKey, number> = {
    all: openItems.length,
    commercial: openItems.filter((c) => areaKey(c) === 'commercial').length,
    technical: openItems.filter((c) => areaKey(c) === 'technical').length,
    closed: items.filter((c) => c.state === 'closed').length,
  };
  const chipBase = baseItems.filter((c) => c.state !== 'closed');
  const chipCounts = {
    unassigned: chipBase.filter((c) => !c.assignedOperator).length,
    urgent: chipBase.filter(isUrgent).length,
    due: chipBase.filter((c) => isDue(c, nowMs)).length,
  };
  const anyFilter = !!query || filters.unassigned || filters.urgent || filters.due;

  /* ---------- ações do quadro ---------- */
  const openClose = (targets: Conversation[]) => {
    setCloseTargets(targets);
    setResolution('');
    setCloseError('');
    setCloseOpen(true);
  };
  const moveToColumn = async (conversation: Conversation, target: BoardColumn) => {
    if (movingId) return;
    const current = columnOf(conversation);
    if (target === current) return;
    setBoardNotice('');
    if (conversation.state === 'closed') {
      setBoardNotice('Atendimentos concluídos são somente leitura. Reabra o atendimento antes de movê-lo.');
      return;
    }
    if ((target === 'waiting' || target === 'lead') && (current === 'active' || current === 'followup') && conversation.assignedOperator) {
      if (conversation.assignedOperator !== name) {
        setBoardNotice('Só é possível devolver à fila um atendimento que está atribuído a você.');
        return;
      }
      if (target === 'lead' && conversation.route !== 'commercial') {
        setBoardNotice('A etapa Lead é reservada para atendimentos classificados como comerciais.');
        return;
      }
      if (target === 'waiting' && conversation.route === 'commercial') {
        setBoardNotice('Este atendimento é comercial; ele permanece na etapa Lead quando devolvido.');
        return;
      }
      await runMove(conversation.id, async () => {
        await api('/api/operator/conversations/' + conversation.id + '/release', { method: 'POST' });
        return 'Atendimento devolvido à fila.';
      });
      return;
    }
    if (target === 'active') {
      if (conversation.assignedOperator && conversation.assignedOperator !== name) {
        setBoardNotice('Este atendimento já está em atendimento por outra pessoa.');
        return;
      }
      await runMove(conversation.id, async () => {
        if (!conversation.assignedOperator) await api('/api/operator/conversations/' + conversation.id + '/claim', { method: 'POST' });
        if (conversation.followUpAt)
          await api('/api/operator/conversations/' + conversation.id + '/follow-up', jsonInit('POST', { followUpAt: null }));
        return 'Atendimento assumido por você.';
      });
      return;
    }
    if (target === 'followup') {
      await open(conversation.id);
      setActionValue('');
      setActionError('');
      setActionKind('followup');
      setBoardNotice('Escolha a data e o horário para agendar o retorno.');
      return;
    }
    if (target === 'closed') {
      await open(conversation.id);
      openClose([conversation]);
      setBoardNotice('Registre a resolução para concluir o atendimento.');
      return;
    }
    if (target === 'waiting' || target === 'lead') {
      if (target === 'lead' && conversation.route !== 'commercial') {
        setBoardNotice('A etapa Lead é reservada para atendimentos classificados como comerciais.');
        return;
      }
      if (target === 'waiting' && conversation.route === 'commercial') {
        setBoardNotice('A etapa Aguardando não altera a classificação comercial deste atendimento.');
        return;
      }
      if (current === 'followup') {
        await runMove(conversation.id, async () => {
          await api('/api/operator/conversations/' + conversation.id + '/follow-up', jsonInit('POST', { followUpAt: null }));
          return 'Retorno cancelado; atendimento voltou para a fila.';
        });
        return;
      }
    }
    setBoardNotice('Essa mudança não está disponível para este atendimento.');
  };
  /** Executa uma mudança de coluna com trava de movimento e aviso de resultado. */
  const runMove = async (id: string, job: () => Promise<string>) => {
    setMovingId(id);
    try {
      const message = await job();
      await load();
      setBoardNotice(message);
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    } finally {
      setMovingId('');
    }
  };
  const claim = async (target?: Conversation) => {
    const conversation = target || selected;
    if (!conversation) return;
    if ((conversation.destinationArea === 'commercial' || conversation.route === 'commercial') && !conversation.assignedOperator) {
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
  const openCloseDialog = (target?: Conversation) => {
    const conversation = target || selected;
    if (!conversation || (!conversation.assignedOperator && !['admin', 'coordination'].includes(role))) {
      setBoardNotice('Assuma o atendimento antes de encerrá-lo.');
      return;
    }
    openClose([conversation]);
  };
  const closeConversations = async () => {
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
        await api('/api/operator/conversations/' + target.id + '/close', jsonInit('POST', { resolutionNote: resolution.trim() }));
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
    setCloseOpen(false);
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

  /* ---------- conversa ---------- */
  const setText = (value: string) => {
    if (selected) setDrafts((d) => ({ ...d, [selected.id]: value }));
  };
  const send = async () => {
    if (!selected || !text.trim() || sending) return;
    const message = text.trim();
    const id = selected.id;
    setSending(true);
    setSendError('');
    try {
      await api('/api/operator/conversations/' + id + '/messages', jsonInit('POST', { text: message }));
      setDrafts((d) => ({ ...d, [id]: '' }));
      await open(id);
      void load().catch(() => undefined);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };
  const retryMessage = async (message: Message) => {
    if (!selected || retryingId) return;
    setRetryingId(message.id);
    setSendError('');
    try {
      await api('/api/operator/conversations/' + selected.id + '/messages/' + message.id + '/retry', { method: 'POST' });
      await open(selected.id);
      void load().catch(() => undefined);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Não foi possível reenviar a mensagem.');
    } finally {
      setRetryingId('');
    }
  };
  const saveNote = async () => {
    if (!selected || !noteText.trim() || noteSending) return;
    setNoteSending(true);
    setNoteError('');
    try {
      await api('/api/operator/conversations/' + selected.id + '/notes', jsonInit('POST', { text: noteText.trim() }));
      setNoteText('');
      await open(selected.id);
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : 'Não foi possível salvar a nota.');
    } finally {
      setNoteSending(false);
    }
  };
  const openAttachment = async (attachment: Attachment) => {
    if (!selected || attachment.status !== 'stored') return;
    try {
      const result = await api<{ url: string }>('/api/operator/conversations/' + selected.id + '/attachments/' + attachment.id + '/url');
      setAttachmentUrls((current) => ({ ...current, [attachment.id]: result.url }));
      if (isImage(attachment)) setLightbox({ url: result.url, name: attachment.fileName, text: attachment.extractedText });
      else window.open(result.url, '_blank', 'noopener');
    } catch (error) {
      setBoardNotice(error instanceof Error ? error.message : 'Não foi possível abrir o anexo.');
    }
  };
  const fillTemplate = (t: string) =>
    t.replace('{nome}', (selected?.contactName || '').split(' ')[0] || 'tudo bem').replace('{operador}', name.split(' ')[0] || 'a equipe');

  /* ---------- ações operacionais e transferência ---------- */
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
        await api('/api/operator/conversations/' + selected.id + '/follow-up', jsonInit('POST', { followUpAt: date.toISOString() }));
      } else if (actionKind === 'ploomesManual') {
        await api('/api/operator/conversations/' + selected.id + '/commercial/manual-ploomes', jsonInit('POST', { ploomesId: value }));
      } else {
        await api('/api/operator/conversations/' + selected.id + '/technical/manual-service-order', jsonInit('POST', { serviceOrderNumber: value }));
      }
      setActionKind(null);
      setActionValue('');
      await load();
      await open(selected.id);
      setBoardNotice(actionKind === 'followup' ? 'Retorno agendado.' : 'Registro salvo.');
      if (actionKind === 'followup') {
        const conversationId = selected.id;
        offerUndo('Desfazer', async () => {
          await api('/api/operator/conversations/' + conversationId + '/follow-up', jsonInit('POST', { followUpAt: previousFollowUp }));
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
      await api('/api/operator/conversations/' + selected.id + '/commercial/sync-ploomes', { method: 'POST' });
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
      await api('/api/operator/conversations/' + selected.id + '/transfer-operator', jsonInit('POST', { operator: transferTo, reason: transferReason.trim() }));
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

  /* ---------- lote ---------- */
  const bulkItems = items.filter((c) => bulk.has(c.id));
  const bulkClaim = async () => {
    const claimable = bulkItems.filter((c) => !c.assignedOperator && c.state !== 'closed' && c.route !== 'commercial');
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
  const togglePick = (id: string, on: boolean) =>
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
  const saveView = (n: string) => {
    persistViews([...views, { name: n, tab, nav, group, filters: { ...filters } }]);
    setBoardNotice('Vista salva neste navegador.');
  };
  const applyView = (v: SavedView) => {
    setTab(v.tab as TabKey);
    setNav(v.nav);
    setGroup(v.group);
    setFilters({ ...v.filters });
  };

  /* ---------- teclado ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (closeOpen || actionKind || helpOpen || lightbox || transferOpen) {
        if (e.key === 'Escape' && !closing && !acting && !transferring) {
          setCloseOpen(false);
          setActionKind(null);
          setHelpOpen(false);
          setLightbox(null);
          setTransferOpen(false);
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
  }, [closeOpen, actionKind, helpOpen, lightbox, transferOpen, mobileOpen, closing, acting, transferring]);

  const onCardKey = (e: ReactKeyboardEvent<HTMLDivElement>, c: Conversation) => {
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const key = e.key.toLowerCase();
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openCard(c.id);
      return;
    }
    const column = el.closest<HTMLElement>('.col');
    const cards = column ? Array.from(column.querySelectorAll<HTMLElement>('.card')) : [];
    const idx = cards.indexOf(el);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (cards[idx + 1] || el).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (cards[idx - 1] || el).focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const cols = Array.from(document.querySelectorAll<HTMLElement>('.col'));
      const ci = column ? cols.indexOf(column) : -1;
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      for (let j = ci + dir; j >= 0 && j < cols.length; j += dir) {
        const cs = cols[j].querySelectorAll<HTMLElement>('.card');
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
  const onDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    setDraggingId(id);
  };
  const onDrop = (target: BoardColumn, e: DragEvent<HTMLElement>) => {
    const dragged = e.dataTransfer.getData('text/plain') || draggingId;
    const card = items.find((item) => item.id === dragged);
    setDropTarget(null);
    setDraggingId('');
    if (card) void moveToColumn(card, target);
  };

  /* foco preservado após reordenar o quadro */
  useEffect(() => {
    const id = focusIdRef.current;
    if (!id) return;
    const el = document.querySelector<HTMLElement>(`.card[data-id="${CSS.escape(id)}"]`);
    focusIdRef.current = null;
    if (el && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) el.focus();
  });

  /* ---------- derivados da conversa aberta ---------- */
  const selectedColumn = selected ? columnOf(selected) : null;

  /* ---------- renderização ---------- */
  if (!logged)
    return <Login email={email} password={password} notice={notice} busy={loginBusy} onEmail={setEmail} onPassword={setPassword} onSubmit={() => void login()} />;

  const title =
    nav === 'all' ? 'Fila de atendimento' : nav === 'commercial' ? 'Fila comercial' : nav === 'technical' ? 'Fila técnica' : 'Atendimentos concluídos';

  return (
    <div className="app">
      <Rail
        nav={nav}
        counts={navCounts}
        crmOpen={crmOpen}
        sound={sound}
        dark={dark}
        name={name}
        onNav={(k) => {
          setCrmOpen(false);
          setNav(k);
        }}
        onCrm={() => setCrmOpen(!crmOpen)}
        onSound={() => {
          setSound(!sound);
          if (!sound) beep();
        }}
        onHelp={() => setHelpOpen(true)}
        onTheme={() => setDark(dark === null ? !window.matchMedia('(prefers-color-scheme: dark)').matches : !dark)}
        onLogout={() => {
          sessionStorage.clear();
          location.reload();
        }}
      />

      {crmOpen ? (
        <CrmView
          conversations={items.map((c) => ({
            id: c.id,
            protocolId: c.protocolId || null,
            state: c.state,
            destinationArea: c.destinationArea || c.route || null,
            assignedOperator: c.assignedOperator || null,
            updatedAt: c.updatedAt,
            contactPhone: c.contactPhone,
          }))}
          onOpenConversation={(id) => {
            setCrmOpen(false);
            setNav('all');
            openCard(id);
          }}
        />
      ) : (
        <>
          <main className="mid">
            <Toolbar
              title={title}
              count={visible.length}
              tab={tab}
              tabCounts={tabCounts}
              onTab={setTab}
              query={query}
              onQuery={setQuery}
              searchRef={searchRef}
              filters={filters}
              chipCounts={chipCounts}
              onFilter={(k) => setFilters((f) => ({ ...f, [k]: !f[k] }))}
              group={group}
              onGroup={() => setGroup(!group)}
              views={views}
              onApplyView={applyView}
              onDeleteView={(i) => persistViews(views.filter((_, j) => j !== i))}
              onSaveView={saveView}
              fire={fire}
              nowMs={nowMs}
              onOpenCard={openCard}
              tipVisible={tipVisible}
              onTipDismiss={() => {
                setTipVisible(false);
                try {
                  localStorage.setItem(TIP_KEY, '1');
                } catch {
                  /* ignorar */
                }
              }}
              onTipLegend={() => {
                setTipVisible(false);
                try {
                  localStorage.setItem(TIP_KEY, '1');
                } catch {
                  /* ignorar */
                }
                setHelpOpen(true);
              }}
              onRefresh={refresh}
              bulkCount={bulk.size}
              onBulkClaim={() => void bulkClaim()}
              onBulkClose={bulkClose}
              onBulkClear={() => setBulk(new Set())}
            />
            {boardNotice && (
              <p className="tip" role="status" aria-live="polite" style={{ margin: '8px 16px 0' }}>
                <span>{boardNotice}</span>
                <span className="actions">
                  {undo && (
                    <button type="button" className="btn sm" onClick={() => void runUndo()}>
                      <Icon name="undo" className="sh" />
                      {undo.label}
                    </button>
                  )}
                  <button type="button" className="btn sm ghost" onClick={dismissNotice} aria-label="Fechar aviso">
                    ×
                  </button>
                </span>
              </p>
            )}
            <Board
              columns={columnsData}
              nowMs={nowMs}
              operatorName={name}
              selectedId={selected?.id || null}
              pickedIds={bulk}
              draggingId={draggingId}
              dropTarget={dropTarget}
              movingId={movingId}
              mobile={isMobile}
              mobileColumn={activeMobileColumn}
              group={group}
              more={more}
              filtering={anyFilter}
              hasPick={bulk.size > 0}
              onMobileColumn={setMobileColumn}
              onOpen={openCard}
              onTogglePick={togglePick}
              onKey={onCardKey}
              onDragStart={onDragStart}
              onDragEnd={() => {
                setDraggingId('');
                setDropTarget(null);
              }}
              onDragOver={setDropTarget}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={onDrop}
              onMore={(id, v) => setMore((m) => ({ ...m, [id]: v }))}
            />
          </main>

          <Workspace
            selected={selected}
            operatorName={name}
            role={role}
            nowMs={nowMs}
            mobileOpen={isMobile && mobileOpen && !!selected}
            history={history}
            attachmentUrls={attachmentUrls}
            retryingId={retryingId}
            movingId={movingId}
            threadRef={threadRef}
            canActOnSelected={canActOnSelected}
            isCommercialLead={isCommercialLead}
            selectedColumn={selectedColumn}
            onClose={() => setMobileOpen(false)}
            onClaim={() => void claim()}
            onRelease={() => void release()}
            onFinalize={() => openCloseDialog()}
            onReopen={() => void reopen()}
            onTransfer={openTransfer}
            onAction={(k) => {
              setActionValue('');
              setActionError('');
              setActionKind(k);
            }}
            onSyncPloomes={() => void syncPloomes()}
            onMove={(c, to) => void moveToColumn(c, to)}
            onRetry={(m) => void retryMessage(m)}
            onOpenAttachment={(a) => void openAttachment(a)}
            onLightbox={(a, url) => setLightbox({ url, name: a.fileName, text: a.extractedText })}
            composer={{
              role,
              canAct: canActOnSelected,
              isCommercialLead,
              text,
              onText: setText,
              onSend: () => void send(),
              sending,
              sendError,
              mode: composerMode,
              onMode: setComposerMode,
              notes: selected?.notes || [],
              noteText,
              onNoteText: (v) => {
                setNoteText(v);
                setNoteError('');
              },
              onSaveNote: () => void saveNote(),
              noteSending,
              noteError,
              templatesOpen,
              onTemplatesOpen: setTemplatesOpen,
              fillTemplate,
            }}
          />
        </>
      )}

      <CloseDialog
        open={closeOpen}
        targets={closeTargets}
        resolution={resolution}
        onResolution={(v) => {
          setResolution(v);
          if (closeError) setCloseError('');
        }}
        error={closeError}
        closing={closing}
        onCancel={() => !closing && setCloseOpen(false)}
        onConfirm={() => void closeConversations()}
      />
      <TransferDialog
        open={transferOpen}
        conversation={selected}
        candidates={transferCandidates}
        to={transferTo}
        onTo={(v) => {
          setTransferTo(v);
          setTransferError('');
        }}
        reason={transferReason}
        onReason={(v) => {
          setTransferReason(v);
          setTransferError('');
        }}
        error={transferError}
        busy={transferring}
        onCancel={() => setTransferOpen(false)}
        onConfirm={() => void doTransfer()}
      />
      <ActionDialog
        kind={actionKind}
        value={actionValue}
        onValue={(v) => {
          setActionValue(v);
          setActionError('');
        }}
        error={actionError}
        busy={acting}
        onCancel={() => setActionKind(null)}
        onConfirm={() => void runAction()}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Lightbox
        open={!!lightbox}
        url={lightbox?.url || ''}
        name={lightbox?.name || ''}
        text={lightbox?.text}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}

