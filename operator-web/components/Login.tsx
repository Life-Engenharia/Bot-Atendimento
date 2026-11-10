'use client';

import type { FormEvent } from 'react';
import { Icon } from './Icon';

export function Login(p: {
  email: string;
  password: string;
  notice: string;
  busy: boolean;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: () => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    p.onSubmit();
  };
  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="logo" aria-hidden="true">
          L
        </div>
        <p className="eyebrow">Central de atendimento</p>
        <h1>Bem-vindo de volta</h1>
        <p>Entre para acompanhar, assumir e responder aos atendimentos.</p>
        <label className="field">
          E-mail corporativo
          <input name="email" type="email" value={p.email} onChange={(e) => p.onEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">
          Senha
          <input name="password" type="password" value={p.password} onChange={(e) => p.onPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button type="submit" className="btn pri" style={{ width: '100%' }} disabled={p.busy}>
          <Icon name="send" className="sh" />
          {p.busy ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="sub" role="status">
          {p.notice}
        </p>
      </form>
    </main>
  );
}
