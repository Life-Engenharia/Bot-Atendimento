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
const apiBase = '';
const auth = () => ({ Authorization: `Bearer ${sessionStorage.getItem('operatorToken') || ''}` });
async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(apiBase + path, {
    ...init,
    headers: { ...auth(), ...(init.headers || {}) },
  });
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
    [name, setName] = useState('');
  const [items, setItems] = useState<Conversation[]>([]),
    [selected, setSelected] = useState<Conversation | null>(null),
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
    [acting, setActing] = useState(false);
  const load = async () => {
    const rows = await api<Conversation[]>('/api/operator/conversations?includeClosed=true');
    setItems(rows);
    if (selected) {
      const current = rows.find((x: Conversation) => x.id === selected.id);
      if (current) setSelected(await api<Conversation>('/api/operator/conversations/' + current.id));
    }
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
      t = sessionStorage.getItem('operatorToken');
    if (n && t) {
      setName(n);
      load()
        .then(() => setLogged(true))
        .catch(() => {
          sessionStorage.clear();
          setNotice('Sua sessão expirou. Entre novamente.');
        });
    }
  }, []);
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
        (c) => c.state !== 'closed' && c.route === 'commercial' && !c.assignedOperator,
      ),
    ],
    [
      'Em atendimento',
      visible.filter((c) => c.state !== 'closed' && !!c.assignedOperator && !c.followUpAt),
    ],
    ['Retorno / atenção', visible.filter((c) => c.state !== 'closed' && !!c.followUpAt)],
    ['Concluídos', visible.filter((c) => c.state === 'closed')],
  ] as [string, Conversation[]][];
  const open = async (id: string) =>
    setSelected(await api<Conversation>('/api/operator/conversations/' + id));
  const claim = async () => {
    if (!selected) return;
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
    setResolution('');
    setCloseError('');
    setCloseDialogOpen(true);
  };
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
    if (!selected || !text.trim()) return;
    await api('/api/operator/conversations/' + selected.id + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    });
    setText('');
    await open(selected.id);
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
    window.open(result.url, '_blank', 'noopener');
  };
  if (!logged)
    return (
      <main className="login">
        <form className="login-card" action="/api/operator/login" method="post" onSubmit={login}>
          <img className="logo" src={apiBase + '/assets/life-logo.png'} alt="Life Engenharia" />
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
          <img src={apiBase + '/assets/life-logo.png'} alt="Life Engenharia" />
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
              <button type="button" className="btn alt" onClick={() => load()}>
                Atualizar fila
              </button>
            </div>
          </div>
        </header>
        <div className="board">
          {groups.map(([title, rows]) => (
            <section className="column" key={title}>
              <div className="column-head">
                <strong>{title}</strong>
                <span>{rows.length}</span>
              </div>
              {rows.length ? (
                rows.map((c) => (
                  <button
                    className={'case ' + (selected?.id === c.id ? 'selected' : '')}
                    key={c.id}
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
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty">Nenhum atendimento nesta etapa</div>
              )}
            </section>
          ))}
        </div>
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
                  Status<b>{selected.assignedOperator || 'Aguardando alguém assumir'}</b>
                </span>
                <span>
                  Área<b>{selected.destinationArea || selected.route || 'Atendimento'}</b>
                </span>
                {!selected.state || selected.state !== 'closed' ? <button
                  type="button"
                  className="btn"
                  onClick={claim}
                  disabled={selected.assignedOperator === name}
                >
                  {selected.assignedOperator === name
                    ? 'Em atendimento por você'
                    : 'Assumir atendimento'}
                </button> : null}
                {!selected.state || selected.state !== 'closed' ? <button
                  type="button"
                  className="btn alt"
                  onClick={release}
                  disabled={!selected.assignedOperator}
                >
                  Devolver à fila
                </button> : null}
                {selected.state !== 'closed' && <button type="button" className="btn danger" onClick={openCloseDialog}>
                  Finalizar atendimento
                </button>}
                {selected.state !== 'closed' && <div className="quick-actions">
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
                            .then(() => load())
                            .catch((e) => setNotice(e.message))
                        }
                      >
                        Incluir no Ploomes
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
                        Registro manual
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
                </div>}
              </div>
            </header>
            {!!selected.attachments?.length && (
              <div className="attachments" aria-label="Anexos da conversa">
                <strong>Anexos</strong>
                {selected.attachments.map((attachment) => (
                  <div className="attachment-wrap" key={attachment.id}>
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
                <button className="btn" onClick={reopen}>Reabrir atendimento</button>
              </div>
            ) : (
              <form className="composer" onSubmit={send}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Digite uma mensagem para enviar…"
                />
                <button className="btn">Enviar</button>
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
