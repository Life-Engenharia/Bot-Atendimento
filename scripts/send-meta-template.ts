import { existsSync } from 'node:fs';
import { loadEnvironment } from '../src/config/env.js';
import { WhatsAppCloudClient } from '../src/infra/meta/whatsapp-cloud-client.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const toIndex = process.argv.indexOf('--to');
const recipient = toIndex >= 0 ? process.argv[toIndex + 1]?.replace(/\D/g, '') : undefined;
if (!recipient)
  throw new Error('Uso: npm run meta:send-template -- --to 5511999999999 [--template hello_world]');
const templateIndex = process.argv.indexOf('--template');
const template = templateIndex >= 0 ? process.argv[templateIndex + 1] : 'hello_world';
if (!template) throw new Error('Informe o nome do template.');
const environment = loadEnvironment();
if (!environment.META_ACCESS_TOKEN || !environment.WHATSAPP_PHONE_NUMBER_ID)
  throw new Error('Credenciais da Meta ausentes em .env.local.');

const client = new WhatsAppCloudClient(
  environment.META_ACCESS_TOKEN,
  environment.WHATSAPP_PHONE_NUMBER_ID,
);
const result = await client.sendTemplate(recipient, template);
console.log(
  JSON.stringify({ sent: true, recipient, template, messageId: result.messageId }, null, 2),
);
