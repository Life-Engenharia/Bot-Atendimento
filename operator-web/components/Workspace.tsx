'use client';

import { Attachment, COLUMNS, BoardColumn, Conversation, HistoryItem, Message, PRIORITY, areaKey, areaLabel, dayLabel, fmtPhone, fmtWait, isImage, minutesSince, prettyKey, AREA_COLOR, DELIVERY } from '@/lib/domain';
import type { RefObject } from 'react';
import { Icon } from './Icon';
import { Composer, ComposerProps } from './Composer';

export type WorkspaceProps = {
  selected: Conversation | null;
  operatorName: string;
  role: string;
  nowMs: number;
  mobileOpen: boolean;
  history: HistoryItem[];
  attachmentUrls: Record<string, string>;
  retryingId: string;
  movingId: string;
  threadRef: RefObject<HTMLDivElement | null>;
  canActOnSelected: boolean;
  isCommercialLead: boolean;
  selectedColumn: BoardColumn | null;
  onClose: () => void;
  onClaim: () => void;
  onRelease: () => void;
  onFinalize: () => void;
  onReopen: () => void;
  onTransfer: () => void;
  onAction: (kind: 'followup' | 'ploomesManual' | 'serviceOrder') => void;
  onSyncPloomes: () => void;
  onMove: (c: Conversation, to: BoardColumn) => void;
  onRetry: (m: Message) => void;
  onOpenAttachment: (a: Attachment) => void;
  onLightbox: (a: Attachment, url: string) => void;
  composer: ComposerProps;
};

