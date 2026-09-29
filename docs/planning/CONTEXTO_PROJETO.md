# Contexto de continuidade — Bot-Atendimento

Recuperado em 28/09/2026 da conversa **Mapear arquitetura e fluxo da sprint** (ID `01a0e915-8d3f-76e2-99db-427ca2098a80`).

## Solicitação e orientação do usuário

- Verificar arquitetura, funcionalidades e regras de negócio.
- Planejar a sprint e começar a implementação seguindo o fluxo do PDF.
- Respeitar as horas e os dias da sprint, sem implementar tudo de uma vez.
- Os PDFs estão na pasta do projeto.
- Trazer o contexto para `C:\Users\Setor Desenvolviment\Documents\Projetos\Bot-Atendimento`.

## Estado da conversa anterior

A conversa estava em outra pasta, sem código ou PDFs, e ficou parada na localização dos materiais. Não houve implementação nem análise dos PDFs naquela conversa.

Foi sugerido um Dia 1 de 4 horas: leitura do PDF (1h), revisão da arquitetura (1h), definição da primeira funcionalidade e critérios de aceite (1h), e fundação técnica (1h). Essa divisão era uma proposta provisória do assistente, sem validação nos documentos; não deve ser tratada como cronograma confirmado.

As horas devem distinguir esforço estimado de tempo efetivamente trabalhado. Registrar entregas, validações e pendências por etapa antes de avançar.

## Materiais localizados na pasta correta

Documentação:

- `docs/architecture/ARQUITETURA_AGENTE_WHATSAPP.md`
- `docs/architecture/ARQUITETURA_E_REGRAS_NEGOCIO_V1.md`
- `docs/specifications/ESPECIFICACAO_PILOTO_LIFE_WHATSAPP.md`
- `docs/specifications/OPERACAO_INTERNA_WHATSAPP_LIFE.md`
- `docs/planning/PLANO_EXECUCAO_PILOTO_LIFE_WHATSAPP.md`

PDFs:

- `output/pdf/Proposta_Piloto_WhatsApp_Life_Engenharia.pdf`
- `output/pdf/Proposta_Final_Piloto_WhatsApp_Life.pdf`
- `output/pdf/Proposta_Atualizada_Piloto_WhatsApp_Life.pdf`
- `output/propostas_joao_victor/Modelo_Geral_Proposta.pdf`

Existem scripts Python de geração dos documentos. Nenhum manifesto de aplicação foi localizado na busca inicial. A revisão completa do código e dos documentos ainda está pendente.

## Referência inicial do plano de execução

Informações extraídas do Markdown `docs/planning/PLANO_EXECUCAO_PILOTO_LIFE_WHATSAPP.md`, ainda a confrontar com os PDFs e demais documentos:

- Piloto para 5 a 10 clientes da Life Engenharia, com trilhas comercial/serviço avulso e assistência para clientes Life.
- Automação qualifica, cria protocolo, sugere prioridade e encaminha para atendimento humano; decisões comerciais e técnicas permanecem humanas.
- Arquitetura prevista: WhatsApp Cloud API, Node.js/TypeScript/Fastify, Cloud Run em São Paulo, Supabase/PostgreSQL, OpenAI Responses API, Ploomes e Secret Manager.
- Há premissas a confirmar com a Life sobre menu, equipes, SLAs P1/P2, dados/LGPD, Ploomes e contas.

| Etapa                        | Duração prevista | Esforço estimado |
| ---------------------------- | ---------------- | ---------------- |
| Descoberta e regras          | 1 semana         | 12–16 h          |
| Base técnica                 | 1 semana         | 18–24 h          |
| Fluxos e Ploomes comercial   | 1 semana         | 20–28 h          |
| Operação interna no WhatsApp | 1 semana         | 22–30 h          |
| Testes e liberação           | 1 semana         | 16–22 h          |
| Total                        | 5 semanas        | 88–120 h         |

## Próximo ponto de retomada

Ler os PDFs e confrontar versões com os quatro documentos Markdown, identificando a referência vigente e eventuais divergências. A partir do cronograma real, detalhar o primeiro dia da etapa de descoberta: fluxo, regras, dependências, critérios de aceite e backlog. Só então iniciar o incremento correspondente, respeitando o limite de escopo solicitado pelo usuário.

Esta transferência registra o contexto e a localização dos materiais; não representa conclusão da análise nem início da implementação.
