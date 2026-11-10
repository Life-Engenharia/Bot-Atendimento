'use client';

import type { FormEvent, KeyboardEvent } from 'react';
import { Note, QUICK_REPLIES, TEMPLATES } from '@/lib/domain';
import { Icon } from './Icon';

export type ComposerProps = {
  role: string;
  canAct: boolean;
  isCommercialLead: boolean;
  text: string;
  onText: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  sendError: string;
  mode: 'reply' | 'note';
  onMode: (m: 'reply' | 'note') => void;
  notes: Note[];
  noteText: string;
  onNoteText: (v: string) => void;
  onSaveNote: () => void;
  noteSending: boolean;
  noteError: string;
  templatesOpen: boolean;
  onTemplatesOpen: (v: boolean) => void;
  fillTemplate: (t: string) => string;
};

export function Composer(p: ComposerProps) {
  const canWrite = p.canAct && !p.isCommercialLead;
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    p.onSend();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      p.onSend();
    }
  };

  return (
    <div className="reply">
      {p.role !== 'viewer' && (
        <div className="mode" role="tablist" aria-label="Tipo de mensagem">
          <button type="button" role="tab" aria-selected={p.mode === 'reply'} aria-pressed={p.mode === 'reply'} onClick={() => p.onMode('reply')}>
            <Icon name="chat" className="sh" />
            Responder ao cliente
          </button>
          <button type="button" role="tab" aria-selected={p.mode === 'note'} aria-pressed={p.mode === 'note'} onClick={() => p.onMode('note')}>
            <Icon name="note" className="sh" />
            Nota interna{p.notes.length ? ` (${p.notes.length})` : ''}
          </button>
        </div>
      )}

      {p.mode === 'reply' && canWrite && (
        <>
          <div className="qr" aria-label="Respostas rápidas">
            {QUICK_REPLIES.map((q) => (
              <button type="button" key={q} onClick={() => p.onText(p.text ? p.text + ' ' + q : q)}>
                {q}
              </button>
            ))}
            <button type="button" aria-expanded={p.templatesOpen} onClick={() => p.onTemplatesOpen(!p.templatesOpen)}>
              Modelos
            </button>
          </div>
          {p.templatesOpen && (
            <div className="tpls" role="menu">
              {TEMPLATES.map(([title, body]) => (
                <button
                  type="button"
                  role="menuitem"
                  key={title}
                  onClick={() => {
                    p.onText(p.fillTemplate(body));
                    p.onTemplatesOpen(false);
                  }}
                >
                  {title}
                  <small>{p.fillTemplate(body)}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {p.mode === 'note' && p.role !== 'viewer' ? (
        <div>
          <p className="hint">Só a equipe vê estas notas. O cliente não recebe nada.</p>
          {p.notes.length > 0 && (
            <div className="ctx" style={{ maxHeight: 160, overflow: 'auto' }}>
              {p.notes.map((n) => (
                <div key={n.id} className="wnd">
                  <b>{n.author}</b> · {new Date(n.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  <br />
                  {n.content}
                </div>
              ))}
            </div>
          )}
          <form className="composer" onSubmit={(e) => { e.preventDefault(); p.onSaveNote(); }}>
            <label className="sr" htmlFor="note">
              Nota interna
            </label>
            <textarea
              id="note"
              rows={2}
              maxLength={2000}
              value={p.noteText}
              onChange={(e) => p.onNoteText(e.target.value)}
              placeholder="Escreva uma nota para a equipe…"
              disabled={p.noteSending}
              style={{ background: 'var(--note-bg)', color: 'var(--note-fg)', borderStyle: 'dashed' }}
            />
            <button type="submit" className="btn" disabled={p.noteSending || !p.noteText.trim()}>
              {p.noteSending ? 'Salvando…' : 'Salvar nota'}
            </button>
          </form>
          {p.noteError && <small className="modal-error">{p.noteError}</small>}
        </div>
      ) : (
        <form className="composer" onSubmit={onSubmit}>
          <label className="sr" htmlFor="message">
            Mensagem
          </label>
          <textarea
            id="message"
            rows={1}
            value={p.text}
            onChange={(e) => {
              p.onText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={onKey}
            placeholder={
              p.isCommercialLead
                ? 'Lead tratado diretamente pelo comercial.'
                : p.canAct
                  ? 'Digite uma mensagem para enviar…'
                  : 'Assuma o atendimento para responder…'
            }
            disabled={p.sending || !p.canAct}
          />
          <button type="submit" className="btn" disabled={p.sending || !p.text.trim() || !p.canAct}>
            <Icon name="send" />
            {p.sending ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      )}
      {p.sendError && p.mode === 'reply' && <small className="modal-error">{p.sendError}</small>}
      {canWrite && p.mode === 'reply' && <p className="hint">Enter envia · Shift+Enter quebra a linha</p>}
    </div>
  );
}
