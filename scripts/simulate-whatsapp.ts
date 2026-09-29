import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { buildApp } from '../src/app.js';
import { loadEnvironment } from '../src/config/env.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const useMemory = process.argv.includes('--memory');
const scenario = process.argv.includes('--human') ? 'human' : 'commercial';
const loaded = loadEnvironment();
const environment = useMemory
  ? { ...loaded, NODE_ENV: 'test' as const, SUPABASE_URL: undefined, SUPABASE_API: undefined }
  : { ...loaded, NODE_ENV: 'test' as const };
const app = buildApp({ environment });
const runId = randomUUID().slice(0, 8);
const phone = `55119${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

type Expected = { text: string; state: string };
const steps: Expected[] =
  scenario === 'commercial'
    ? [
        { text: 'Olá', state: 'CONSENT' },
        { text: '1', state: 'ROUTE' },
        { text: '1', state: 'COMMERCIAL_SERVICE_MENU' },
        { text: '2', state: 'COMMERCIAL_COLLECTING' },
      ]
    : [
        { text: 'Olá', state: 'CONSENT' },
        { text: '2', state: 'HANDOFF_HUMANO' },
      ];

try {
  console.log(
    `Cenário: ${scenario === 'commercial' ? 'orçamento comercial' : 'atendimento humano'}`,
  );
  console.log(
    `Persistência: ${useMemory ? 'memória local' : environment.SUPABASE_URL ? 'Supabase' : 'memória local (sem credenciais)'}`,
  );
  console.log(`Telefone fictício: +${phone}\n`);

  for (const [index, step] of steps.entries()) {
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: {
        messages: [{ id: `simulation:${runId}:${index + 1}`, from: phone, text: step.text }],
      },
    });
    const body = response.json() as {
      processed: number;
      duplicates: number;
      responses: Array<{ state: string; text: string }>;
    };
    const actual = body.responses[0];
    if (response.statusCode !== 200 || body.processed !== 1 || actual?.state !== step.state) {
      throw new Error(
        `Etapa ${index + 1} falhou: esperado ${step.state}, recebido ${actual?.state ?? 'sem resposta'}.`,
      );
    }
    console.log(`✓ ${index + 1}. Cliente: ${step.text}`);
    console.log(`  Bot [${actual.state}]: ${actual.text.replaceAll('\n', ' ')}`);
  }

  const duplicateId = `simulation:${runId}:${steps.length}`;
  const duplicate = await app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp',
    payload: { messages: [{ id: duplicateId, from: phone, text: steps.at(-1)!.text }] },
  });
  const duplicateBody = duplicate.json() as { processed: number; duplicates: number };
  if (duplicateBody.processed !== 0 || duplicateBody.duplicates !== 1) {
    throw new Error('A reentrega da Meta não foi deduplicada.');
  }
  console.log('✓ Reentrega duplicada ignorada.');
  console.log('\nSimulação concluída.');
} finally {
  await app.close();
}
