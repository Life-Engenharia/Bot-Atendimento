'use client';

import type { DragEvent, KeyboardEvent } from 'react';
import {
  AREA_COLOR,
  BoardColumn,
  Conversation,
  areaKey,
  areaLabel,
  fmtPhone,
  fmtWait,
  initials,
  isDue,
  minutesSince,
  priorityOf,
} from '@/lib/domain';
import { Icon } from './Icon';

export type WindowState = 'ok' | 'warn' | 'dead';
export const windowStateOf = (minutesLeft: number): WindowState =>
  minutesLeft <= 0 ? 'dead' : minutesLeft < 180 ? 'warn' : 'ok';

/** Minutos até fechar a janela de 24 h, a partir da última mensagem do cliente (null se não se sabe). */
export function windowLeftOf(c: Conversation, nowMs: number): number | null {
  const inbound = (c.messages || []).filter((m) => m.direction === "inbound").pop();
  if (!inbound) return null;
  return Math.round((Date.parse(inbound.receivedAt) + 24 * 3600 * 1000 - nowMs) / 60000);
}

export type CardProps = {
  conversation: Conversation;
  column: BoardColumn;
  nowMs: number;
  operatorName: string;
  selected: boolean;
  picked: boolean;
  dragging: boolean;
  moving: boolean;
  onOpen: (id: string) => void;
  onTogglePick: (id: string, on: boolean) => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>, c: Conversation) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
};

export function Card(props: CardProps) {
  const { conversation: c, column, nowMs, operatorName, selected, picked, dragging, moving } = props;
  const windowLeft = windowLeftOf(c, nowMs);
  const p = priorityOf(c);
  const due = isDue(c, nowMs);
  const closed = c.state === 'closed';
  const name = c.contactName || c.contactPhone;
  const mine = c.assignedOperator === operatorName;
  const win = windowLeft === null ? 'ok' : windowStateOf(windowLeft);
  const showWindow = !closed && win !== 'ok' && windowLeft !== null;
  const cls = ['card', selected && 'sel', picked && 'pick', dragging && 'dragging'].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      data-id={c.id}
      data-col={column}
      tabIndex={0}
      role="group"
      draggable={!moving}
      aria-label={`${name}${p ? ', prioridade ' + p.key : ''}, ${areaLabel(c)}${due ? ', prazo vencido' : ''}. Arraste para outra etapa.`}
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains('ck')) return;
        props.onOpen(c.id);
      }}
      onKeyDown={(e) => props.onKey(e, c)}
      onDragStart={(e) => props.onDragStart(e, c.id)}
      onDragEnd={props.onDragEnd}
    >
      <div className="r1">
        <span className="l">
          <input
            className="ck"
            type="checkbox"
            checked={picked}
            onChange={(e) => props.onTogglePick(c.id, e.target.checked)}
            aria-label={`Selecionar ${name}`}
            onClick={(e) => e.stopPropagation()}
          />
          <span className="proto">{c.protocolId || '—'}</span>
        </span>
        <span style={{ display: 'flex', gap: 5 }}>
          {/* selo "Atrasado" fica oculto na coluna Retorno: a própria coluna já indica o prazo */}
          {due && column !== 'followup' && (
            <span className="badge due">
              <Icon name="alert" />
              Atrasado
            </span>
          )}
          {p && (
            <span className={'badge ' + p.key.toLowerCase()} title={p.text}>
              {p.symbol} {p.key}
            </span>
          )}
        </span>
      </div>
      <b>{name}</b>
      {c.contactName && <span className="mono">{fmtPhone(c.contactPhone)}</span>}
      <div className="r3">
        <span className="tags">
          <span className="area" style={{ ['--a' as string]: AREA_COLOR[areaKey(c)] }}>
            {areaLabel(c)}
          </span>
          {!closed && <WaitLabel c={c} due={due} nowMs={nowMs} />}
          {showWindow && (
            <span className="win" title={win === 'dead' ? 'Janela de 24 h encerrada: só modelos aprovados' : `Janela de 24 h fecha em ${fmtWait(windowLeft!)}`}>
              <Icon name="clock" />
              {/* com alerta vermelho já visível, a janela encerrada vira só ícone */}
              {win === 'dead' && due ? null : win === 'dead' ? 'Janela encerrada' : `Fecha em ${fmtWait(windowLeft!)}`}
            </span>
          )}
        </span>
        {c.assignedOperator ? (
          <span className={'mini' + (mine ? ' me' : '')} title={c.assignedOperator}>
            {initials(c.assignedOperator)}
          </span>
        ) : (
          <span className="mini none" title="Sem responsável">
            <Icon name="claim" />
          </span>
        )}
      </div>
    </div>
  );
}

function WaitLabel({ c, due, nowMs }: { c: Conversation; due: boolean; nowMs: number }) {
  if (c.followUpAt) {
    const text = due
      ? 'Retorno vencido'
      : 'Retorno ' +
        new Date(c.followUpAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return (
      <span className={'wait' + (due ? ' due' : '')}>
        <Icon name={due ? 'alert' : 'clock'} />
        {text}
      </span>
    );
  }
  const waitMin = minutesSince(c.updatedAt, nowMs);
  return (
    <span className={'wait' + (due ? ' due' : '')} title="Tempo desde a última mensagem do cliente">
      <Icon name={due ? 'alert' : 'clock'} />
      {fmtWait(waitMin)}
    </span>
  );
}
