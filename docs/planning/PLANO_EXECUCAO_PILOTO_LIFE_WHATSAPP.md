# Plano de Execução - Piloto WhatsApp Life Engenharia

## Objetivo e escopo aprovado para detalhamento

Liberar um piloto controlado para 5 a 10 clientes, com duas trilhas no WhatsApp: contratação/serviço avulso e assistência para cliente Life. A automação qualifica, cria protocolo, sugere prioridade e encaminha a uma fila humana; a decisão comercial e técnica permanece humana.

Inclui uma interface operacional mínima. Não inclui dashboard executivo, BI, integração com sistema técnico de chamados, diagnóstico automático ou automação de ações técnicas.

## Premissas que a Life deve confirmar antes do desenvolvimento

| Item              | Responsável pela definição | Critério                                                                                                               |
| ----------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Menu e perguntas  | Comercial + Assistência    | Aprovar redação final e todos os segmentos comerciais, incluindo Calibração de equipamentos e instrumentos de medição. |
| Matriz de equipes | Gestor Life                | Nome, telefone, principal, backup, horário e área de cada destino.                                                     |
| P1/P2             | Coordenação técnica        | Validar SLA proposto, fluxo de plantão e contingência.                                                                 |
| Dados/LGPD        | Administração + LGPD       | Validar retenção de conversas, anexos e procedimento de exclusão.                                                      |
| Ploomes           | Administrador Ploomes      | Confirmar API disponível, permissões, limites e eventuais custos do plano.                                             |
| Contas            | Life                       | Criar ou transferir propriedade das contas Meta, Google Cloud, Supabase, GitHub, OpenAI e Ploomes.                     |

## Arquitetura e contas sob propriedade da Life

| Componente | Decisão                                                         | Conta proprietária                       |
| ---------- | --------------------------------------------------------------- | ---------------------------------------- |
| Canal      | Meta WhatsApp Cloud API: Messages API e Webhooks                | Meta Business Portfolio da Life          |
| Backend    | Node.js, TypeScript e Fastify                                   | Repositório GitHub da Life               |
| Deploy     | Google Cloud Run, `southamerica-east1` (São Paulo)              | Organização/projeto Google Cloud da Life |
| Banco      | Supabase Pro com PostgreSQL gerenciado                          | Organização Supabase da Life             |
| IA         | OpenAI Responses API, modelo econômico definido em configuração | Projeto OpenAI da Life                   |
| CRM        | Ploomes API para leads e oportunidades comerciais               | Conta Ploomes da Life                    |
| Segredos   | Google Secret Manager                                           | Projeto Google Cloud da Life             |

Nenhuma chave de produção deve ficar em computador pessoal, código-fonte ou conta de terceiros. João pode receber acesso técnico com menor privilégio, revogável pela Life.

## Interface operacional mínima

| Área     | Função de aceite                                                         |
| -------- | ------------------------------------------------------------------------ |
| Fila     | Mostrar protocolo, prioridade, status, rota, responsável e backup.       |
| P1/P2    | Permitir receber e confirmar chamado, com horário e usuário registrados. |
| Detalhe  | Exibir resumo da triagem, mensagens, anexos, cliente e unidade.          |
| Operação | Assumir, transferir, alterar status e registrar ações.                   |
| Escala   | Cadastrar responsáveis, backups, horários e cobertura de plantão.        |

## Cronograma e esforço estimado

| Etapa                           |       Duração | Esforço estimado | Responsável principal       | Critério de aceite                                                                                           |
| ------------------------------- | ------------: | ---------------: | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1. Descoberta e regras          |      1 semana |          12-16 h | Life + desenvolvimento      | Menu, perguntas, serviços, matriz e SLAs aprovados.                                                          |
| 2. Base técnica                 |      1 semana |          18-24 h | Desenvolvimento             | Contas, ambientes, webhook, banco, segredos e auditoria funcionando.                                         |
| 3. Fluxos e Ploomes comercial   |      1 semana |          20-28 h | Desenvolvimento + Comercial | Rota comercial e assistência avulsa criam/atualizam oportunidade; chamada técnica não usa Ploomes.           |
| 4. Operação interna no WhatsApp |      1 semana |          22-30 h | Desenvolvimento + Operação  | Fluxos privados por cargo, fila, confirmação P1/P2, responsável, backup, detalhes e transferência validados. |
| 5. Testes e liberação           |      1 semana |          16-22 h | Life + desenvolvimento      | Pelo menos 20 cenários aprovados; piloto de 5-10 clientes liberado.                                          |
| **Total**                       | **5 semanas** |     **88-120 h** | —                           | Todos os critérios críticos aprovados.                                                                       |

