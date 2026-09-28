# Arquitetura e regras de negócio v1 - Piloto Bot WhatsApp Life

**Status:** base para implementação da etapa 1 - descoberta e regras.  
**Fonte vigente:** `output/pdf/Proposta_Atualizada_Piloto_WhatsApp_Life.pdf`, setembro de 2026, complementada pelas especificações Markdown deste repositório.

## 1. Decisão de produto

O produto é um **orquestrador de triagem e operação humana**. Ele recebe mensagens no número oficial da Life, conduz coletas estruturadas, gera um protocolo, sugere uma prioridade por regras explícitas e encaminha para a pessoa/equipe responsável.

O bot não faz diagnóstico técnico, não define risco final, não promete prazo, não instrui intervenções perigosas, nem decide ações comerciais. A IA só pode apoiar a interpretação de texto livre, extração de campos e geração de resumos; menus, estados, prioridade e permissões permanecem determinísticos no backend.

O piloto atende inicialmente de 5 a 10 clientes e possui três entradas:

1. contratação de serviço ou orçamento;
2. assistência técnica para cliente Life;
3. falar com uma pessoa.

## 2. Arquitetura aprovada para o piloto

```text
Cliente / equipe interna
          |
          v
Meta WhatsApp Cloud API (mensagens, mídia e webhooks)
          |
          v
Fastify API - Cloud Run
  |- validação de webhook e deduplicação
  |- máquina de estados e regras de negócio
  |- protocolo, roteamento e escalonamento
  |- autorização da equipe interna
  |- adaptadores: Meta, Ploomes, OpenAI e armazenamento
          |
          +--> Supabase PostgreSQL: dados operacionais e auditoria
          +--> Supabase Storage: anexos privados
          +--> Ploomes: somente oportunidades comerciais
          +--> OpenAI Responses API: extração e resumo supervisionados
          `--> Google Secret Manager / Cloud Logging
