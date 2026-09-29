import { existsSync } from 'node:fs';
import { loadEnvironment } from '../src/config/env.js';
import { WhatsAppCloudClient } from '../src/infra/meta/whatsapp-cloud-client.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const environment = loadEnvironment();
if (
  !environment.META_ACCESS_TOKEN ||
  !environment.WHATSAPP_PHONE_NUMBER_ID ||
  !environment.WHATSAPP_BUSINESS_ACCOUNT_ID
) {
  throw new Error(
    'Configure META_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_BUSINESS_ACCOUNT_ID em .env.local.',
  );
}

const client = new WhatsAppCloudClient(
  environment.META_ACCESS_TOKEN,
  environment.WHATSAPP_PHONE_NUMBER_ID,
);
const phone = await client.getPhoneProfile();
console.log(
  JSON.stringify(
    {
      connected: true,
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.display_phone_number,
      verifiedName: phone.verified_name,
      qualityRating: phone.quality_rating,
    },
    null,
    2,
  ),
);
