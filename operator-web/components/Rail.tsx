'use client';

import { NavKey, initials } from '@/lib/domain';
import { Icon, IconName } from './Icon';

const NAV: [NavKey, string, IconName][] = [
  ['all', 'Fila geral', 'inbox'],
  ['commercial', 'Comercial', 'brief'],
  ['technical', 'Técnico', 'wrench'],
  ['closed', 'Concluídos', 'done'],
];

export function Rail(p: {
  nav: NavKey;
  counts: Record<NavKey, number>;
  crmOpen: boolean;
  sound: boolean;
  dark: boolean | null;
  name: string;
  onNav: (k: NavKey) => void;
  onCrm: () => void;
  onSound: () => void;
  onHelp: () => void;
  onTheme: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="rail">
      <div className="brand">
        <div className="logo" aria-hidden="true">
          L
        </div>
        <div>
          <b>Life Engenharia</b>
          <span>Central de atendimento</span>
        </div>
      </div>
      <nav className="nav" aria-label="Filtrar por área">
        <h4>Áreas</h4>
        {NAV.map(([key, label, icon]) => (
          <button key={key} type="button" className={p.nav === key && !p.crmOpen ? 'on' : ''} aria-pressed={p.nav === key && !p.crmOpen} title={label} onClick={() => p.onNav(key)}>
            <Icon name={icon} className="nav-ic" />
            <span>{label}</span>
            <small>{p.counts[key]}</small>
          </button>
        ))}
        <h4 style={{ marginTop: 10 }}>Cadastro</h4>
        <button type="button" className={p.crmOpen ? 'on' : ''} aria-pressed={p.crmOpen} title="Clientes · Ploomes" onClick={p.onCrm}>
          <Icon name="users" className="nav-ic" />
          <span>Clientes · Ploomes</span>
        </button>
      </nav>
      <div className="rtools">
        <button type="button" id="soundBtn" aria-pressed={p.sound} onClick={p.onSound}>
          <span>
            <Icon name="bell" className="sh" />
            Alerta sonoro
          </span>
          <span>{p.sound ? 'Ligado' : 'Desligado'}</span>
        </button>
        <button type="button" id="helpBtn" onClick={p.onHelp}>
          <span>
            <Icon name="help" className="sh" />
            Legenda e atalhos
          </span>
          <span>?</span>
        </button>
        <button type="button" onClick={p.onTheme}>
          <span>
            <Icon name="moon" className="sh" />
            Tema
          </span>
          <span>{p.dark === null ? 'Auto' : p.dark ? 'Escuro' : 'Claro'}</span>
        </button>
      </div>
      <div className="me">
        <span className="av" aria-hidden="true">
          {initials(p.name)}
        </span>
        <div style={{ minWidth: 0 }}>
          <b>{p.name}</b>
          <span style={{ opacity: 0.7 }}>Operadora</span>
        </div>
        <button type="button" onClick={p.onLogout} aria-label="Sair">
          <Icon name="logout" className="sh" />
          Sair
        </button>
      </div>
    </aside>
  );
}

