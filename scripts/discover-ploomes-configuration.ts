import { existsSync } from 'node:fs';
import { loadEnvironment } from '../src/config/env.js';
import { PloomesClient } from '../src/infra/ploomes/ploomes-client.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const environment = loadEnvironment();
if (!environment.PLOOMES_USER_KEY) throw new Error('Configure PLOOMES_USER_KEY em .env.local.');

const client = new PloomesClient(environment.PLOOMES_USER_KEY);
const [pipelines, users] = await Promise.all([client.listPipelines(), client.listUsers()]);
console.log(JSON.stringify({ pipelines, users }, null, 2));
