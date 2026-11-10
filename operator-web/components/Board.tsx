'use client';

import type { DragEvent, KeyboardEvent } from 'react';
import { COLUMNS, Conversation, BoardColumn, MORE_LIMIT, isUrgent, isDue, priorityOf } from '@/lib/domain';
import { Icon } from './Icon';
import { Card } from './Card';

export type ColumnData = { id: BoardColumn; rows: Conversation[] };

type BoardProps = {
  columns: ColumnData[];
  nowMs: number;
  operatorName: string;
  selectedId: string | null;
  pickedIds: Set<string>;
  draggingId: string;
  dropTarget: BoardColumn | null;
  movingId: string;
  mobile: boolean;
  mobileColumn: BoardColumn;
  group: boolean;
  more: Record<string, boolean>;
  filtering: boolean;
  onMobileColumn: (id: BoardColumn) => void;
  onOpen: (id: string) => void;
  onTogglePick: (id: string, on: boolean) => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>, c: Conversation) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: BoardColumn) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop: (id: BoardColumn, e: DragEvent<HTMLElement>) => void;
  onMore: (id: BoardColumn, value: boolean) => void;
  hasPick: boolean;
};

const sortRows = (rows: Conversation[], nowMs: number) =>
  [...rows].sort(
    (a, b) =>
      Number(isDue(b, nowMs)) - Number(isDue(a, nowMs)) ||
      Number(priorityOf(a)?.key.slice(1) || 9) - Number(priorityOf(b)?.key.slice(1) || 9) ||
      Date.parse(a.updatedAt) - Date.parse(b.updatedAt),
  );

export function Board(props: BoardProps) {
  const { columns, mobile, mobileColumn } = props;
  const gridCols = mobile
    ? undefined
    : columns.map((c) => (c.rows.length ? 'minmax(230px, 1fr)' : 'minmax(200px, 0.6fr)')).join(' ');
  return (
    <>
      <nav className="colnav" role="group" aria-label="Coluna do quadro">
        {columns.map((c) => {
          const def = COLUMNS.find((d) => d.id === c.id)!;
          return (
            <button key={c.id} type="button" aria-pressed={mobileColumn === c.id} onClick={() => props.onMobileColumn(c.id)}>
              <Icon name={def.icon} className="sh" />
              {def.title} <b>{c.rows.length}</b>
            </button>
          );
        })}
      </nav>
      <div className={'board' + (props.hasPick ? ' has-pick' : '')} style={{ gridTemplateColumns: gridCols }}>
        {columns.map((c) => (
          <Column key={c.id} data={c} {...props} />
        ))}
      </div>
    </>
  );
}

function Column({ data, ...p }: BoardProps & { data: ColumnData }) {
  const def = COLUMNS.find((d) => d.id === data.id)!;
  const sorted = sortRows(data.rows, p.nowMs);
  const showAll = !!p.more[data.id];
  const list = showAll ? sorted : sorted.slice(0, MORE_LIMIT);
  const hidden = sorted.length - list.length;
  const urgent = list.filter(isUrgent);
  const rest = list.filter((c) => !isUrgent(c));
  const card = (c: Conversation) => (
    <Card
      key={c.id}
      conversation={c}
      column={data.id}
      nowMs={p.nowMs}
      operatorName={p.operatorName}
      selected={p.selectedId === c.id}
      picked={p.pickedIds.has(c.id)}
      dragging={p.draggingId === c.id}
      moving={p.movingId === c.id}
      onOpen={p.onOpen}
      onTogglePick={p.onTogglePick}
      onKey={p.onKey}
      onDragStart={p.onDragStart}
      onDragEnd={p.onDragEnd}
    />
  );

  return (
    <section
      className={'col' + (p.dropTarget === data.id ? ' over' : '') + (p.mobile && p.mobileColumn === data.id ? ' m-on' : '')}
      data-col={data.id}
      style={{ ['--c' as string]: def.color }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        p.onDragOver(data.id);
      }}
      onDragLeave={p.onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        p.onDrop(data.id, e);
      }}
      aria-label={`${def.title}, ${data.rows.length} atendimentos. Solte um cartão aqui para mover.`}
    >
      <header>
        <span>
          <i>
            <Icon name={def.icon} />
          </i>
          {def.title}
        </span>
        <span>{data.rows.length}</span>
      </header>
      <div className="cards">
        {!sorted.length ? (
          <div className="empty">
            <Icon name="inbox" className="em" />
            {p.filtering ? 'Nenhum atendimento com esses filtros.' : def.hint}
          </div>
        ) : p.group ? (
          <>
            {urgent.length > 0 && <div className="grp">Urgentes · P1 e P2 ({urgent.length})</div>}
            {urgent.map(card)}
            {rest.length > 0 && <div className="grp">Demais · P3 e P4 ({rest.length})</div>}
            {rest.map(card)}
          </>
        ) : (
          list.map(card)
        )}
        {hidden > 0 && (
          <button type="button" className="more" onClick={() => p.onMore(data.id, true)}>
            Mostrar mais {hidden}
          </button>
        )}
        {showAll && sorted.length > MORE_LIMIT && (
          <button type="button" className="more" onClick={() => p.onMore(data.id, false)}>
            Mostrar menos
          </button>
        )}
      </div>
    </section>
  );
}
