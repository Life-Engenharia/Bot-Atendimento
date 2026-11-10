'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Modal } from './Dialogs';
import { api } from '@/lib/api';

type Contact = {
  id: number;
  name: string;
  legalName: string | null;
  type: 'company' | 'person';
  email: string | null;
  phone: string | null;
  document: string | null;
  createdAt: string | null;
};
type Deal = {
  id: number;
  title: string;
  amount: number;
  stage: string | null;
  status: 'open' | 'won' | 'lost' | 'unknown';
  contactId: number | null;
  contactName: string | null;
};
type Funnel = { stage: string; count: number; amount: number };
type DupGroup = { reason: 'document' | 'phone' | 'email' | 'name'; key: string; contacts: Contact[] };
type LocalConversation = {
  id: string;
  protocolId: string | null;
  state: string;
  destinationArea: string | null;
  assignedOperator: string | null;
  updatedAt: string;
  contactPhone: string;
};
type Tab = 'cli' | 'opp' | 'funnel';
type FilterKey = 'all' | 'company' | 'person' | 'miss';
type SortKey = 'name' | 'new' | 'complete';

const DUP_LABEL: Record<DupGroup['reason'], string> = {
  document: 'Mesmo CPF/CNPJ',
  phone: 'Mesmo telefone',
  email: 'Mesmo e-mail',
  name: 'Mesmo nome',
};
const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no']);
const KEEP_UPPER = new Set(['SPDA', 'LTDA', 'ME', 'EPP', 'SA', 'S/A', 'TI', 'RH']);

/** "SR. AARON - TÉC. DE PLANEJAMENTO" → { name: "Aaron", role: "Téc. de Planejamento" } */
function prettyName(raw: string): { name: string; role: string } {
  const title = (t: string) =>
    t
      .toLocaleLowerCase('pt-BR')
      .split(' ')
      .map((w, i) => {
        if (KEEP_UPPER.has(w.toUpperCase())) return w.toUpperCase();
        if (i && SMALL.has(w)) return w;
        return w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1);
      })
      .join(' ');
  const isShout = raw === raw.toLocaleUpperCase('pt-BR') && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(raw);
  const fix = (t: string) => (isShout ? title(t) : t);
  const base = raw.replace(/^(sr|sra)\.?\s+/i, '');
  const parts = base.split(' - ');
  if (parts.length > 1) return { name: fix(parts[0].trim()), role: fix(parts.slice(1).join(' - ').trim()) };
  return { name: fix(base.trim()), role: '' };
}

const initials = (n: string) =>
  n
    .split(' ')
    .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
const money = (v: number) => (v ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : '');
const fmtDoc = (d: string | null) =>
  !d ? '' : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d;
const incomplete = (c: Contact) => !c.phone && !c.email && !c.document;
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
const digits = (value: string | null) => (value || '').replace(/\D/g, '');

function fromPloomesContact(raw: Record<string, unknown>): Contact {
  const document = String(raw.CNPJ || raw.Register || raw.CPF || '') || null;
  const legalName = String(raw.LegalName || raw.CompanyName || '') || null;
  return {
    id: Number(raw.Id) || 0,
    name: String(raw.Name || legalName || 'Cadastro sem nome'),
    legalName,
    type: legalName || digits(document).length === 14 ? 'company' : 'person',
    email: String(raw.Email || raw.Email2 || '') || null,
    phone: String(raw.Phone || raw.PhoneNumber || '') || null,
    document,
    createdAt: String(raw.CreateDate || raw.CreatedAt || '') || null,
  };
}

function fromPloomesDeal(raw: Record<string, unknown>): Deal {
  const stage = raw.Stage && typeof raw.Stage === 'object' ? (raw.Stage as { Name?: string }).Name : undefined;
  const status = raw.Status && typeof raw.Status === 'object' ? (raw.Status as { Name?: string }).Name : raw.Status;
  const statusText = String(status || '').toLocaleLowerCase('pt-BR');
  return {
    id: Number(raw.Id) || 0,
    title: String(raw.Title || raw.Name || 'Oportunidade sem título'),
    amount: Number(raw.Amount) || 0,
    stage: String(stage || raw.StageName || '') || null,
    status: /ganh|won|conclu|fechad/.test(statusText) ? 'won' : /perd|lost|cancel/.test(statusText) ? 'lost' : statusText ? 'open' : 'unknown',
    contactId: Number(raw.ContactId || (raw.Contact as { Id?: number } | undefined)?.Id) || null,
    contactName: String((raw.Contact as { Name?: string } | undefined)?.Name || raw.ContactName || '') || null,
  };
}

