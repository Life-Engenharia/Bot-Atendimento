'use client';

import { Fragment, ReactNode, useEffect, useRef } from 'react';
import { Conversation, Operator, PRIORITY, COLUMNS, RESOLUTION_HINTS, atHour, toLocalInput } from '@/lib/domain';

/** Diálogo nativo (<dialog>) controlado por estado React. Esc fecha via onClose. */
export function Modal({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-label={label} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      {open && children}
    </dialog>
  );
}

export function CloseDialog(p: {
  open: boolean;
  targets: Conversation[];
  resolution: string;
  onResolution: (v: string) => void;
  error: string;
  closing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const n = p.targets.length;
  return (
    <Modal open={p.open} onClose={() => !p.closing && p.onCancel()} label="Concluir atendimento">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); p.onConfirm(); }}>
        <h3>Concluir atendimento</h3>
        <div className="sub">
          {n > 1 ? `A mesma resolução será registrada em ${n} atendimentos.` : 'Registre como a solicitação foi resolvida.'}
        </div>
        <div className="sugg">
          {RESOLUTION_HINTS.map((h) => (
            <button type="button" key={h} onClick={() => p.onResolution(h)} disabled={p.closing}>
              {h}
            </button>
          ))}
        </div>
        <label className="sub" htmlFor="resolution">
          Resolução (mínimo 3 caracteres)
        </label>
        <textarea id="resolution" value={p.resolution} onChange={(e) => p.onResolution(e.target.value)} placeholder="Descreva como o caso foi resolvido" disabled={p.closing} />
        <div className="err" role="alert">{p.error}</div>
        <div className="row">
          <button className="btn" type="button" onClick={p.onCancel} disabled={p.closing}>
            Cancelar
          </button>
          <button className="btn ok" type="submit" disabled={p.closing}>
            {p.closing ? 'Concluindo…' : n > 1 ? `Concluir ${n} atendimentos` : 'Concluir'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TransferDialog(p: {
  open: boolean;
  conversation: Conversation | null;
  candidates: Operator[];
  to: string;
  onTo: (v: string) => void;
  reason: string;
  onReason: (v: string) => void;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={p.open && !!p.conversation} onClose={() => !p.busy && p.onCancel()} label="Transferir caso">
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); p.onConfirm(); }}>
        <h3>Transferir caso</h3>
        <div className="sub">Quem receber verá o motivo nas notas internas. O cliente não é avisado.</div>
        <label className="sub" htmlFor="trTo" style={{ display: 'block', marginTop: 10 }}>
          Transferir para
        </label>
        <select id="trTo" value={p.to} onChange={(e) => p.onTo(e.target.value)} disabled={p.busy}>
          <option value="">Escolha uma pessoa…</option>
          {p.candidates.map((o) => (
            <option key={o.id} value={o.name}>
              {o.name}
            </option>
          ))}
        </select>
        <label className="sub" htmlFor="trWhy">
          Motivo (mínimo 3 caracteres)
        </label>
        <textarea id="trWhy" value={p.reason} maxLength={500} onChange={(e) => p.onReason(e.target.value)} placeholder="Ex.: caso técnico, precisa de engenheiro" disabled={p.busy} />
        <div className="err" role="alert">{p.error}</div>
        <div className="row">
          <button className="btn" type="button" onClick={p.onCancel} disabled={p.busy}>
            Cancelar
          </button>
          <button className="btn pri" type="submit" disabled={p.busy}>
            {p.busy ? 'Transferindo…' : 'Transferir'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export type ActionKind = 'followup' | 'ploomesManual' | 'serviceOrder';

export function ActionDialog(p: {
  kind: ActionKind | null;
  value: string;
  onValue: (v: string) => void;
  error: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const k = p.kind;
  return (
    <Modal open={!!k} onClose={() => !p.busy && p.onCancel()} label="Ação operacional">
      {k && (
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); p.onConfirm(); }}>
          <h3>{k === 'followup' ? 'Agendar retorno' : k === 'ploomesManual' ? 'Registrar no Ploomes' : 'Registrar abertura de OS'}</h3>
          <div className="sub">
            {k === 'followup'
              ? 'Defina quando a equipe deve retomar este atendimento.'
              : k === 'ploomesManual'
                ? 'Informe o identificador criado no Ploomes.'
                : 'Informe o número da OS aberta manualmente. A integração Sankhya continua pendente.'}
          </div>
          {k === 'followup' && (
            <div className="sugg">
              <button type="button" onClick={() => p.onValue(toLocalInput(atHour(0, 18)))}>Hoje 18:00</button>
              <button type="button" onClick={() => p.onValue(toLocalInput(atHour(1, 9)))}>Amanhã 09:00</button>
              <button type="button" onClick={() => p.onValue(toLocalInput(atHour(3, 9)))}>Em 3 dias 09:00</button>
            </div>
          )}
          <label className="sub" htmlFor="actVal" style={{ display: 'block', marginTop: 8 }}>
            {k === 'followup' ? 'Data e horário' : k === 'ploomesManual' ? 'ID no Ploomes' : 'Número da OS'}
          </label>
          <input
            id="actVal"
            style={{ width: '100%', border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 9, padding: 8, color: 'var(--fg)' }}
            type={k === 'followup' ? 'datetime-local' : 'text'}
            value={p.value}
            onChange={(e) => p.onValue(e.target.value)}
            disabled={p.busy}
          />
          <div className="err" role="alert">{p.error}</div>
          <div className="row">
            <button className="btn" type="button" onClick={p.onCancel} disabled={p.busy}>
              Cancelar
            </button>
            <button className="btn pri" type="submit" disabled={p.busy}>
              {p.busy ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="Legenda e atalhos">
      <h3>Legenda e atalhos</h3>
      <div className="lg">
        <h4>Prioridade (prazo da primeira resposta)</h4>
        {Object.entries(PRIORITY).map(([key, p]) => (
          <Fragment key={key}>
            <span className={'badge ' + key.toLowerCase()}>
              {p.symbol} {key}
            </span>
            <span>{p.text}</span>
          </Fragment>
        ))}
        <h4>Etapas do quadro</h4>
        {COLUMNS.map((c) => (
          <Fragment key={c.id}>
            <span>{c.title}</span>
            <span>{c.hint}</span>
          </Fragment>
        ))}
        <h4>WhatsApp</h4>
        <span>Janela de 24 h</span>
        <span>Depois de 24 h da última mensagem do cliente, só modelos aprovados.</span>
        <h4>Atalhos</h4>
        <kbd>/</kbd>
        <span>Buscar cliente ou telefone</span>
        <kbd>↑ ↓ ← →</kbd>
        <span>Navegar entre os cartões</span>
        <span><kbd>A</kbd> <kbd>C</kbd> <kbd>L</kbd></span>
        <span>Assumir, concluir e liberar (com o cartão em foco)</span>
        <kbd>Esc</kbd>
        <span>Fechar a conversa no celular ou uma janela aberta</span>
      </div>
      <div className="row">
        <button className="btn pri" type="button" onClick={onClose}>
          Entendi
        </button>
      </div>
    </Modal>
  );
}

export function Lightbox({ open, url, name, text, onClose }: { open: boolean; url: string; name: string; text?: string | null; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label={`Anexo ${name}`}>
      <h3>{name}</h3>
      {open && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} style={{ maxWidth: '100%', borderRadius: 10 }} />
      )}
      {text && <p className="sub">{text}</p>}
      <div className="row">
        <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
          Abrir em nova aba
        </a>
        <button className="btn pri" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
