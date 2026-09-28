# Bot Atendimento - Life Engenharia

Backend do piloto de atendimento por WhatsApp da Life Engenharia. O sistema organiza triagens comercial e técnica, gera protocolos, sugere prioridade P1-P4 por regras explícitas e encaminha a operação humana autorizada.

## Estrutura

- `docs/`: arquitetura, regras de negócio, especificações e plano da sprint.
- `src/`: código da aplicação TypeScript/Fastify, organizado por módulos de negócio.
- `db/`: migrations e dados fictícios para homologação.
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

A fundação local está pronta: TypeScript, Fastify, configurações validadas, endpoint de saúde, migration inicial, auditoria em memória e webhook simulado com deduplicação.

## Executar localmente

```bash
npm install
npm run typecheck
npm test
npm run dev
```

O serviço responde em `GET /health`. O webhook simulado está em `GET` e `POST /webhooks/whatsapp`; ele ainda não se conecta à Meta. A documentação Swagger está em `http://localhost:3000/documentation` e sua fonte está em `docs/api/openapi.yaml`.
