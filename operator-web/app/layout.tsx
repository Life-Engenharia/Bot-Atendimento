import type { Metadata } from 'next';
import './ui.css';

// Fontes carregadas pelo navegador (não no build): o build da Vercel não depende mais do Google Fonts.
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap';

export const metadata: Metadata = {
  title: 'Life Engenharia · Central de atendimento',
  description: 'Fila de atendimento WhatsApp e clientes Ploomes da Life Engenharia.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body>{children}</body>
    </html>
  );
}
