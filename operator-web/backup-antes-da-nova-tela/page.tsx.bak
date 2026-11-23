'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

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
};
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
const boardColumnByTitle: Record<string, BoardColumn> = {
  Aguardando: 'waiting',
  Lead: 'lead',
  'Em atendimento': 'active',
  'Retorno / atenção': 'followup',
  Concluídos: 'closed',
};
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
    [query, setQuery] = useState(''),
    [text, setText] = useState(''),
    [closeDialogOpen, setCloseDialogOpen] = useState(false),
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
    [boardNotice, setBoardNotice] = useState('');
  const load = async () => {
    const rows = await api<Conversation[]>('/api/operator/conversations?includeClosed=true');
    setItems(rows);
    if (selected) {
      const current = rows.find((x: Conversation) => x.id === selected.id);
      if (current)
        setSelected(await api<Conversation>('/api/operator/conversations/' + current.id));
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
  }, []);
  useEffect(() => {
    let cancelled = false;
    const images = (selected?.attachments || []).filter(
      (attachment) => attachment.status === 'stored' && attachment.mediaType.startsWith('image/'),
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
      if (!cancelled) setAttachmentUrls(Object.fromEntries(entries.filter(Boolean) as Array<[string, string]>));
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.attachments]);
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
  const visible = useMemo(
    () =>
      items.filter((c) => {
        const hay = (c.contactName || '') + ' ' + c.contactPhone;
        const match = !query || hay.toLowerCase().includes(query.toLowerCase());
        const action = c.state !== 'closed' && (!c.assignedOperator || c.followUpAt);
        return match && (tab === 'all' || (tab === 'mine' ? c.assignedOperator === name : action));
      }),
    [items, query, tab, name],
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
        (c) => (c.state !== 'closed' || c.route === 'commercial') && c.route === 'commercial' && !c.assignedOperator,
      ),
    ],
    [
      'Em atendimento',
      visible.filter((c) => c.state !== 'closed' && !!c.assignedOperator && !c.followUpAt),
    ],
    ['Retorno / atenção', visible.filter((c) => c.state !== 'closed' && !!c.followUpAt)],
    ['Concluídos', visible.filter((c) => c.state === 'closed' && c.route !== 'commercial')],
  ] as [string, Conversation[]][];
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
  const moveToColumn = async (conversation: Conversation, target: BoardColumn) => {
    if (movingId) return;
    const isClosed = conversation.state === 'closed';
    const current: BoardColumn = isClosed
      ? 'closed'
      : conversation.followUpAt
        ? 'followup'
        : conversation.assignedOperator
          ? 'active'
          : conversation.route === 'commercial'
            ? 'lead'
            : 'waiting';
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
        setResolution('');
        setCloseError('');
        setCloseDialogOpen(true);
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
  const claim = async () => {
    if (!selected) return;
    if ((selected.destinationArea === 'commercial' || selected.route === 'commercial') && !selected.assignedOperator) {
      setBoardNotice('Leads comerciais são tratados diretamente pelo comercial.');
      return;
    }
    await api('/api/operator/conversations/' + selected.id + '/claim', { method: 'POST' });
    await load();
    await open(selected.id);
  };
  const release = async () => {
    if (!selected) return;
    await api('/api/operator/conversations/' + selected.id + '/release', { method: 'POST' });
    await load();
    await open(selected.id);
  };
  const openCloseDialog = () => {
    if (!selected || (!selected.assignedOperator && !['admin', 'coordination'].includes(role))) {
      setBoardNotice('Assuma o atendimento antes de encerrá-lo.');
      return;
    }
    setResolution('');
    setCloseError('');
    setCloseDialogOpen(true);
  };
  const canActOnSelected =
    !!selected &&
    (!!selected.assignedOperator && selected.assignedOperator === name ||
      ['admin', 'coordination'].includes(role));
  const isCommercialLead = !!selected && (selected.destinationArea === 'commercial' || selected.route === 'commercial') && !selected.assignedOperator;
  const close = async () => {
    if (!selected) return;
    if (resolution.trim().length < 3) {
      setCloseError('Descreva a resolução em pelo menos 3 caracteres.');
      return;
    }
    setClosing(true);
    setCloseError('');
    try {
      await api('/api/operator/conversations/' + selected.id + '/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionNote: resolution.trim() }),
      });
      setCloseDialogOpen(false);
      setResolution('');
      setSelected(null);
      setTab('all');
      await load();
      // `load` pode ainda enxergar a seleção anterior durante o mesmo ciclo
      // do React. Garanta que um atendimento recém-finalizado não seja
      // reaberto automaticamente no painel.
      setSelected(null);
    } catch (error) {
      setCloseError(
        error instanceof Error ? error.message : 'Não foi possível finalizar o atendimento.',
      );
    } finally {
      setClosing(false);
    }
  };
  const reopen = async () => {
    if (!selected) return;
    await api('/api/operator/conversations/' + selected.id + '/reopen', { method: 'POST' });
    await load();
    await open(selected.id);
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !text.trim() || sending) return;
    const message = text.trim();
    setSending(true);
    setSendError('');
    try {
      await api('/api/operator/conversations/' + selected.id + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });
      setText('');
      await open(selected.id);
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
      if (actionKind === 'followup') {
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
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível concluir a ação.');
    } finally {
      setActing(false);
    }
  };
  const openAttachment = async (attachment: Attachment) => {
    if (!selected || attachment.status !== 'stored') return;
    const result = await api<{ url: string }>(
      '/api/operator/conversations/' + selected.id + '/attachments/' + attachment.id + '/url',
    );
    setAttachmentUrls((current) => ({ ...current, [attachment.id]: result.url }));
    window.open(result.url, '_blank', 'noopener');
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
    <main className="app">
      <aside className="rail">
        <div className="brand">
          <img src="/life-logo.png" alt="Life Engenharia" />
          <div>
            <strong>Life Engenharia</strong>
            <small>Central de atendimento</small>
          </div>
        </div>
        <nav className="nav">
          <button className="active">Fila humana</button>
          <button>Comercial</button>
        </nav>
        <div className="account">
          <b>{name}</b>
          <span>Disponível para atender</span>
          <button
            onClick={() => {
              sessionStorage.clear();
              location.reload();
            }}
          >
            Sair da conta
          </button>
        </div>
      </aside>
      <section className="queue">
        <header className="queue-head">
          <p className="eyebrow">Minha operação</p>
          <h1>Fila humana ({visible.length})</h1>
          <div className="tabs">
            <button className={tab === 'action' ? 'active' : ''} onClick={() => setTab('action')}>
              Para agir
            </button>
            <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
              Minha fila
            </button>
            <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
              Todas
            </button>
          </div>
          <div className="filters">
            <input
              placeholder="Buscar cliente ou telefone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="toolbar">
              <button type="button" className="btn alt" onClick={refresh}>
                Atualizar fila
              </button>
            </div>
          </div>
        </header>
        <div className="board">
          {groups.map(([title, rows]) => (
            <section
              className={
                'column ' + (dropTarget === boardColumnByTitle[title] ? 'drop-target' : '')
              }
              key={title}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(boardColumnByTitle[title]);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                  setDropTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData('text/plain') || draggingId;
                const card = items.find((item) => item.id === id);
                setDropTarget(null);
                setDraggingId('');
                if (card) void moveToColumn(card, boardColumnByTitle[title]);
              }}
              aria-label={`${title}, ${rows.length} atendimentos. Solte um cartão aqui para mover.`}
            >
              <div className="column-head">
                <strong>{title}</strong>
                <span>{rows.length}</span>
              </div>
              {rows.length ? (
                rows.map((c) => (
                  <div className="case-wrap" key={c.id}>
                    <button
                      className={
                        'case ' +
                        (selected?.id === c.id ? 'selected ' : '') +
                        (draggingId === c.id ? 'dragging' : '')
                      }
                      draggable={!movingId}
                      aria-label={`${c.contactName || c.contactPhone}. Arraste para outra etapa ou use Mover para.`}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', c.id);
                        setDraggingId(c.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId('');
                        setDropTarget(null);
                      }}
                      onClick={() => open(c.id)}
                    >
                      <strong>{c.contactName || c.contactPhone}</strong>
                      <small>
                        {c.destinationArea || c.route || 'Atendimento'} · {c.contactPhone}
                      </small>
                      <div className="badges">
                        {c.suggestedPriority && (
                          <span className={'badge ' + c.suggestedPriority.toLowerCase()}>
                            {c.suggestedPriority}
                          </span>
                        )}
                        {c.followUpAt && <span className="badge due">Retorno</span>}
                        {movingId === c.id && <span className="badge moving">Movendo…</span>}
                      </div>
                    </button>
                    <label className="case-move-label">
                      <span className="sr-only">Mover {c.contactName || c.contactPhone} para</span>
                      <select
                        className="case-move"
                        value=""
                        disabled={movingId === c.id}
                        onChange={(event) => {
                          const target = event.target.value as BoardColumn;
                          event.target.value = '';
                          if (target) void moveToColumn(c, target);
                        }}
                      >
                        <option value="">Mover para…</option>
                        {groups.map(([destination]) => (
                          <option key={destination} value={boardColumnByTitle[destination]}>
                            {destination}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))
              ) : (
                <div className="empty">Nenhum atendimento nesta etapa</div>
              )}
            </section>
          ))}
        </div>
        {boardNotice && (
          <p className="board-notice" role="status" aria-live="polite">
            {boardNotice}
            <button type="button" onClick={() => setBoardNotice('')} aria-label="Fechar aviso">
              ×
            </button>
          </p>
        )}
      </section>
      <section className="workspace">
        {selected ? (
          <>
            {/** Conversas concluídas são somente leitura até o cliente reabrir. */}
            <header className="workspace-head">
              <p className="eyebrow">Atendimento selecionado</p>
              <h2>{selected.contactName || selected.contactPhone}</h2>
              <div className="context">
                <span>
                  Status<b>{isCommercialLead ? 'Lead recebido pelo comercial' : selected.assignedOperator || 'Aguardando alguém assumir'}</b>
                </span>
                <span>
                  Área<b>{selected.destinationArea || selected.route || 'Atendimento'}</b>
                </span>
                {!selected.state || selected.state !== 'closed' ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={claim}
                    disabled={selected.assignedOperator === name || isCommercialLead}
                  >
                    {selected.assignedOperator === name
                      ? 'Em atendimento por você'
                      : isCommercialLead
                        ? 'Lead comercial — sem assumir'
                      : 'Assumir atendimento'}
                  </button>
                ) : null}
                {!isCommercialLead && (!selected.state || selected.state !== 'closed') ? (
                  <button
                    type="button"
                    className="btn alt"
                    onClick={release}
                    disabled={!selected.assignedOperator}
                  >
                    Devolver à fila
                  </button>
                ) : null}
                {!isCommercialLead && selected.state !== 'closed' && (
                  <button
                    type="button"
                    className="btn danger"
                    onClick={openCloseDialog}
                    disabled={!canActOnSelected}
                    title={!canActOnSelected ? 'Assuma o atendimento antes de encerrá-lo.' : undefined}
                  >
                    Finalizar atendimento
                  </button>
                )}
                {(isCommercialLead || selected.state !== 'closed') && (
                  <div className="quick-actions">
                    {!isCommercialLead && <button
                      type="button"
                      className="action-link"
                      onClick={() => {
                        setActionValue('');
                        setActionError('');
                        setActionKind('followup');
                      }}
                    >
                      Agendar retorno
                    </button>}
                    {selected.destinationArea === 'commercial' && (
                      <>
                        <button
                          type="button"
                          className="action-link"
                          onClick={() =>
                            api(
                              '/api/operator/conversations/' +
                              selected.id +
                              '/commercial/sync-ploomes',
                              { method: 'POST' },
                            )
                              .then(refresh)
                              .catch((e) => setNotice(e.message))
                          }
                        >
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
                  </div>
                )}
              </div>
            </header>
            {!!selected.attachments?.length && (
              <div className="attachments" aria-label="Anexos da conversa">
                <strong>Anexos</strong>
                {selected.attachments.map((attachment) => (
                  <div className="attachment-wrap" key={attachment.id}>
                    {attachmentUrls[attachment.id] && attachment.mediaType.startsWith('image/') && (
                      <img
                        className="attachment-preview"
                        src={attachmentUrls[attachment.id]}
                        alt={attachment.fileName}
                        onClick={() => window.open(attachmentUrls[attachment.id], '_blank', 'noopener')}
                      />
                    )}
                    <button
                      type="button"
                      className="attachment"
                      disabled={attachment.status !== 'stored'}
                      onClick={() => openAttachment(attachment)}
                    >
                      {attachment.fileName}
                      <small>{attachment.status === 'stored' ? 'Abrir' : attachment.status}</small>
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
            <div className="messages">
              {(selected.messages || []).map((m) => (
                <div className={'message ' + (m.direction !== 'inbound' ? 'out' : '')} key={m.id}>
                  <span className="author">
                    {m.direction === 'inbound'
                      ? 'Cliente'
                      : m.content.startsWith(name + ':')
                        ? 'Você'
                        : 'Bot Life'}
                  </span>
                  {m.content}
                  <small>
                    {new Date(m.receivedAt).toLocaleString('pt-BR')}
                    {m.direction === 'outbound' && m.deliveryStatus ? ` · ${m.deliveryStatus}` : ''}
                  </small>
                </div>
              ))}
            </div>
            {selected.state === 'closed' ? (
              <div className="closed-notice">
                <span>Atendimento concluído. O histórico está preservado.</span>
                <button className="btn" onClick={reopen}>
                  Reabrir atendimento
                </button>
              </div>
            ) : (
              <form className="composer" onSubmit={send}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={isCommercialLead ? 'Lead tratado diretamente pelo comercial.' : canActOnSelected ? 'Digite uma mensagem para enviar…' : 'Assuma o atendimento para responder…'}
                  disabled={sending || !canActOnSelected}
                />
                <button className="btn" disabled={sending || !text.trim() || !canActOnSelected}>
                  {sending ? 'Enviando…' : 'Enviar'}
                </button>
                {sendError && <small className="form-error">{sendError}</small>}
              </form>
            )}
          </>
        ) : (
          <div className="empty-workspace">
            <p className="eyebrow">Fila organizada</p>
            <h2>Nenhum atendimento selecionado</h2>
            <p>Escolha um caso à esquerda para começar.</p>
          </div>
        )}
      </section>
      {closeDialogOpen && (
        <div
          className="modal-backdrop"
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
              Informe brevemente como a solicitação foi resolvida antes de finalizar o atendimento.
            </p>
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
                {closing ? 'Finalizando…' : 'Finalizar atendimento'}
              </button>
            </div>
          </section>
        </div>
      )}
      {actionKind && (
        <div
          className="modal-backdrop"
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
    </main>
  );
}