```

| Camada | Decisão | Responsabilidade |
| --- | --- | --- |
| Canal | Meta WhatsApp Cloud API | Receber eventos e enviar mensagens pelo número oficial. |
| Aplicação | Node.js, TypeScript e Fastify em Docker | Aplicar fluxos, regras, permissões e integrações. |
| Execução | Google Cloud Run, `southamerica-east1` | HTTPS, escala sob demanda e ambiente separado por estágio. |
| Dados | Supabase Pro / PostgreSQL | Dados relacionais, protocolo, fila, auditoria e permissões. |
| Arquivos | Supabase Storage privado | Guardar anexos; acesso apenas por URL temporária autorizada. |
| IA | OpenAI Responses API | Classificar texto livre, extrair campos e gerar resumo sem decidir fluxo crítico. |
| CRM | Ploomes API | Criar/atualizar contato e oportunidade somente nas rotas comerciais. |
| Segredos e logs | Secret Manager e Cloud Logging | Credenciais fora do código e rastreabilidade operacional. |

### 2.1 Limites arquiteturais

- O webhook valida assinatura, persiste o evento e responde rapidamente. Processamentos demorados, mídia, IA e Ploomes seguem em tarefa assíncrona quando a fila for introduzida.
- Toda mensagem Meta usa `message_id` como chave única. Reentregas não podem criar segundo protocolo nem segunda oportunidade.
- Toda integração externa registra tentativa, resultado, erro, chave de idempotência e possibilidade de reprocessamento manual.
- O atendimento ao cliente sempre usa o número oficial da Life. O número particular ou corporativo do colaborador nunca é exposto ao cliente.
- A operação interna do piloto é feita por bot privado no WhatsApp. Um dashboard gerencial, BI e integração com sistema técnico de chamados ficam fora deste escopo.

## 3. Domínios e módulos da aplicação

| Módulo | Responsabilidade | Não pode decidir |
| --- | --- | --- |
| `webhook` | Autenticar e normalizar eventos da Meta; deduplicar. | Rota, prioridade ou acesso. |
| `conversation` | Manter estado, coletar campos, confirmar resumo e encerrar. | Diagnóstico e prioridade humana final. |
| `triage` | Aplicar regras P1-P4 e gerar justificativa rastreável. | Reduzir risco indicado ou confirmar P1/P2. |
| `routing` | Selecionar fila, principal, backup e contingência pela matriz de escala. | Alterar a matriz sem usuário autorizado. |
| `handoff` | Criar alertas, registrar confirmações e escalar por SLA. | Encerrar caso crítico por silêncio. |
| `internal-operations` | Menus e comandos privados por perfil. | Exibir caso sem autorização. |
| `integrations` | Adaptadores Meta, Ploomes, OpenAI e Storage. | Atualizar chamado técnico no Ploomes. |
| `audit` | Registrar fatos operacionais imutáveis e versão das regras. | Apagar ou editar fatos. |

### 3.1 Estrutura de pastas proposta

O piloto usa um **monólito modular**. Há um único deploy no Cloud Run e um único banco PostgreSQL, mas cada domínio mantém suas rotas, regras e persistência isoladas. Não criaremos microserviços, pois eles aumentariam a operação sem benefício para o volume inicial.

```text
bot-atendimento/
├── src/
│   ├── app.ts                         # Compõe Fastify, rotas e dependências
│   ├── server.ts                      # Inicialização HTTP e encerramento seguro
│   ├── config/
│   │   ├── env.ts                     # Variáveis validadas; nunca contém segredos fixos
│   │   └── constants.ts               # Limites e valores compartilhados não negociais
│   ├── shared/
│   │   ├── domain/                    # Tipos, erros e Result comuns
│   │   ├── http/                      # Middleware, autenticação e tratamento de erro
│   │   ├── observability/             # Logger, rastreamento e métricas
│   │   └── validation/                # Schemas Zod reutilizáveis
│   ├── infra/
│   │   ├── database/                  # Cliente PostgreSQL/Supabase e migrations
│   │   ├── queue/                     # Fila assíncrona; começa por interface local
│   │   ├── storage/                   # Supabase Storage para mídia privada
│   │   └── integrations/              # Clientes Meta, Ploomes e OpenAI
│   ├── modules/
│   │   ├── webhook/                   # Valida e normaliza eventos da Meta
│   │   ├── conversations/             # Estado e coleta da conversa do cliente
│   │   ├── protocols/                 # Numeração, status e histórico operacional
│   │   ├── commercial/                # Rota comercial e assistência avulsa
│   │   ├── technical/                 # Coleta técnica e prioridade sugerida P1-P4
│   │   ├── routing/                   # Filas, escalas, principal e backup
│   │   ├── handoffs/                  # Confirmação, SLA e escalonamento
│   │   ├── internal-operations/       # Comandos privados por perfil da equipe
│   │   ├── contacts/                  # Contatos e consentimento
│   │   ├── attachments/               # Mídia, retenção e autorização de acesso
│   │   └── audit/                     # Eventos imutáveis de auditoria
│   └── jobs/                          # Reprocessamentos e tarefas agendadas
├── db/
│   ├── migrations/                    # Alterações versionadas do PostgreSQL
│   ├── seeds/                         # Dados fictícios de homologação
│   └── queries/                       # Consultas compartilhadas, se necessárias
├── tests/
│   ├── unit/                          # Regras P1-P4, transições e permissões
│   ├── integration/                   # Banco, webhook e adaptadores simulados
│   └── e2e/                           # Fluxos comercial, técnico e escalonamento
├── docs/
│   ├── adr/                           # Decisões técnicas registradas
│   └── runbooks/                      # Operação, incidentes e reprocessamento
├── Dockerfile
├── compose.yaml                       # Desenvolvimento local, sem uso em produção
├── package.json
└── README.md
```

Dentro de cada módulo, a organização é fixa:

```text
modules/technical/
├── domain/        # entidades e regras puras, como a classificação P1-P4
├── application/   # casos de uso, por exemplo criar pré-triagem
├── infrastructure/ # repositório PostgreSQL e chamadas externas do módulo
├── http/          # handlers, rotas e schemas de entrada
└── technical.spec.ts
```

Dependências seguem uma única direção: `http` chama `application`; `application` depende de contratos do `domain`; `infrastructure` implementa esses contratos. Regras como prioridade e permissão não podem importar Fastify, Meta, Ploomes ou OpenAI, pois precisam ser testáveis sem serviços externos.

## 4. Estados e transições

### 4.1 Conversa com cliente

```text
INICIADA -> CONSENTIMENTO -> ESCOLHA_ROTA
  -> COMERCIAL_COLETA -> COMERCIAL_REVISAO -> FILA_COMERCIAL -> HUMANO -> ENCERRADA
  -> TECNICA_COLETA -> VALIDAR_VINCULO -> TECNICA_REVISAO -> FILA_TECNICA -> HUMANO -> ENCERRADA
                           -> ASSISTENCIA_AVULSA -> FILA_COMERCIAL -> HUMANO
  -> HANDOFF_HUMANO -> HUMANO -> ENCERRADA
