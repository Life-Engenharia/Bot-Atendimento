# Especificação do Piloto - WhatsApp Life Engenharia

## Decisão de arquitetura

O piloto deve ser um **orquestrador de triagem**, não um chatbot que toma decisões. A automação apresenta opções, coleta dados, classifica uma prioridade sugerida, cria um resumo e envia a conversa à fila humana correta. Vendas e assistência técnica validam, respondem e decidem o próximo passo.

```
Cliente
  -> Meta WhatsApp Cloud API
  -> Webhook Fastify / Cloud Run
       -> Máquina de estados do fluxo (regras determinísticas)
       -> Supabase Pro / PostgreSQL gerenciado (conversa, dados, protocolo e auditoria)
       -> IA: somente extrair, resumir e esclarecer texto livre
       -> Ploomes (quando a integração estiver validada)
       -> Fila humana: Comercial ou Assistência Técnica
  -> resposta ao cliente + confirmação de recebimento humana
```

### Princípio técnico


| Decisão                | Implementação no piloto                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Escolha de rota        | Botões/listas: `Contratar serviço ou orçamento` ou `Já sou cliente Life e preciso de assistência`; não depender da IA.              |
| Perguntas obrigatórias | Máquina de estados salva cada campo e retoma exatamente de onde parou.                                                                 |
| Prioridade             | Regras explícitas sugerem P1-P4; uma pessoa confirma sempre P1/P2 e qualquer caso ambíguo.                                             |
| IA                     | Reescreve respostas aprovadas, resume dados e interpreta descrição livre. Não diagnostica, não promete prazo e não aciona equipamento. |
| Integração Ploomes     | Criar ou atualizar somente leads e oportunidades comerciais; atendimento técnico fica na fila humana nesta primeira fase.             |
| Segurança              | Handoff para humano em urgência, mensagem incompreensível, silêncio, falha de integração ou pedido do cliente.                         |

### APIs da primeira fase

| API | Componente utilizado | Limite no piloto |
| --- | --- | --- |
| Meta WhatsApp Cloud API | Messages API e Webhooks | Mensagens, anexos e eventos do canal oficial. |
| OpenAI | Responses API | Interpretação de texto livre, extração de campos e resumo; sem diagnóstico ou definição de risco. |
| Ploomes | API de leads e oportunidades | Apenas rotas comerciais e assistência avulsa sem contrato. |
| Backend Life | API Fastify interna | Fluxo, protocolo, regras P1-P4, roteamento e escalonamento. |


## Estados da conversa

```text
NOVO
 -> CONSENTIMENTO
 -> ESCOLHA_ROTA
 -> CONTRATACAO_COLETA -> RESUMO_COMERCIAL -> FILA_COMERCIAL -> HUMANO
 -> CLIENTE_LIFE_COLETA -> VALIDAR_CONTRATO -> TECNICA_COLETA -> PRIORIDADE -> FILA_TECNICA -> HUMANO
                              `-> SEM_CONTRATO -> OPORTUNIDADE_AVULSA -> FILA_COMERCIAL -> HUMANO
 -> ENCERRADA

