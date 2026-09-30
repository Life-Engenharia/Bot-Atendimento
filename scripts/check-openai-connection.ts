import { existsSync } from 'node:fs';
import { loadEnvironment } from '../src/config/env.js';
import { OpenAiTriageClient } from '../src/infra/openai/openai-triage-client.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const environment = loadEnvironment();
if (!environment.OPENAI_API_KEY || !environment.OPENAI_MODEL)
  throw new Error('Configure OPENAI_API_KEY e OPENAI_MODEL em .env.local.');

const result = await new OpenAiTriageClient(
  environment.OPENAI_API_KEY,
  environment.OPENAI_MODEL,
).classify('Quero solicitar um orçamento de PMOC.');
console.log(
  JSON.stringify({ connected: true, route: result.route, confidence: result.confidence }),
);
