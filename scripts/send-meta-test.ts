import { existsSync } from 'node:fs';
import { loadEnvironment } from '../src/config/env.js';
import { WhatsAppCloudClient } from '../src/infra/meta/whatsapp-cloud-client.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const toIndex = process.argv.indexOf('--to');
const recipient = toIndex >= 0 ? process.argv[toIndex + 1]?.replace(/\D/g, '') : undefined;
if (!recipient)
  throw new Error('Uso: npm run meta:send-test -- --to 5511999999999 [--message Texto]');
const messageIndex = process.argv.indexOf('--message');
const body =
  messageIndex >= 0
    ? process.argv.slice(messageIndex + 1).join(' ')
    : 'Teste de conexão do Bot Atendimento Life.';
const environment = loadEnvironment();
if (!environment.META_ACCESS_TOKEN || !environment.WHATSAPP_PHONE_NUMBER_ID)
  throw new Error('Credenciais da Meta ausentes em .env.local.');

const client = new WhatsAppCloudClient(
  environment.META_ACCESS_TOKEN,
  environment.WHATSAPP_PHONE_NUMBER_ID,
);
const result = await client.sendText(recipient, body);
console.log(JSON.stringify({ sent: true, recipient, messageId: result.messageId }, null, 2));
