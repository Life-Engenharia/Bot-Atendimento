'use client';

import { RefObject, useState } from 'react';
import { Conversation, Filters, SavedView, TabKey, fmtWait, minutesSince, priorityOf } from '@/lib/domain';
import { Icon } from './Icon';

export type ToolbarProps = {
  title: string;
  count: number;
  tab: TabKey;
  tabCounts: Record<TabKey, number>;
  onTab: (t: TabKey) => void;
  query: string;
  onQuery: (v: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  filters: Filters;
  chipCounts: { unassigned: number; urgent: number; due: number };
  onFilter: (k: keyof Filters) => void;
  group: boolean;
  onGroup: () => void;
  views: SavedView[];
  onApplyView: (v: SavedView) => void;
  onDeleteView: (i: number) => void;
  onSaveView: (name: string) => void;
  fire: Conversation[];
  nowMs: number;
  onOpenCard: (id: string) => void;
  tipVisible: boolean;
  onTipDismiss: () => void;
  onTipLegend: () => void;
  onRefresh: () => void;
  bulkCount: number;
  onBulkClaim: () => void;
  onBulkClose: () => void;
  onBulkClear: () => void;
};

const TABS: [TabKey, string, 'zap' | 'user' | 'list'][] = [
  ['action', 'Para agir', 'zap'],
  ['mine', 'Minha fila', 'user'],
  ['all', 'Todas', 'list'],
];

export function Toolbar(p: ToolbarProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const commit = () => {
    const n = name.trim();
    if (!n) return;
    p.onSaveView(n);
    setName('');
    setSaving(false);
  };
  return (
    <header className="top">
      <div className="th">
        <div>
          <h1>
            {p.title} <span className="sub">({p.count})</span>
          </h1>
          <div className="sub">WhatsApp · triagem comercial e técnica · ▲ P1 é o mais urgente</div>
        </div>
        <button type="button" className="btn" onClick={p.onRefresh}>
          <Icon name="refresh" className="sh" />
          Atualizar
        </button>
      </div>

      {p.tipVisible && (
        <div className="tip">
          <span>
            <Icon name="bulb" className="sh" />
            Primeira vez aqui? Veja o que significam as prioridades, as colunas e os atalhos.
          </span>
          <span className="actions">
            <button type="button" className="btn sm pri" onClick={p.onTipLegend}>
              Abrir legenda
            </button>
            <button type="button" className="btn sm ghost" onClick={p.onTipDismiss}>
              Dispensar
            </button>
          </span>
        </div>
      )}

      {p.fire.length > 0 && (
        <div className="fire" role="status">
          <Icon name="flame" className="sh" />
          <strong>
            {p.fire.length} urgente{p.fire.length > 1 ? 's' : ''} fora do prazo
          </strong>
          {p.fire.slice(0, 3).map((c) => (
            <button key={c.id} type="button" onClick={() => p.onOpenCard(c.id)}>
              {priorityOf(c)?.symbol} {c.contactName || c.contactPhone} ·{' '}
              {c.followUpAt ? 'retorno vencido' : fmtWait(minutesSince(c.updatedAt, p.nowMs))}
            </button>
          ))}
          {p.fire.length > 3 && <span>+{p.fire.length - 3}</span>}
        </div>
      )}

      <div className="toolbar">
        <div className="tabs" role="group" aria-label="Visão da fila">
          {TABS.map(([key, label, icon]) => (
            <button key={key} type="button" className={p.tab === key ? 'on' : ''} aria-pressed={p.tab === key} onClick={() => p.onTab(key)}>
              <Icon name={icon} className="sh" />
              {label}
              <span className="n">{p.tabCounts[key]}</span>
            </button>
          ))}
        </div>
        <div className="searchw">
          <label className="sr" htmlFor="q">
            Buscar cliente, telefone ou protocolo
          </label>
          <Icon name="search" className="si" />
          <input
            id="q"
            ref={p.searchRef}
            className="search"
            type="search"
            placeholder="Buscar por nome, telefone ou protocolo"
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
          />
          <span className="kbd" aria-hidden="true">
            /
          </span>
        </div>
      </div>

      <div className="chips" role="group" aria-label="Filtros rápidos">
        <button type="button" className="chip" aria-pressed={p.filters.unassigned} onClick={() => p.onFilter('unassigned')}>
          <Icon name="userx" className="sh" />
          Sem responsável <b>{p.chipCounts.unassigned}</b>
        </button>
        <button type="button" className="chip" aria-pressed={p.filters.urgent} onClick={() => p.onFilter('urgent')}>
          <Icon name="flame" className="sh" />
          P1 e P2 <b>{p.chipCounts.urgent}</b>
        </button>
        <button type="button" className={'chip' + (p.chipCounts.due ? ' alert' : '')} aria-pressed={p.filters.due} onClick={() => p.onFilter('due')}>
          <Icon name="clock" className="sh" />
          Prazo vencido <b>{p.chipCounts.due}</b>
        </button>
        <button type="button" className="chip" aria-pressed={p.group} onClick={p.onGroup}>
          <Icon name="layers" className="sh" />
          Agrupar por prioridade
        </button>
        <span className="sep" />
        {p.views.map((v, i) => (
          <span className="view" key={v.name + i}>
            <button type="button" onClick={() => p.onApplyView(v)}>
              {v.name}
            </button>
            <button type="button" className="x" aria-label={`Excluir vista ${v.name}`} onClick={() => p.onDeleteView(i)}>
              <Icon name="x" className="sh" />
            </button>
          </span>
        ))}
        {saving ? (
          <input
            className="vname"
            autoFocus
            maxLength={24}
            value={name}
            placeholder="Nome da vista"
            aria-label="Nome da vista"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setSaving(false);
            }}
            onBlur={() => setSaving(false)}
          />
        ) : (
          <button type="button" className="chip" onClick={() => setSaving(true)}>
            <Icon name="bookmark" className="sh" />
            Salvar vista
          </button>
        )}
      </div>

      {p.bulkCount > 0 && (
        <div className="bulk">
          <strong>
            {p.bulkCount} selecionado{p.bulkCount > 1 ? 's' : ''}
          </strong>
          <button type="button" className="btn sm" onClick={p.onBulkClaim}>
            <Icon name="claim" className="sh" />
            Assumir
          </button>
          <button type="button" className="btn sm" onClick={p.onBulkClose}>
            <Icon name="check" className="sh" />
            Concluir
          </button>
          <button type="button" className="btn sm ghost" onClick={p.onBulkClear}>
            Limpar
          </button>
        </div>
      )}
    </header>
  );
}
