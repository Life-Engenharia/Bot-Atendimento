export default function Loading() {
  return (
    <main className="app-state" aria-live="polite">
      <div className="state-card">
        <span className="state-spinner" aria-hidden="true" />
        <p className="eyebrow">Central de atendimento</p>
        <h1>Carregando sua fila…</h1>
        <p>Estamos recuperando os atendimentos mais recentes.</p>
      </div>
    </main>
  );
}
