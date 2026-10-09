import { existsSync } from 'node:fs';
import { PloomesClient } from '../src/infra/ploomes/ploomes-client.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const userKey = process.env.PLOOMES_USER_KEY;
if (!userKey) throw new Error('Configure PLOOMES_USER_KEY em .env.local.');

const account = await new PloomesClient(userKey).getAccount();
console.log(JSON.stringify({ connected: true, accountId: account.Id, accountName: account.Name }));
