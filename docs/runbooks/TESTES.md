# Fluxo de testes do bot

Execute as etapas na ordem abaixo. Pare na primeira falha e registre o comando, o cenário, a mensagem recebida e a resposta observada antes de corrigir ou repetir o teste.

## 1. Validação local obrigatória

```powershell
npm run test:local
```

Esse comando verifica tipos, executa os testes unitários e de integração, e roda a simulação comercial inteiramente em memória. Não grava no Supabase, não envia WhatsApp e não acessa Ploomes.

## 2. Roteiro manual de conversa

```powershell
npm run simulate:chat
```

Valide pelo menos estes casos antes de homologar uma alteração de conversa:

1. Comercial: consentimento, seleção do serviço, dados de contato, revisão, confirmação e protocolo.
2. Técnico: consentimento, identificação, impacto, contingência, risco, prioridade e encaminhamento.
3. Humano: pedido explícito para falar com uma pessoa e manutenção da conversa na fila.
4. Robustez: mensagem duplicada, e-mail/CNPJ/telefone inválidos, resposta fora de contexto e `/reiniciar`.

Para cada caso, confirme o estado informado pelo terminal, o texto de resposta e se não há repetição de protocolo ou encaminhamento.

## 3. Homologação com banco

Somente em ambiente de homologação, com credenciais autorizadas em `.env.local`:

```powershell
npm run simulate:commercial
npm run simulate:human
```

Confirme no Supabase a conversa, as mensagens, o protocolo, a auditoria e a fila humana. Esses comandos podem persistir dados de teste; use telefones e identificadores fictícios.

## 4. Integrações externas — somente sob demanda

Rode individualmente, nunca como parte da checagem local:

```powershell
npm run openai:check
npm run ploomes:check
npm run meta:check
```

Os comandos de envio Meta (`meta:send-test`, `meta:send-template`) exigem autorização explícita, pois podem disparar mensagens reais.

## Evidência mínima para aprovação

Registre data, commit, ambiente, comandos executados, resultado, protocolo/ID fictício e qualquer falha conhecida. Uma alteração só está pronta quando a etapa 1 passa e os cenários afetados da etapa 2 ou 3 foram validados.
