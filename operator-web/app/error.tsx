'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('operator_ui_error', error);
  }, [error]);

  return (
    <main className="app-state" role="alert">
      <div className="state-card">
        <p className="eyebrow">Central de atendimento</p>
        <h1>Não foi possível carregar esta tela</h1>
        <p>Seu atendimento não foi perdido. Tente novamente; se continuar, verifique o servidor.</p>
        <button className="btn" onClick={reset}>Tentar novamente</button>
      </div>
    </main>
  );
}