O valor de desenvolvimento é calculado a partir do esforço aprovado e da taxa comercial definida entre as partes. A infraestrutura é cobrada diretamente nas contas da Life.

## Custos mensais estimados

Valores externos de referência em 25/09/2026. Valores em reais usam US$ 1 = R$ 5,50 somente para orçamento; não incluem IOF, impostos ou eventuais custos contratados no Ploomes.

| Componente                                                         | Custo oficial/referência                                                                  | Piloto de 5-10 clientes | Projeção de 100 clientes |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------: | -----------------------: |
| Supabase Pro - produção                                            | US$ 25/mês, com projeto Micro incluído                                                    |               R$ 137,50 |               R$ 137,50+ |
| Supabase - homologação                                             | Projeto adicional a partir de US$ 10/mês; alternativa de teste gratuita pode pausar       |         R$ 0 a R$ 55,00 |                 R$ 55,00 |
| Google Cloud Run, Registry, Secret Manager, logs e cópia de backup | Cobrança por uso; produção em São Paulo e mínimo de zero instâncias                       |            R$ 2 a R$ 30 |            R$ 10 a R$ 60 |
| OpenAI Responses API e transcrição                                 | Texto, imagens, documentos e áudios; uso limitado a triagem, extração e resumo            |            R$ 5 a R$ 15 |            R$ 30 a R$ 90 |
| Meta WhatsApp Cloud API                                            | Cobrança por mensagens conforme rate card e categoria da Meta                             |            R$ 5 a R$ 20 |                   R$ 70+ |
| GitHub Team                                                        | US$ 4 por usuário/mês; 3 usuários no piloto e 5 na projeção, câmbio de referência R$ 5,50 |                R$ 66,00 |                R$ 110,00 |
| Ploomes                                                            | Dependente do plano atual da Life                                                         |         **a confirmar** |          **a confirmar** |
| **Total técnico estimado**                                         | Sem impostos, suporte, desenvolvimento, notebook e Ploomes adicional                      | **R$ 215 a R$ 324/mês** |  **R$ 410 a R$ 560/mês** |

### Fontes e ressalvas

- Supabase Pro custa US$ 25/mês, inclui crédito de compute para um projeto Micro, 8 GB de disco e backups diários com retenção de 7 dias; projeto adicional começa em cerca de US$ 10/mês. [Supabase Pricing](https://supabase.com/pricing)
- Cloud Run cobra por uso e São Paulo (`southamerica-east1`) é região disponível; o serviço deve iniciar com faturamento baseado em requisições e mínimo de zero instâncias. [Google Cloud Run Pricing](https://cloud.google.com/run/pricing)
- O custo da OpenAI depende do modelo e da modalidade; o orçamento considera texto, imagens, documentos e transcrição de áudio, com teto mensal a configurar na conta institucional. [OpenAI Docs - Pricing](https://developers.openai.com/api/docs/pricing)
- A API do Ploomes documenta criação/consulta de contatos e oportunidades, autenticação por usuário de integração e limite atual de 120 requisições/minuto; preço e disponibilidade precisam ser confirmados no plano contratado da Life. [Ploomes API](https://developers.ploomes.com/)
- A Meta pode alterar tarifa por categoria, país e data. A conta Meta da Life será a fonte de cobrança e de rate card aplicável.

## Segurança, backup e retenção

| Tema                   | Proposta para validação administrativa/LGPD                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Conversas e protocolos | 180 dias de retenção.                                                                                            |
| Anexos                 | 90 dias de retenção.                                                                                             |
| Backups de banco       | Backup diário incluído no Supabase Pro com retenção de 7 dias; manter exportação periódica e testar restauração. |
| Acesso                 | Perfis administrador, comercial, técnico e consulta; MFA para administradores; auditoria de ações.               |
| Ambientes              | Homologação e produção isoladas; dados fictícios ou anonimizados em testes.                                      |
| Alertas                | Falha de integração, P1/P2 sem confirmação, falha de backup e orçamento de APIs acima do limite.                 |

Os períodos de retenção propostos não são uma decisão jurídica final e dependem de validação administrativa e de LGPD da Life.

## Critérios de aceite para entrada em piloto

- Menu com três rotas e submenu comercial completo aprovado.
- Cliente sem contrato encaminhado como oportunidade avulsa, sem reiniciar atendimento.
- Ploomes cria/atualiza somente oportunidade comercial; trilha técnica permanece na fila humana.
- P1/P2 notificam principal, registram confirmação e escalam para backup no SLA acordado.
- Bot operacional interno permite fila, detalhes, anexos, assumir, transferir e atualizar status por perfil autorizado.
- Backups, ambientes, alertas e trilha de auditoria validados.
- Testes internos de pelo menos 20 cenários aprovados.
- Grupo inicial de 5 a 10 clientes definido e comunicado.