Qualquer estado -> HANDOFF_HUMANO
```

`HANDOFF_HUMANO` bloqueia respostas automáticas, exceto uma confirmação única de encaminhamento. A equipe pode devolver a conversa para `BOT` apenas de forma explícita no painel.

## Mensagem de abertura e consentimento

> Olá! Sou a assistente virtual da Life Engenharia. Posso organizar sua solicitação e encaminhá-la à equipe responsável. Para isso, vou registrar os dados informados nesta conversa. Podemos continuar?

Opções: `Sim, continuar` | `Falar com uma pessoa`

Se recusar, informar o canal humano disponível e não iniciar a coleta. Em todas as mensagens de menu, manter a opção `Falar com uma pessoa`.

## Fluxo principal

### 1. Escolha da rota

> Como podemos ajudar?

1. `Contratar serviço ou solicitar orçamento`
2. `Já sou cliente Life e preciso de assistência técnica`
3. `Falar com uma pessoa`

O texto livre também pode ser entendido pela IA, mas a resposta deve pedir confirmação antes de iniciar a coleta.

---

## Rota comercial: contratação ou serviço avulso

### Serviços oferecidos

1. Limpeza de dutos
2. PMOC
3. Assistência técnica
4. Projetos de engenharia
5. Engenharia clínica
6. Locação de chillers
7. Chiller novo
8. Banco de sangue
9. Calibração de equipamentos e instrumentos de medição
10. Outro / não sei qual serviço

### Perguntas comerciais, na ordem ideal

Fazer uma pergunta por vez e aceitar resposta livre. Pular apenas campos já conhecidos e confirmados.


| Campo               | Pergunta ao cliente                                                                   | Obrigatório | Validação                                                                     |
| ------------------- | ------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Serviço             | “Qual serviço você procura?”                                                          | Sim         | Uma opção da lista ou texto livre.                                            |
| Nome                | “Qual é o seu nome?”                                                                  | Sim         | Texto não vazio.                                                              |
| Empresa/instituição | “Qual é a empresa ou instituição?”                                                    | Sim         | Texto não vazio.                                                              |
| Cidade e unidade    | “Em qual cidade e unidade será o atendimento?”                                        | Sim         | Texto não vazio.                                                              |
| Telefone            | “Qual telefone devemos usar para retorno?”                                            | Sim         | Confirmar o número do WhatsApp ou coletar outro.                              |
| E-mail              | “Qual e-mail devemos usar para contato? Se preferir, pode pular esta etapa.”          | Não         | Recomendado; validar formato básico quando informado.                         |
| Prazo/urgência      | “Para quando você precisa desse serviço?”                                             | Sim         | Opções: urgente / até 7 dias / neste mês / ainda estou avaliando.             |
| Necessidade         | “Conte brevemente o que você precisa.”                                                | Sim         | Texto livre de até 1.000 caracteres.                                          |
| Anexo               | “Se desejar, envie foto, documento ou especificação. Caso contrário, digite *pular*.” | Não         | Armazenar URL/ID do arquivo e tipo.                                           |


### Saída comercial

Gerar o resumo abaixo e pedir confirmação antes do encaminhamento:

```text
Resumo da solicitação comercial
Cliente: {nome}
Empresa: {empresa}
Local: {cidade} - {unidade}
Serviço: {servico}
Prazo: {prazo}
Necessidade: {necessidade}
Contato: {telefone} | {email}
Arquivos: {quantidade ou "nenhum"}
```

Após “Confirmar”: criar/atualizar oportunidade no Ploomes quando disponível, vincular protocolo e encaminhar para o vendedor/fila comercial. Resposta ao cliente:

> Obrigado. Registramos sua solicitação sob o protocolo **{protocolo}**. A equipe comercial irá avaliar e retornar pelo contato informado.

Se o Ploomes falhar: manter o protocolo local, alertar a fila comercial e dizer apenas que a equipe recebeu a solicitação; não afirmar que o cadastro externo foi concluído.

---

## Rota de assistência técnica: cliente Life

### Proteção inicial obrigatória

Antes da coleta, enviar:

> Para sua segurança, não abra equipamentos, não acesse painéis energizados, não desative alarmes e não altere parâmetros. Esta conversa faz uma pré-triagem; o diagnóstico e as orientações técnicas serão validados pela equipe.

### Perguntas técnicas, na ordem ideal


| Etapa       | Campo                   | Pergunta ao cliente                                                                           | Obrigatório                     |
| ----------- | ----------------------- | --------------------------------------------------------------------------------------------- | ------------------------------- |
| Identificar | Nome/empresa            | “Informe seu nome e empresa/instituição.”                                                     | Sim                             |
| Identificar | Unidade e contato local | “Qual unidade/local e quem é o contato no local?”                                             | Sim                             |
| Identificar | Contrato                | “Há contrato ativo ou este equipamento já foi atendido pela Life? Se souber, informe o número.” | Sim, aceitar “não sei”        |
| Localizar   | Equipamento             | “Qual é o equipamento afetado?”                                                               | Sim                             |
| Localizar   | Fabricante/modelo       | “Informe fabricante e modelo, se disponíveis.”                                                | Sim, aceitar “não identificado” |
| Localizar   | Patrimônio/série        | “Há número de patrimônio ou série?”                                                           | Não                             |
| Entender    | Sintoma                 | “Descreva o que está acontecendo.”                                                            | Sim                             |
| Entender    | Alarme                  | “Há código ou mensagem de alarme? Se houver, envie uma foto do painel.”                       | Não                             |
| Entender    | Início/frequência       | “Quando começou e acontece sempre ou de forma intermitente?”                                  | Sim                             |
| Impacto     | Operação                | “O equipamento está parado totalmente, parcialmente ou funcionando?”                          | Sim                             |
| Impacto     | Contingência            | “Existe equipamento alternativo ou plano de contingência?”                                    | Sim                             |
| Impacto     | Risco                   | “Há risco para pessoas, sangue, medicamentos ou uma operação essencial?”                      | Sim                             |
| Evidências  | Arquivos                | “Envie fotos ou um vídeo curto do equipamento, painel/alarme e local, se for seguro fazê-lo.” | Não                             |


### Regras de prioridade sugerida

Estas regras precisam estar no código, com o resultado marcado como **sugestão**:


| Prioridade       | Quando sugerir                                                                                                         | Ação automática                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| P1 - Crítica     | Há risco a pessoas, sangue, medicamentos ou operação essencial **e** equipamento crítico está parado sem contingência. | Criar alerta imediato; enviar à fila/plantão técnico; pedir confirmação de recebimento humano. |
| P2 - Alta        | Equipamento parado ou falha relevante, com alternativa temporária ou contingência limitada.                            | Encaminhar prioritariamente e exigir retorno humano rápido.                                    |
| P3 - Normal      | Falha parcial, desempenho reduzido ou solicitação sem interrupção crítica.                                             | Entrar na fila regular conforme contrato e disponibilidade.                                    |
| P4 - Programável | Dúvida, ajuste, preventiva, visita programada ou demanda administrativa.                                               | Encaminhar para agendamento/planejamento.                                                      |


Se uma resposta for vaga, contraditória ou colocar o caso entre dois níveis, atribuir provisoriamente o nível mais alto e acionar validação humana. A IA não pode reduzir prioridade nem concluir que não existe risco.

### Cliente sem contrato ou sem histórico Life

Se o cliente não possui contrato ativo e o equipamento não foi atendido pela Life, o atendimento não deve recomeçar. O sistema preserva os dados já coletados, classifica a solicitação como **oportunidade de assistência avulsa**, cria ou atualiza a oportunidade comercial no Ploomes e encaminha o resumo para a fila comercial.

### Saída técnica

```text
Resumo de pré-triagem técnica
Protocolo: {protocolo}
Cliente/empresa: {nome_empresa}
Unidade e contato local: {unidade_contato}
Contrato: {contrato_ou_nao_informado}
Equipamento: {equipamento}
Fabricante/modelo: {fabricante_modelo}
Patrimônio/série: {identificador_ou_nao_informado}
Sintoma/alarme: {sintoma} | {alarme}
Início e frequência: {inicio_frequencia}
Impacto: {impacto}
Contingência: {contingencia}
Risco informado: {risco}
Prioridade sugerida: {P1_P2_P3_P4} - {justificativa}
Evidências: {links_ou_nenhuma}
```

Mensagem ao cliente:

> Registramos a pré-triagem sob o protocolo **{protocolo}** com prioridade sugerida **{prioridade}**. A equipe técnica vai validar as informações e retornar. Em caso de risco imediato, mantenha o local seguro e acione também os procedimentos internos de emergência da unidade.

Não informar tempo de atendimento sem verificar contrato, plantão e disponibilidade humana.

---

## Regras globais de escape e exceção

Encaminhar imediatamente para `HANDOFF_HUMANO` quando ocorrer qualquer condição abaixo:

- Cliente escreve “falar com uma pessoa”, “atendente”, “humano” ou equivalente.
- Possível P1, urgência não classificada ou risco declarado.
- Mensagem incompreensível após uma tentativa de esclarecimento.
- Cliente está em silêncio por período definido pela operação (sugestão: 30 minutos) durante um caso técnico P1/P2.
- Falha no Ploomes, na fila humana, no banco ou no envio de mensagem.
- Pedido de diagnóstico, procedimento elétrico/mecânico/sanitário, preço final, prazo garantido, estoque, faturamento ou financeiro.
- Cliente pede cancelamento, reclamação grave ou solicita exercer direito sobre dados pessoais.

## Roteamento nominal e escalonamento

Cada destino deve ter responsável principal, backup, horário e prazo de confirmação cadastrados. A matriz mínima contém: Comercial, Técnico regular, Plantão P1/P2 e Contingência.

| Prioridade | Confirmação humana proposta | Escalonamento |
| --- | --- | --- |
| P1 | Até 5 minutos, sujeito à aprovação da Life | Sem confirmação, acionar backup; persistindo a falha, fila de contingência. |
| P2 | Até 15 minutos, sujeito à aprovação da Life | Sem confirmação, acionar backup e registrar evento. |
| P3/P4/Comercial | Conforme horário e SLA operacional aprovado | Encaminhar ao responsável ou fila de contingência fora do horário. |

O sistema registra data/hora de envio, confirmação, tentativa de escalonamento e destinatário final. Os nomes, telefones, backups, horários e SLAs precisam ser definidos nominalmente antes da liberação.

## Interface operacional mínima

O piloto não inclui dashboard gerencial, gráficos avançados ou BI. Inclui uma interface operacional interna, responsiva e focada em conduzir a fila humana.

```text
Fila de atendimentos                 Detalhe do atendimento
------------------------------       ---------------------------------
[P1] Hospital X - Chiller             Protocolo: LFE-000123
[P2] Clínica Y - Alarme                Cliente, unidade e contato
[P3] Empresa Z - PMOC                  Resumo da triagem e anexos
                                      Histórico de mensagens e ações