export default function CrmView({
  onOpenConversation,
  conversations,
}: {
  onOpenConversation: (id: string) => void;
  conversations: LocalConversation[];
}) {
  const [tab, setTab] = useState<Tab>('cli');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [funnel, setFunnel] = useState<Funnel[]>([]);
  const [dealsError, setDealsError] = useState('');
  const [sel, setSel] = useState<Contact | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [local, setLocal] = useState<LocalConversation[] | null>(null);
  const [dupsOpen, setDupsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);
  const reqId = useRef(0);

  const say = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const loadContacts = useCallback(async (search: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError('');
    try {
      const r = await api<{ contacts?: Record<string, unknown>[] }>(
        `/api/operator/crm/contacts${search.length >= 2 ? '?q=' + encodeURIComponent(search) : ''}`,
      );
      if (id !== reqId.current) return;
      setContacts((r.contacts || []).map(fromPloomesContact));
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : 'Não foi possível carregar os clientes.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts(debounced);
  }, [debounced, loadContacts]);

  const loadDeals = useCallback(async () => {
    setDealsError('');
    try {
      const r = await api<{ connected?: boolean; reason?: string; overview?: { deals?: Record<string, unknown>[] } }>(
        '/api/operator/crm/overview',
      );
      if (!r.connected) {
        setDeals([]);
        setFunnel([]);
        setDealsError(r.reason || 'O Ploomes não retornou as oportunidades.');
        return;
      }
      const mapped = (r.overview?.deals || []).map(fromPloomesDeal);
      setDeals(mapped);
      const stages = new Map<string, Funnel>();
      mapped
        .filter((deal) => deal.status === 'open')
        .forEach((deal) => {
          const stage = deal.stage || 'Sem etapa';
          const current = stages.get(stage) || { stage, count: 0, amount: 0 };
          current.count += 1;
          current.amount += deal.amount;
          stages.set(stage, current);
        });
      setFunnel([...stages.values()].sort((a, b) => b.count - a.count));
    } catch (e) {
      setDealsError(e instanceof Error ? e.message : 'Não foi possível carregar as oportunidades.');
    }
  }, []);
  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  const refresh = () => {
    void loadContacts(debounced);
    void loadDeals();
    say('Dados atualizados.');
  };

  const openDetail = (c: Contact) => {
    setSel(c);
    setDetailOpen(true);
    const phone = digits(c.phone);
    setLocal(phone ? conversations.filter((item) => digits(item.contactPhone) === phone) : []);
  };

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, DupGroup>();
    contacts.forEach((contact) => {
      const keys: Array<[DupGroup['reason'], string]> = [
        ['document', digits(contact.document)],
        ['phone', digits(contact.phone)],
        ['email', (contact.email || '').trim().toLocaleLowerCase('pt-BR')],
        ['name', norm(contact.name).trim()],
      ];
      keys.forEach(([reason, key]) => {
        if (!key) return;
        const groupKey = `${reason}:${key}`;
        const group = groups.get(groupKey) || { reason, key, contacts: [] };
        group.contacts.push(contact);
        groups.set(groupKey, group);
      });
    });
    return [...groups.values()].filter((group) => group.contacts.length > 1);
  }, [contacts]);

  const shown = useMemo(() => {
    const r = contacts.filter(
      (c) => filter === 'all' || (filter === 'company' && c.type === 'company') || (filter === 'person' && c.type === 'person') || (filter === 'miss' && incomplete(c)),
    );
    return [...r].sort((a, b) =>
      sort === 'name' ? norm(a.name).localeCompare(norm(b.name), 'pt') : sort === 'new' ? b.id - a.id : Number(incomplete(a)) - Number(incomplete(b)),
    );
  }, [contacts, filter, sort]);

  const openDeals = deals.filter((d) => d.status === 'open');
  const openValue = openDeals.reduce((s, d) => s + d.amount, 0);
  const missing = contacts.filter(incomplete).length;
  const dealsOf = (c: Contact) => deals.filter((d) => d.contactId === c.id);
  const filteredDeals = deals.filter((d) => !debounced || norm(d.title + ' ' + (d.stage || '') + ' ' + (d.contactName || '')).includes(norm(debounced)));

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') || '').trim();
    const phone = String(f.get('phone') || '').trim();
    const email = String(f.get('email') || '').trim();
    const document = String(f.get('document') || '').replace(/\D/g, '');
    const pd = phone.replace(/\D/g, '');
    if (name.length < 2) return setFormError('Informe o nome ou a empresa.');
    if (phone && (pd.length < 10 || pd.length > 13)) return setFormError('Informe o telefone com DDD.');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return setFormError('E-mail inválido.');
    if (document && ![11, 14].includes(document.length)) return setFormError('CPF tem 11 dígitos e CNPJ tem 14.');
    setSaving(true);
    setFormError('');
    try {
      const r = await api<{ contact: Record<string, unknown> }>('/api/operator/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          company: String(f.get('company') || '').trim() || undefined,
          phone: phone || undefined,
          email: email || undefined,
          document: document || undefined,
        }),
      });
      setNewOpen(false);
      setQ('');
      await loadContacts('');
      openDetail(fromPloomesContact(r.contact));
      say('Cliente cadastrado no Ploomes.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível cadastrar.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement | null)?.tagName || '');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const row = (c: Contact) => {
    const p = prettyName(c.name);
    const sub = p.role || [c.phone, c.email].filter(Boolean).join(' · ') || 'Sem telefone ou e-mail';
    return (
      <button type="button" key={c.id} className={'row-c' + (sel?.id === c.id ? ' sel' : '')} onClick={() => openDetail(c)}>
        <span className={'av2 ' + (c.type === 'company' ? 'co' : 'pe')} aria-hidden="true">
          {initials(p.name)}
        </span>
        <span className="mn">
          <b>{p.name}</b>
          <small>{sub}</small>
        </span>
        {incomplete(c) ? <span className="pill warn">Sem contato</span> : <span className="pill">{c.type === 'company' ? 'Empresa' : 'Pessoa'}</span>}
      </button>
    );
  };

  const dealRow = (d: Deal) => (
    <div className="row-c" key={d.id}>
      <span className="av2 co" aria-hidden="true">
        {initials(d.title)}
      </span>
      <span className="mn">
        <b>{d.title}</b>
        <small>
          {d.contactName ? d.contactName + ' · ' : ''}Ploomes #{d.id}
        </small>
      </span>
      {d.stage ? <span className={'pill ' + (d.status === 'won' ? 'ok' : d.status === 'lost' ? 'warn' : 'st')}>{d.stage}</span> : <span className="pill warn">Sem etapa</span>}
      <span className={'val' + (d.amount ? '' : ' none')}>{d.amount ? money(d.amount) : '—'}</span>
    </div>
  );

  const detail = sel ? (
    <DetailPanel
      contact={sel}
      deals={dealsOf(sel)}
      local={local}
      onOpenConversation={onOpenConversation}
      onBack={() => setDetailOpen(false)}
      onCopied={() => say('ID copiado.')}
    />
  ) : (
    <div className="crm-empty">
      <b>Selecione um cliente</b>
      Veja contato, documento, atendimentos e oportunidades.
    </div>
  );

  return (
    <section className="crm" aria-label="Clientes e oportunidades">
      <div className="crm-top">
        <div className="crm-h">
          <div>
            <h1>Clientes e oportunidades</h1>
            <div className="sub">Ploomes · até 100 clientes mais recentes por consulta</div>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={refresh}>
              <Icon name="refresh" className="sh" />
              Atualizar dados
            </button>
            <button type="button" className="btn pri" onClick={() => { setFormError(''); setNewOpen(true); }}>
              <Icon name="plus" className="sh" />
              Cadastrar cliente
            </button>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span>Clientes nesta consulta</span>
            <b>{contacts.length}</b>
          </div>
          <div className="kpi">
            <span>Oportunidades abertas</span>
            <b>{openDeals.length}</b>
          </div>
          <div className="kpi">
            <span>Valor em aberto</span>
            <b>{money(openValue) || 'R$ 0'}</b>
          </div>
          <div className={'kpi' + (missing ? ' warn' : '')}>
            <span>Sem contato (na lista)</span>
            <b>{missing}</b>
            {missing > 0 && (
              <button type="button" onClick={() => { setTab('cli'); setFilter('miss'); }}>
                ver
              </button>
            )}
          </div>
        </div>
        <div className="crm-tools">
          <div className="searchw">
            <label className="sr" htmlFor="cq">
              Buscar
            </label>
            <Icon name="search" className="si" />
            <input id="cq" ref={searchRef} className="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome, empresa, CPF/CNPJ ou e-mail" />
            <span className="kbd" aria-hidden="true">/</span>
          </div>
          {tab === 'cli' && (
            <>
              <select aria-label="Filtro" value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}>
                <option value="all">Todos</option>
                <option value="company">Empresas</option>
                <option value="person">Pessoas</option>
                <option value="miss">Sem contato</option>
              </select>
              <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="name">Nome A–Z</option>
                <option value="new">Mais recentes</option>
                <option value="complete">Completos primeiro</option>
              </select>
            </>
          )}
          <button type="button" className="btn" onClick={() => setDupsOpen(true)}>
            Possíveis duplicados
          </button>
        </div>
      </div>

      <div className={'crm-body'}>
        <div className="crm-main">
          <div className="seg" role="tablist" aria-label="Lista">
            {([['cli', 'Clientes'], ['opp', 'Oportunidades'], ['funnel', 'Funil']] as [Tab, string][]).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="crm-list" aria-live="polite">
            {tab === 'cli' &&
              (loading ? (
                Array.from({ length: 6 }, (_, i) => <div className="skel" key={i} />)
              ) : error ? (
                <div className="crm-empty">
                  <b>Não foi possível carregar</b>
                  {error}
                  <div>
                    <button type="button" className="btn" onClick={() => void loadContacts(debounced)}>Tentar de novo</button>
                  </div>
                </div>
              ) : shown.length === 0 ? (
                <div className="crm-empty">
                  <b>Nada encontrado</b>
                  {debounced ? `Nenhum resultado para “${debounced}”.` : 'Nenhum cliente neste filtro.'}
                  {(debounced || filter !== 'all') && (
                    <div>
                      <button type="button" className="btn" onClick={() => { setQ(''); setFilter('all'); }}>Limpar busca e filtros</button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <small className="sub">Mostrando {shown.length} de {contacts.length} registros retornados pelo Ploomes.</small>
                  {shown.map(row)}
                </>
              ))}
            {tab === 'opp' &&
              (dealsError ? (
                <div className="crm-empty">
                  <b>Não foi possível carregar</b>
                  {dealsError}
                  <div>
                    <button type="button" className="btn" onClick={() => void loadDeals()}>Tentar de novo</button>
                  </div>
                </div>
              ) : filteredDeals.length === 0 ? (
                <div className="crm-empty">
                  <b>Nenhuma oportunidade</b>
                  Nada encontrado para esta busca.
                </div>
              ) : (
                filteredDeals.map(dealRow)
              ))}
            {tab === 'funnel' &&
              (dealsError ? (
                <div className="crm-empty">
                  <b>Não foi possível carregar</b>
                  {dealsError}
                </div>
              ) : funnel.length === 0 ? (
                <div className="crm-empty">
                  <b>Funil vazio</b>
                  Não há oportunidades abertas entre as recentes.
                </div>
              ) : (
                funnel.map((s) => (
                  <section key={s.stage} className="det-sec">
                    <h3>
                      {s.stage} · {s.count}
                    </h3>
                    <small className="sub">{money(s.amount) || 'Sem valor informado'}</small>
                    {openDeals
                      .filter((d) => (d.stage || 'Sem etapa') === s.stage)
                      .slice(0, 8)
                      .map((d) => (
                        <div key={d.id} className="opp">
                          <span>
                            <b>{d.title}</b>
                            <small>
                              {d.contactName || '—'} · {d.amount ? money(d.amount) : 'sem valor'}
                            </small>
                          </span>
                        </div>
                      ))}
                  </section>
                ))
              ))}
          </div>
        </div>
        {tab === 'cli' && (
          <aside className={'crm-det' + (detailOpen ? ' open' : '')} aria-label="Detalhes do cliente">
            {detail}
          </aside>
        )}
      </div>

      <Modal open={dupsOpen} onClose={() => setDupsOpen(false)} label="Possíveis duplicados">
        <div className="sub">Qualidade do cadastro</div>
        <h3>Possíveis duplicados</h3>
        <p className="sub">Conferimos os registros carregados por CPF/CNPJ, telefone, e-mail e nome. Nada é alterado no Ploomes.</p>
        {duplicateGroups.length === 0 ? (
          <p className="sub">Nenhum cadastro repetido encontrado entre os registros carregados.</p>
        ) : (
          duplicateGroups.map((g, i) => (
            <div key={i} className="det-sec">
              <b>{DUP_LABEL[g.reason]}</b>
              {g.contacts.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className="row-c"
                  onClick={() => {
                    setDupsOpen(false);
                    setTab('cli');
                    setFilter('all');
                    openDetail(c);
                  }}
                >
                  <span className="mn">
                    <b>{prettyName(c.name).name}</b>
                    <small>#{c.id} · {c.phone || c.email || 'sem contato'}</small>
                  </span>
                  <span>Ver</span>
                </button>
              ))}
            </div>
          ))
        )}
        <div className="row">
          <button type="button" className="btn" onClick={() => setDupsOpen(false)}>Fechar</button>
        </div>
      </Modal>

      <Modal open={newOpen} onClose={() => !saving && setNewOpen(false)} label="Cadastrar cliente">
        <form method="dialog" onSubmit={create} noValidate>
          <div className="sub">Ploomes</div>
          <h3>Cadastrar cliente</h3>
          <label className="fld">
            Nome ou empresa *
            <input name="name" autoFocus autoComplete="off" disabled={saving} />
          </label>
          <label className="fld">
            Razão social / empresa
            <input name="company" autoComplete="organization" disabled={saving} />
          </label>
          <label className="fld">
            Telefone (WhatsApp)
            <input name="phone" inputMode="tel" placeholder="(79) 99999-0000" disabled={saving} />
          </label>
          <label className="fld">
            E-mail
            <input name="email" type="email" disabled={saving} />
          </label>
          <label className="fld">
            CPF ou CNPJ
            <input name="document" inputMode="numeric" disabled={saving} />
          </label>
          <div className="err" role="alert">{formError}</div>
          <div className="row">
            <button type="button" className="btn" onClick={() => setNewOpen(false)} disabled={saving}>Cancelar</button>
            <button className="btn pri" disabled={saving}>{saving ? 'Cadastrando…' : 'Cadastrar'}</button>
          </div>
        </form>
      </Modal>

      {toast && (
        <div className="toast2" role="status">
          {toast}
        </div>
      )}
    </section>
  );
}

