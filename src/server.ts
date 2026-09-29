import { buildApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { existsSync } from 'node:fs';

// Cloud Run supplies process.env; local development uses the ignored .env.local.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const environment = loadEnvironment();
const app = buildApp({ environment });

await app.listen({ host: '0.0.0.0', port: environment.PORT });