Filtros: prioridade, fila,            Responsável: {principal} | backup
responsável, status e período         [Assumir] [Transferir] [Confirmar]
                                      [Atualizar status] [Abrir conversa]
```

### Interface operacional proposta no piloto

- A operação interna será executada por um **bot operacional privado no WhatsApp**, acessível somente por números corporativos previamente cadastrados; não haverá dashboard gerencial no piloto.
- Cada perfil autorizado recebe apenas seus comandos: comercial consulta e assume oportunidades; técnico e plantão recebem chamados; backup recebe escalonamentos; coordenação acompanha e transfere; administração cadastra números, escalas e permissões.
- O bot interno permite consultar fila autorizada, prioridade, status, responsável e backup; confirmar P1/P2; consultar resumo, histórico e anexos autorizados; assumir, transferir, atualizar status e registrar ações.
- Uma proposta de fluxo e mensagens internas será validada pela Life antes do desenvolvimento. Caso a Life opte por interface em navegador, ela será tratada como ajuste formal de escopo.

Painel de indicadores gerenciais, gráficos e relatórios avançados ficam para uma etapa posterior. O atendimento ao cliente continua pelo número oficial; a operação interna ocorre por conversas privadas do bot, não por um novo canal exposto ao cliente.

## Dados e integrações

### Tabelas mínimas


| Entidade              | Campos principais                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `contacts`            | telefone, nome, empresa, e-mail, consentimento, data de consentimento.                                 |
| `conversations`       | id, telefone, rota, estado, atendente responsável, prioridade, protocolo, timestamps.                  |
| `messages`            | id externo da Meta, conversa, direção, conteúdo, anexos, status de envio.                              |
| `commercial_requests` | serviço, local, prazo, necessidade, Ploomes ID, status.                                                |
| `technical_tickets`   | contrato, equipamento, modelo, sintomas, impacto, contingência, risco, prioridade sugerida/confirmada. |
| `handoffs`            | motivo, fila, destinatário, data de envio, data de confirmação, SLA.                                   |
| `audit_events`        | mudança de prioridade, fluxo, responsável e versão das regras.                                         |


### Governança de dados e operação

| Tema | Regra inicial para validação |
| --- | --- |
| Banco | Supabase Pro com PostgreSQL gerenciado; escolhido por consistência relacional, backups, armazenamento de anexos e controle de acesso. |
| Conversas e protocolos | Retenção de 180 dias, salvo obrigação contratual ou legal. |
| Anexos | Retenção de 90 dias, salvo necessidade técnica, operacional ou contratual. |
| Acesso | Perfis de administrador, comercial, técnico e consulta; menor privilégio e auditoria de ações. |
| Backups | Retenção mínima de 30 dias e teste periódico de restauração. |
| Ambientes | Homologação e produção separados, com credenciais e dados de teste isolados. |
| Alertas | Integrações falhas, P1/P2 sem confirmação, indisponibilidade e consumo acima do orçamento de Meta, OpenAI e Supabase. |

### Integração com Ploomes

Começar somente com criação/atualização de lead ou oportunidade comercial e vínculo do protocolo. Para assistência técnica, enviar inicialmente o resumo a uma fila humana; integrar um sistema de chamados apenas depois de validar os campos, responsáveis e SLAs. A API do Ploomes não deve criar ou atualizar chamados técnicos nesta primeira fase.

Toda chamada externa deve ter: chave de idempotência, registro de tentativa, status e reprocessamento manual. O webhook da Meta deve responder rapidamente e o processamento de integrações deve ocorrer em fila assíncrona quando houver Redis/BullMQ.

## Implantação em quatro semanas


| Semana                | Entrega e critério de saída                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 - Regras            | Aprovar perguntas, serviços, prioridades, horários, responsáveis, plantão e mensagens de segurança.                                               |
| 2 - Protótipo         | Configurar Cloud API, banco, fluxo, protocolo, filas humanas e contingência; deixar Ploomes inicialmente opcional.                                |
| 3 - Testes internos   | Executar pelo menos 20 cenários, incluindo P1, P2, comercial, sem contrato, dados incompletos, anexos, humano, falha de integração e duplicidade. |
| 4 - Piloto controlado | Liberar para 5 a 10 clientes selecionados, revisar diariamente e só ampliar após estabilidade e retorno humano comprovado.                       |


## Indicadores do painel mínimo

- Triagens concluídas: percentual que chega a um resumo confirmado.
- Roteamento correto: percentual enviado à área certa, validado por quem recebeu.
- Tempo até primeiro retorno humano: separado por P1, P2, P3, P4 e comercial.
- P1/P2 confirmados: percentual com confirmação humana registrada.
- Resolução remota: percentual resolvido sem deslocamento, informado pela equipe - nunca inferido pelo bot.
- Duplicidades: chamados para o mesmo cliente/equipamento/sintoma dentro de uma janela definida.
- Oportunidades comerciais: leads criados e encaminhados ao Ploomes.
- Escapes para humano: motivo e etapa do fluxo, para corrigir perguntas confusas.

## Critérios de liberação

O piloto só pode ser ampliado se todos os itens estiverem atendidos:

- Responsáveis comercial, técnico e de plantão definidos por horário.
- Testes P1/P2 aprovados e confirmação humana funcionando.
- Botão/comando de humano disponível e testado em todo estado.
- Nenhum fluxo técnico oferece diagnóstico ou instrução insegura.
- Falhas de integração têm contingência humana e protocolo local.
- Nomes, telefones, horários, backups e SLAs de P1/P2 cadastrados e testados.
- Versão das perguntas, regras e mensagens registrada antes da publicação.
