# Bot Atendimento - Life Engenharia

Backend do piloto de atendimento por WhatsApp da Life Engenharia. O sistema organiza triagens comercial e técnica, gera protocolos, sugere prioridade P1-P4 por regras explícitas e encaminha a operação humana autorizada.

## Estrutura

- `docs/`: arquitetura, regras de negócio, especificações e plano da sprint.
- `src/`: código da aplicação TypeScript/Fastify, organizado por módulos de negócio.
- `supabase/`: configuração da CLI, migrations e testes SQL.
- `db/`: documentação auxiliar do banco.
- `tests/`: testes unitários, de integração e de fluxos completos.
- `scripts/document-generation/`: geradores dos documentos comerciais e técnicos já produzidos.
- `output/`: documentos e artefatos gerados; não contém código da aplicação.
- `tmp/`: arquivos temporários de trabalho; não faz parte da aplicação.

## Referências de implementação

Antes de iniciar um módulo, consulte:

1. `docs/architecture/ARQUITETURA_E_REGRAS_NEGOCIO_V1.md` para contratos, regras e estrutura de código.
2. `docs/specifications/ESPECIFICACAO_PILOTO_LIFE_WHATSAPP.md` para fluxos, perguntas e critérios de encaminhamento.
3. `docs/planning/PLANO_EXECUCAO_PILOTO_LIFE_WHATSAPP.md` para o limite de escopo e esforço de cada etapa.

## Estado atual

A fundação local está pronta: TypeScript, Fastify, configurações validadas, endpoint de saúde, migrations Supabase, auditoria e webhook simulado com deduplicação. Quando `SUPABASE_URL` e `SUPABASE_API` estão configuradas, o webhook persiste mensagens, contatos, conversas e eventos de auditoria.

A integração inicial com Supabase está preparada. Consulte [o runbook](docs/runbooks/SUPABASE.md)
para validar a conexão e aplicar migrations. O fluxo do bot ainda usa armazenamento em memória.

## Executar localmente

```bash
npm install
npm run typecheck
npm test
npm run dev
```

O serviço responde em `GET /health`. O webhook simulado está em `GET` e `POST /webhooks/whatsapp`; ele ainda não se conecta à Meta. A documentação Swagger está em `http://localhost:3000/documentation` e sua fonte está em `docs/api/openapi.yaml`.

## Simular atendimentos

Os cenários executam o endpoint do webhook, validam cada transição e comprovam a
deduplicação. Eles não precisam iniciar o servidor HTTP.

```bash
# Usa o Supabase quando .env.local contém as credenciais.
npm run simulate:commercial

# Simula solicitação de atendimento humano.
npm run simulate:human

# Não grava nada no Supabase.
npm run simulate:memory
```

Cada execução gera telefone e IDs de mensagem fictícios, exibindo o diálogo e
interrompendo com erro se uma resposta, estado ou deduplicação divergir do esperado.

## Configuração operacional pelo WhatsApp

Defina `ADMIN_PHONE_E164` em `.env.local` com o único número autorizado, usando
apenas dígitos e o código do país. Esse número pode enviar `/config` e registrar
responsáveis, escalas, horários e regras de roteamento. Cada alteração exige a
mensagem `CONFIRMAR`, fica salva no Supabase e gera um evento de auditoria.

Exemplos de alterações:

```text
RESPONSAVEL Ana Silva | 5511999999999 | comercial
ESCALA comercial | seg-sex | 08:00 | 18:00 | 5511999999999 | 5511988888888
HORARIO comercial | seg-sex | 08:00 | 18:00
ROTA solicitacao_sem_classificacao | humano
```

Quando o bot não identifica uma solicitação na etapa de roteamento, ele transfere
a conversa à fila humana e registra o motivo no histórico de `handoffs`.

## Dashboard administrativa

Com `SUPABASE_URL`, `SUPABASE_API` e `ADMIN_DASHBOARD_TOKEN` configuradas, o mesmo
serviço do bot disponibiliza `GET /admin`. A tela permite incluir e remover
responsáveis, escalas, horários e regras de roteamento; todas as mudanças são
salvas no Supabase e registradas na auditoria. A chave é solicitada no navegador
e enviada somente como `Bearer` para as rotas `/api/admin/*`.

Em produção, defina `ADMIN_DASHBOARD_TOKEN` no Secret Manager do Google Cloud
(mínimo de 24 caracteres) e entregue-a somente aos administradores autorizados.
O painel e o webhook compartilham o mesmo serviço Cloud Run; não publique
`SUPABASE_API`, tokens da Meta ou chaves OpenAI no navegador.

## Integração inicial com Ploomes

Inclua `PLOOMES_USER_KEY` em `.env.local`. A chave fica fora do Git e é enviada
somente pelo backend no cabeçalho `User-Key`. Para validar a conta conectada sem
criar ou alterar dados no CRM, execute:

```bash
npm run ploomes:check
```

Antes de habilitar criação de oportunidades, descubra os IDs reais que deverão
ser parametrizados para a Life. O comando abaixo somente consulta o CRM:

```bash
npm run ploomes:discover
```

## Classificação opcional com OpenAI

A OpenAI não é necessária para o menu principal. Quando `OPENAI_API_KEY` e
`OPENAI_MODEL` estão configuradas, ela analisa apenas mensagens ambíguas da etapa
de roteamento. O backend envia somente o texto da mensagem, solicita uma rota
estruturada e mantém `store: false`. Respostas com confiança abaixo de 80%, erro
ou pedido de pessoa continuam sendo encaminhadas à fila humana.

```bash
npm run openai:check
```

## Teste de saída pelo WhatsApp Cloud API

Após adicionar um número de destinatário permitido na área de testes da Meta,
envie uma mensagem manual de homologação:

```bash
npm run meta:check
npm run meta:send-test -- --to 5511999999999 --message "Teste do Bot Life"
npm run meta:send-template -- --to 5511999999999 --template hello_world
```

O comando de envio chama a API oficial da Meta e envia uma mensagem real ao
destinatário indicado; ele não é executado automaticamente. Falhas temporárias
de DNS são repetidas até três vezes antes de o comando retornar erro.
