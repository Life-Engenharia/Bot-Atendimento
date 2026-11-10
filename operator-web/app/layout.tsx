import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './ui.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-sans' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Life Engenharia · Central de atendimento',
  description: 'Fila de atendimento WhatsApp e clientes Ploomes da Life Engenharia.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
