import './globals.css';
import './layout-overrides.css';

export const metadata = { title: 'Life Engenharia · Central de atendimento' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
