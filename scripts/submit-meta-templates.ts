import { existsSync } from 'node:fs';
import { loadEnvironment } from '../src/config/env.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const environment = loadEnvironment();
if (!environment.META_ACCESS_TOKEN || !environment.WHATSAPP_BUSINESS_ACCOUNT_ID) {
  throw new Error('Configure META_ACCESS_TOKEN e WHATSAPP_BUSINESS_ACCOUNT_ID em .env.local.');
}

type Template = { name: string; category: 'UTILITY'; components: unknown[] };
const templates: Template[] = [
  {
    name: 'life_atualizacao_atendimento',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Olá {{1}}, há uma atualização no seu atendimento Life Engenharia. Protocolo: {{2}}. Responda a esta mensagem para continuar.',
        example: { body_text: [['Cliente', 'LFE-000001']] },
      },
    ],
  },
  {
    name: 'life_agendamento_visita',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Olá {{1}}, a visita referente ao protocolo {{2}} foi agendada para {{3}}. Responda a esta mensagem caso precise ajustar a disponibilidade.',
        example: { body_text: [['Cliente', 'LFE-000001', '23/10/2026 às 14:00']] },
      },
    ],
  },
  {
    name: 'life_novo_chamado_interno',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Há um novo chamado técnico Life aguardando tratamento. Protocolo: {{1}}. Acesse a Central de Atendimento para assumir.',
        example: { body_text: [['LFE-000001']] },
      },
    ],
  },
  {
    name: 'life_nova_oportunidade_interna',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Há uma nova oportunidade comercial Life aguardando tratamento. Protocolo: {{1}}. Acesse a Central de Atendimento para assumir.',
        example: { body_text: [['LFE-000001']] },
      },
    ],
  },
];

const endpoint = `https://graph.facebook.com/v26.0/${environment.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`;
for (const template of templates) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${environment.META_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...template, language: 'pt_BR', allow_category_change: true }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.log(
      JSON.stringify({
        name: template.name,
        submitted: false,
        status: response.status,
        error: payload?.error?.message ?? 'Erro sem detalhes',
      }),
    );
    continue;
  }
  console.log(
    JSON.stringify({
      name: template.name,
      submitted: true,
      id: payload.id,
      status: payload.status ?? 'PENDING',
    }),
  );
}