export function Workspace(p: WorkspaceProps) {
  const { selected: s, operatorName: name, nowMs } = p;
  if (!s)
    return (
      <section className={'ws' + (p.mobileOpen ? ' open' : '')} aria-label="Conversa">
        <div className="ph-empty">
          <Icon name="inbox" className="em" />
          <b>Nenhum atendimento selecionado</b>
          Escolha um caso no quadro para ler a conversa e responder.
        </div>
      </section>
    );

  const k = areaKey(s);
  const priority = (s.suggestedPriority || '').toUpperCase();
  const pri = PRIORITY[priority] ? { key: priority, ...PRIORITY[priority] } : null;
  const lastInbound = [...(s.messages || [])].reverse().find((m) => m.direction === 'inbound') || null;
  const windowLeft = lastInbound ? Math.round((Date.parse(lastInbound.receivedAt) + 24 * 3600 * 1000 - nowMs) / 60000) : null;
  const windowState = windowLeft === null ? null : windowLeft <= 0 ? 'dead' : windowLeft < 180 ? 'warn' : 'ok';
  const last = s.messages?.length ? s.messages[s.messages.length - 1] : null;
  const customerWaiting = !!last && last.direction === 'inbound' && s.state !== 'closed';
  const contextEntries = Object.entries(s.context || {}).filter(([, v]) => v && String(v).trim());
  const compactContextEntries = contextEntries.filter(([, v]) => String(v).trim().length <= 160);
  const longContextEntries = contextEntries.filter(([, v]) => String(v).trim().length > 160);
  const isOpen = s.state !== 'closed';
  const due = isOpenDue(s, nowMs);
  const mine = s.assignedOperator === name;

  return (
    <section className={'ws' + (p.mobileOpen ? ' open' : '')} aria-label="Conversa">
      <div className="ws-h">
        <div className="hrow">
          <button type="button" className="back" onClick={p.onClose}>
            ‹ Fila
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{s.contactName || s.contactPhone}</h2>
            <div className="meta">
              <span className="mono">{fmtPhone(s.contactPhone)}</span>
              {pri && (
                <span className={'badge ' + pri.key.toLowerCase()} title={pri.text}>
                  {pri.symbol} {pri.key}
                </span>
              )}
              <span className="area" style={{ ['--a' as string]: AREA_COLOR[k] }}>
                {areaLabel(s)}
              </span>
            </div>
          </div>
        </div>

        <div className={'state' + (due || (customerWaiting && !s.assignedOperator) ? ' due' : '')}>
          <span>
            {!isOpen
              ? 'Atendimento concluído. O histórico está preservado.'
              : p.isCommercialLead
                ? 'Lead recebido pelo comercial'
                : s.assignedOperator
                  ? mine
                    ? customerWaiting
                      ? `Você é o responsável · cliente aguarda há ${fmtWait(minutesSince(last?.receivedAt, nowMs))}`
                      : 'Você é o responsável'
                    : `Em atendimento por ${s.assignedOperator}`
                  : `Aguardando alguém assumir · há ${fmtWait(minutesSince(s.updatedAt, nowMs))}`}
          </span>
          <span className="actions">
            {!isOpen ? (
              <button type="button" className="btn" onClick={p.onReopen}>
                <Icon name="undo" />
                Reabrir
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={p.onClaim} disabled={mine || p.isCommercialLead}>
                  <Icon name="claim" />
                  {mine ? 'Em atendimento por você' : p.isCommercialLead ? 'Lead comercial' : 'Assumir'}
                </button>
                {!p.isCommercialLead && (
                  <>
                    <button type="button" className="btn ok" onClick={p.onFinalize} disabled={!p.canActOnSelected} title={!p.canActOnSelected ? 'Assuma o atendimento antes de encerrá-lo.' : undefined}>
                      <Icon name="check" />
                      Concluir
                    </button>
                    <button type="button" className="btn ghost" onClick={p.onRelease} disabled={!s.assignedOperator}>
                      <Icon name="undo" />
                      Liberar
                    </button>
                  </>
                )}
              </>
            )}
          </span>
        </div>

        {isOpen && (
          <div className="actions">
            {!p.isCommercialLead && p.canActOnSelected && p.role !== 'viewer' && (
              <button type="button" className="btn sm" onClick={p.onTransfer}>
                <Icon name="transfer" />
                Transferir
              </button>
            )}
            {!p.isCommercialLead && (
              <button type="button" className="btn sm ghost" onClick={() => p.onAction('followup')}>
                <Icon name="clock" />
                Agendar retorno
              </button>
            )}
            {s.destinationArea === 'commercial' && (
              <>
                <button type="button" className="btn sm ghost" onClick={p.onSyncPloomes}>
                  <Icon name="users" />
                  Cadastrar oportunidade
                </button>
                <button type="button" className="btn sm ghost" onClick={() => p.onAction('ploomesManual')}>
                  Cadastro manual
                </button>
              </>
            )}
            {['technical', 'on_call'].includes(s.destinationArea || '') && (
              <button type="button" className="btn sm ghost" onClick={() => p.onAction('serviceOrder')}>
                <Icon name="wrench" />
                Registrar OS manual
              </button>
            )}
            {p.selectedColumn && mine && (
              <label className="mv">
                Mover para
                <select value={p.selectedColumn} disabled={p.movingId === s.id} onChange={(e) => p.onMove(s, e.target.value as BoardColumn)}>
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
      </div>

      <div className="ctx">
        {compactContextEntries.length > 0 && (
          <div className="tchips" aria-label="Triagem do bot">
            {compactContextEntries.slice(0, 8).map(([key, v]) => (
              <span key={key}>
                <em>{prettyKey(key)}</em>
                {String(v)}
              </span>
            ))}
          </div>
        )}
        {longContextEntries.map(([key, value]) => (
          <details className="initial-intent" key={key}>
            <summary>
              <span className="initial-intent-label">{prettyKey(key)}</span>
              <span className="initial-intent-preview">{String(value)}</span>
              <span className="initial-intent-toggle" aria-hidden="true" />
            </summary>
            <p>{String(value)}</p>
          </details>
        ))}
        {p.history.length > 0 && (
          <details className="info">
            <summary>Histórico do cliente ({p.history.length})</summary>
            <ul className="hist" style={{ listStyle: 'none', padding: '0 16px 10px' }}>
              {p.history.map((h) => (
                <li key={h.id} style={{ gridColumn: '1 / -1' }}>
                  <b>{h.protocolId || 'Sem protocolo'}</b> · {h.destinationArea === 'commercial' ? 'Comercial' : h.destinationArea === 'technical' ? 'Técnico' : h.destinationArea || 'Atendimento'} · {h.state === 'closed' ? 'Concluído' : 'Em aberto'} · {new Date(h.updatedAt).toLocaleDateString('pt-BR')}
                  {h.resolutionNote ? <small> — {h.resolutionNote}</small> : null}
                </li>
              ))}
            </ul>
          </details>
        )}
        {isOpen && windowState === 'dead' && (
          <div className="wnd dead">
            <Icon name="alert" className="sh" />A janela de 24 h do WhatsApp está encerrada. Use um modelo aprovado.
          </div>
        )}
        {isOpen && windowState === 'warn' && windowLeft !== null && (
          <div className="wnd warn">
            <Icon name="clock" className="sh" />A janela de 24 h fecha em {fmtWait(windowLeft)}. Depois só modelos aprovados.
          </div>
        )}
        {isOpen && windowState === 'ok' && windowLeft !== null && (
          <div className="wnd">
            <Icon name="clock" className="sh" />Janela de 24 h aberta por mais {fmtWait(windowLeft)}
          </div>
        )}
      </div>

      {!!s.attachments?.length && (
        <div className="ctx" aria-label="Anexos da conversa">
          {s.attachments.map((a) => (
            <div key={a.id}>
              {p.attachmentUrls[a.id] && isImage(a) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.attachmentUrls[a.id]}
                  alt={a.fileName}
                  style={{ maxWidth: '100%', borderRadius: 8, cursor: 'zoom-in' }}
                  onClick={() => p.onLightbox(a, p.attachmentUrls[a.id])}
                />
              )}
              <button type="button" className="att" disabled={a.status !== 'stored'} onClick={() => p.onOpenAttachment(a)}>
                <span className="ph" aria-hidden="true" />
                <span>
                  <b>{a.fileName}</b>
                  <br />
                  <small>{a.status === 'stored' ? (isImage(a) ? 'Ampliar' : 'Abrir') : a.status}</small>
                </span>
              </button>
              {a.extractedText && (
                <details className="info">
                  <summary>{a.mediaType.startsWith('audio/') ? 'Transcrição' : 'Leitura IA'}</summary>
                  <p>{a.extractedText}</p>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      <Thread
        messages={s.messages || []}
        threadRef={p.threadRef}
        operatorName={name}
        canAct={p.canActOnSelected}
        retryingId={p.retryingId}
        onRetry={p.onRetry}
      />

      {isOpen && <Composer {...p.composer} />}
    </section>
  );
}

function isOpenDue(s: Conversation, nowMs: number) {
  if (s.state === 'closed') return false;
  if (s.followUpAt) {
    const t = Date.parse(s.followUpAt);
    return !Number.isNaN(t) && t <= nowMs;
  }
  if (s.assignedOperator) return false;
  const k = (s.suggestedPriority || '').toUpperCase();
  const limit = PRIORITY[k]?.limit;
  return !!limit && minutesSince(s.updatedAt, nowMs) > limit;
}

function Thread({
  messages,
  threadRef,
  operatorName,
  canAct,
  retryingId,
  onRetry,
}: {
  messages: Message[];
  threadRef: RefObject<HTMLDivElement | null>;
  operatorName: string;
  canAct: boolean;
  retryingId: string;
  onRetry: (m: Message) => void;
}) {
  return (
    <div className="thread" ref={threadRef} tabIndex={0} aria-label="Mensagens">
      {messages.map((m, i, arr) => {
        const label = dayLabel(m.receivedAt);
        const showDay = i === 0 || label !== dayLabel(arr[i - 1].receivedAt);
        const inbound = m.direction === 'inbound';
        const status = String(m.deliveryStatus || '').toLowerCase().split(':')[0];
        return (
          <div key={m.id} style={{ display: 'contents' }}>
            {showDay && label && <span className="day">{label}</span>}
            <div className={'msg ' + (inbound ? 'in' : 'out')}>
              <span className="tag">{inbound ? 'Cliente' : m.content.startsWith(operatorName + ':') ? 'Você' : 'Bot Life'}</span>
              {m.content}
              <time>
                {new Date(m.receivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {!inbound && m.deliveryStatus && (
                  <>
                    {' · '}
                    <span className={'st ' + (status === 'read' ? 'read' : status === 'failed' ? 'fail' : '')}>{DELIVERY[status] || m.deliveryStatus}</span>
                  </>
                )}
              </time>
              {!inbound && status === 'failed' && canAct && (
                <button type="button" className="retry" disabled={retryingId === m.id} onClick={() => onRetry(m)}>
                  {retryingId === m.id ? 'Reenviando…' : 'Reenviar'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

