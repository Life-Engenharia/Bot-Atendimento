import { existsSync } from 'node:fs';
import { PloomesClient } from '../src/infra/ploomes/ploomes-client.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const userKey = process.env.PLOOMES_USER_KEY;
if (!userKey) throw new Error('Configure PLOOMES_USER_KEY em .env.local.');

const client = new PloomesClient(userKey);
const [pipelines, users, activePipeline] = await Promise.all([
  client.listPipelines(),
  client.listUsers(),
  client.getActiveCommercialPipeline(),
]);
console.log(JSON.stringify({ activePipeline, pipelines, users }, null, 2));