function DetailPanel({
  contact: sel,
  deals,
  local,
  onOpenConversation,
  onBack,
  onCopied,
}: {
  contact: Contact;
  deals: Deal[];
  local: LocalConversation[] | null;
  onOpenConversation: (id: string) => void;
  onBack: () => void;
  onCopied: () => void;
}) {
  const p = prettyName(sel.name);
  const field = (label: string, v: string | null) => (
    <>
      <dt>{label}</dt>
      <dd>{v || <span className="none">Não informado</span>}</dd>
    </>
  );
  return (
    <>
      <button type="button" className="btn crm-back" onClick={onBack}>
        ← Voltar
      </button>
      <div className="crm-h" style={{ alignItems: 'center' }}>
        <span className={'av2 ' + (sel.type === 'company' ? 'co' : 'pe')} style={{ width: 48, height: 48 }} aria-hidden="true">
          {initials(p.name)}
        </span>
        <div>
          <h2>{p.name}</h2>
          <div className="sub">{p.role || sel.legalName || (sel.type === 'company' ? 'Empresa' : 'Pessoa')}</div>
        </div>
      </div>
      {incomplete(sel) && <span className="pill warn">Cadastro sem telefone, e-mail ou documento</span>}
      <dl className="dl">
        {field('Telefone', sel.phone)}
        {field('E-mail', sel.email)}
        {field('CPF / CNPJ', fmtDoc(sel.document) || null)}
        <dt>Ploomes ID</dt>
        <dd>
          {sel.id}
          <button type="button" className="copy" onClick={() => { void navigator.clipboard?.writeText(String(sel.id)); onCopied(); }}>
            copiar
          </button>
        </dd>
      </dl>
      <section className="det-sec">
        <h3>Atendimentos no WhatsApp</h3>
        {local === null ? (
          <small className="none">Procurando…</small>
        ) : local.length === 0 ? (
          <small className="none">{sel.phone ? 'Nenhum atendimento encontrado para este telefone.' : 'Sem telefone para procurar atendimentos.'}</small>
        ) : (
          local.map((c) => (
            <button type="button" key={c.id} className="row-c" onClick={() => onOpenConversation(c.id)}>
              <span className="mn">
                <b>{c.protocolId || 'Sem protocolo'}</b>
                <small>
                  {c.state === 'closed' ? 'Concluído' : c.assignedOperator ? 'Com ' + c.assignedOperator : 'Aguardando'} · {new Date(c.updatedAt).toLocaleDateString('pt-BR')}
                </small>
              </span>
              <span aria-hidden="true">Abrir →</span>
            </button>
          ))
        )}
      </section>
      <section className="det-sec">
        <h3>Oportunidades ({deals.length})</h3>
        {deals.length === 0 ? (
          <small className="none">Nenhuma oportunidade vinculada entre as recentes.</small>
        ) : (
          deals.map((d) => (
            <div className="opp" key={d.id}>
              <span>
                <b>{d.title}</b>
                <small>{d.stage || 'Sem etapa'}</small>
              </span>
              <span className={'val' + (d.amount ? '' : ' none')}>{d.amount ? money(d.amount) : '—'}</span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
