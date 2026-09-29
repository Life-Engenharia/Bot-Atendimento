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
