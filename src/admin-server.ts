import { existsSync } from 'node:fs';
import { buildAdminApp } from './admin-app.js';
import { loadEnvironment } from './config/env.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const environment = loadEnvironment();
const app = buildAdminApp({ environment });
await app.listen({ host: '0.0.0.0', port: environment.ADMIN_PORT ?? environment.PORT });
