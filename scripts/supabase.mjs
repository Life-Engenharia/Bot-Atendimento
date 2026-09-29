import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Carrega credenciais locais sem incluí-las nos argumentos ou nos logs.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const commands = {
  check: null,
  link: ['link', '--project-ref', process.env.SUPABASE_PROJECT_REF],
  plan: ['db', 'push', '--linked', '--dry-run'],
  push: ['db', 'push', '--linked'],
  list: ['migration', 'list', '--linked'],
};
const action = process.argv[2];
if (!Object.hasOwn(commands, action)) {
  console.error('Uso: node scripts/supabase.mjs check|link|plan|push|list');
  process.exit(1);
}

if (action === 'check') {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_API;
  if (!url || !key) {
    console.error('Preencha SUPABASE_URL e SUPABASE_API em .env.local.');
    process.exit(1);
  }
  const endpoint = new URL('/rest/v1/', url);
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.supabase.co')) {
    console.error('SUPABASE_URL deve ser a URL HTTPS do projeto Supabase.');
    process.exit(1);
  }
  try {
    const headers = { apikey: key };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      console.error(`Conexão com a Data API falhou (HTTP ${response.status}).`);
      process.exit(1);
    }
    const schema = await response.json();
    const tables = Object.keys(schema.paths ?? {}).filter(
      (path) => path !== '/' && !path.startsWith('/rpc/'),
    );
    console.log(`Data API acessível. Recursos visíveis: ${tables.length}.`);
    console.log('Isso não valida credenciais PostgreSQL nem o histórico de migrations.');
  } catch {
    console.error('Não foi possível consultar a Data API. Verifique a URL e a conectividade.');
    process.exit(1);
  }
} else {
  if (action === 'link' && !/^[a-z]{20}$/.test(process.env.SUPABASE_PROJECT_REF ?? '')) {
    console.error('Preencha SUPABASE_PROJECT_REF com a referência do projeto.');
    process.exit(1);
  }
  const cli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, ...commands[action]], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) console.error('Não foi possível iniciar a CLI do Supabase.');
  process.exit(result.status ?? 1);
}