```

| Estado | Entrada | Saída permitida | Invariante |
| --- | --- | --- | --- |
| `INICIADA` | primeira mensagem válida | `CONSENTIMENTO` | cria/recupera conversa, sem protocolo ainda. |
| `CONSENTIMENTO` | mensagem de abertura | `ESCOLHA_ROTA`, `HANDOFF_HUMANO` | sem aceite, não coleta dados. |
| `ESCOLHA_ROTA` | menu ou texto livre confirmado | fluxo comercial, técnico ou humano | sempre apresenta opção de humano. |
| `*_COLETA` | resposta a campo solicitado | mesmo estado, revisão ou humano | uma pergunta por vez; não perde campos confirmados. |
| `*_REVISAO` | resumo completo | fila correspondente ou coleta | só cria encaminhamento após confirmação explícita. |
| `FILA_*` | protocolo encaminhado | `HUMANO` | não envia novas respostas automáticas além de confirmações do sistema. |
| `HANDOFF_HUMANO` | evento de escape | `HUMANO` | bot para de responder automaticamente. |
| `ENCERRADA` | ação humana autorizada | `INICIADA` para nova demanda | mantém histórico e auditoria. |

### 4.2 Protocolo operacional

`NOVO -> AGUARDANDO_CONFIRMACAO -> EM_ATENDIMENTO -> AGUARDANDO_CLIENTE -> RESOLVIDO -> ENCERRADO`

Uma transferência retorna o protocolo a `AGUARDANDO_CONFIRMACAO`. Somente Coordenação pode encerrar ticket técnico; Comercial encerra uma oportunidade comercial dentro de sua rota. Cada mudança gera evento de auditoria.

## 5. Regras de negócio codificáveis

### 5.1 Roteamento e coleta

| ID | Regra | Resultado obrigatório |
| --- | --- | --- |
| RN-01 | A conversa inicia com identificação de assistente virtual e consentimento. | Recusa encerra a coleta e encaminha ao canal humano. |
| RN-02 | Menu oferece Comercial, Assistência Life e Humano. | Texto livre exige confirmação da rota antes da coleta. |
| RN-03 | Comercial coleta serviço, nome, empresa, cidade/unidade, telefone, prazo e necessidade; e-mail e anexo são opcionais. | Gera resumo e pede confirmação. |
| RN-04 | Assistência coleta identificação, unidade, vínculo Life, equipamento, sintomas, impacto, contingência e risco. | Exibe a mensagem de segurança antes da coleta. |
| RN-05 | Cliente sem contrato ou histórico Life não reinicia a conversa. | Conserva dados e abre oportunidade comercial de assistência avulsa. |
| RN-06 | O protocolo é criado antes de notificar uma fila. | Todo alerta, mensagem e ação referencia o protocolo. |
| RN-07 | "Falar com uma pessoa" e equivalentes têm precedência sobre qualquer estado. | Cria handoff e pausa resposta automática. |
| RN-08 | Dados incompreensíveis após uma tentativa de esclarecimento são caso humano. | Registra motivo `BAIXA_CONFIANCA`. |

### 5.2 Prioridade técnica sugerida

| ID | Condição declarada na triagem | Prioridade sugerida | Ação do sistema |
| --- | --- | --- | --- |
| RN-10 | Risco a pessoas, sangue, medicamentos ou operação essencial **e** equipamento crítico parado sem contingência. | P1 | Alerta imediato para principal/plantão e confirmação humana. |
| RN-11 | Equipamento parado ou falha relevante, com alternativa temporária ou contingência limitada. | P2 | Fila prioritária e confirmação humana rápida. |
| RN-12 | Falha parcial, perda de desempenho ou ausência de interrupção crítica. | P3 | Fila técnica regular. |
| RN-13 | Preventiva, ajuste, dúvida, visita programada ou demanda administrativa. | P4 | Fila de planejamento/agendamento. |
| RN-14 | Resposta vaga, contraditória, caso entre níveis, urgência não classificada ou risco declarado. | Maior nível plausível | Handoff humano; IA jamais reduz a prioridade. |
| RN-15 | P1 e P2 são somente sugestões até confirmação humana. | `priority_confirmed = null` até ação autorizada | Técnico/Plantão confirma recebimento; Coordenação pode ajustar prioridade. |

### 5.3 Escalonamento

| ID | Condição | Ação |
| --- | --- | --- |
| RN-20 | P1 sem confirmação do principal em 5 minutos **após aprovação da Life**. | Notifica backup; persistindo, contingência/Coordenação. |
| RN-21 | P2 sem confirmação do principal em 15 minutos **após aprovação da Life**. | Notifica backup e registra a escalada. |
| RN-22 | P3, P4 e comercial. | Seguem horário e SLA cadastrados; fora do horário usam contingência definida. |
| RN-23 | Principal ou backup indisponível. | Registra indisponibilidade e avança ao próximo destino elegível. |
| RN-24 | Falha de banco, Meta, Ploomes ou fila humana. | Mantém protocolo local quando possível, alerta operação e nunca confirma ação externa não concluída. |

### 5.4 Segurança, comunicação e LGPD

- RN-30: o bot não fornece diagnóstico, intervenção elétrica/mecânica/sanitária, preço final, prazo garantido, estoque, financeiro ou orientação de risco; esses pedidos fazem handoff.
- RN-31: mensagem técnica inicial instrui a não abrir equipamento, acessar painéis energizados, desativar alarmes ou alterar parâmetros.
- RN-32: anexos são privados, vinculados ao protocolo e acessíveis somente a perfis autorizados.
- RN-33: telefone de operação é o primeiro fator de autorização; número não cadastrado não recebe dados operacionais. Contas administrativas exigem MFA.
- RN-34: ações relevantes registram autor, data/hora, ação, estado anterior/posterior, protocolo e versão das regras.
- RN-35: retenção proposta, pendente de validação LGPD: conversas/protocolos 180 dias; anexos 90 dias; backups operacionais pelo menos 30 dias.

## 6. Permissões da operação interna

| Perfil | Pode | Não pode |
| --- | --- | --- |
| Comercial | Assumir e transferir oportunidades, responder pelo canal oficial, atualizar estágio comercial. | Alterar prioridade técnica, escala ou fila técnica não transferida. |
| Técnico | Assumir chamado, consultar dados autorizados, responder, registrar ação e transferir. | Alterar regra de prioridade ou rota comercial. |
| Plantão | Confirmar/assumir P1/P2, acionar backup, registrar ação. | Acessar casos fora da cobertura autorizada. |
| Backup | Receber escalonamentos, assumir ou declarar indisponibilidade. | Acessar a fila completa sem escalonamento. |
| Coordenação | Designar, transferir, ajustar prioridade, monitorar SLA e encerrar. | Alterar auditoria. |
| Administração | Cadastrar números, equipes, escalas, backups e permissões. | Acessar conteúdo sem necessidade operacional justificada. |

## 7. Modelo de dados mínimo

| Entidade | Campos essenciais | Regras de consistência |
| --- | --- | --- |
| `contacts` | id, telefone E.164, nome, empresa, e-mail, consentimento. | telefone único; consentimento datado. |
| `conversations` | id, contact_id, route, state, protocol_id, assigned_user_id, timestamps. | uma conversa ativa por telefone/canal; transição de estado validada. |
| `messages` | meta_message_id, conversation_id, direção, conteúdo, mídia, status. | `meta_message_id` único. |
| `protocols` | número visível, tipo, status, prioridade sugerida/confirmada, responsável, backup. | número único e imutável. |
| `commercial_requests` | protocolo, serviço, unidade, prazo, necessidade, ploomes_id, status. | somente em rota comercial ou assistência avulsa. |
| `technical_tickets` | protocolo, contrato, equipamento, sintomas, impacto, contingência, risco, prioridade. | somente em rota técnica. |
| `team_members` | telefone, perfil, equipe, ativo. | telefone único; membro inativo perde acesso. |
| `coverage_rules` | fila, horário, principal, backup, contingência, SLA. | não ativa P1/P2 sem destinos válidos. |
| `handoffs` | protocolo, motivo, fila, destino, enviado_em, confirmado_em, SLA. | cada tentativa preserva seu histórico. |
| `attachments` | protocolo, storage_key, tipo, tamanho, retenção. | sem URL pública persistida. |
| `audit_events` | ator, protocolo, evento, dados anterior/novo, versão_regra, data. | somente inserção. |

## 8. Contratos externos essenciais

### Meta WhatsApp Cloud API

- Validar o desafio de configuração e a assinatura de cada POST.
- Normalizar mensagem, mídia, status e origem em um evento interno.
- Gravar o evento antes da execução e aceitar reentrega sem repetir efeito.
- Respeitar a janela e os templates exigidos pela Meta para comunicação proativa.

### Ploomes

- Consultar/criar/atualizar contato e oportunidade apenas após o cliente confirmar o resumo comercial.
- Chave de idempotência: `protocol_id + ação + versão`.
- Em falha, preservar protocolo e fila local; o cliente recebe somente a confirmação de recebimento interno.
- Não criar, atualizar nem fechar chamados técnicos nesta fase.

### OpenAI

- Recebe somente o mínimo de contexto necessário e sem credenciais.
- Produz estrutura validada por schema para intenção, campos extraídos, resumo e motivo de baixa confiança.
- Não chama APIs externas, não modifica dados e não determina P1/P4, handoff ou permissões.

## 9. Pendências que bloqueiam produção, não a fundação local

1. Matriz nominal: principais, backups, equipes, telefones, horários e cobertura de contingência.
2. Aprovação formal dos SLAs P1/P2 e de seus prazos.
3. Texto final de menu, mensagens de consentimento e segmentos comerciais.
4. Confirmação de API, usuário de integração, funil e campos no Ploomes.
5. Retenção, base legal, exclusão, incidentes e tratamento de dados sensíveis pela Life/LGPD.
6. Contas institucionais de Meta, Google Cloud, Supabase, GitHub e OpenAI, com ambiente de homologação.

## 10. Próximo incremento recomendado - limite da etapa 1

**Objetivo:** concluir a descoberta e deixar o contrato de implementação fechado em 12 a 16 horas estimadas, sem iniciar ainda integrações de produção.

| Bloco | Esforço estimado | Entregável e critério de saída |
| --- | ---: | --- |
| Validar fluxo e mensagens | 3 h | Menu, textos e perguntas aprovados pela Life. |
| Fechar matriz de operação | 3 h | Principal, backup, horário, fila e contingência por destino. |
| Fechar dados e regras | 3 h | Campos, status, RN-01 a RN-35 e retenção validados. |
| Preparar backlog técnico | 3 h | Migrations, endpoints, testes de fluxo e configuração de ambientes definidos. |
| Revisão e ajustes | 0-4 h | Pendências registradas, escopo da etapa 2 confirmado. |

O primeiro código da etapa 2 deve ser somente a fundação: projeto TypeScript/Fastify, endpoint de saúde, validação de webhook, schema PostgreSQL inicial, deduplicação, auditoria e teste de uma conversa comercial simulada. Meta, Ploomes e OpenAI entram por adaptadores falsos em homologação até que as contas institucionais estejam disponíveis.
