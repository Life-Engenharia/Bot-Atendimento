import { existsSync } from 'node:fs';
import { loadEnvironment } from '../src/config/env.js';
import { PloomesClient } from '../src/infra/ploomes/ploomes-client.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const environment = loadEnvironment();
if (!environment.PLOOMES_USER_KEY) throw new Error('Configure PLOOMES_USER_KEY em .env.local.');

const account = await new PloomesClient(environment.PLOOMES_USER_KEY).getAccount();
console.log(JSON.stringify({ connected: true, accountId: account.Id, accountName: account.Name }));
