# Arquitetura — Agente de WhatsApp Humanizado

## Objetivo

Criar um agente automático para WhatsApp que converse em português de forma natural, seja útil e consistente, e consiga transferir o atendimento a uma pessoa quando necessário. O projeto deve usar a API oficial do WhatsApp Business para manter o número seguro e a operação estável.

> O agente deve se apresentar como assistente virtual. Humanização significa uma conversa clara, cordial e contextualizada; não deve fingir ser uma pessoa.

## Arquitetura completa

```text
Cliente no WhatsApp
        |
        v
Meta WhatsApp Cloud API (webhook)
        |
        v
Backend / Orquestrador
  |- Regras, horário, fila e anti-spam
  |- Memória curta da conversa
  |- Base de conhecimento (FAQ, catálogo e políticas)
  |- IA para interpretar e redigir
  |- CRM / pedidos / agenda
  `- Transferência para atendente humano
        |
        v
Meta WhatsApp Cloud API envia a resposta
```

O piloto inclui uma **interface operacional mínima** para a equipe: fila por prioridade, confirmação de P1/P2, responsável e backup, resumo, anexos, histórico, assumir/transferir atendimento e atualização de status. Dashboard de indicadores e BI ficam para fase posterior.

### Componentes

| Componente | Responsabilidade |
| --- | --- |
| Meta WhatsApp Cloud API | Receber e enviar mensagens pelo canal oficial do WhatsApp. |
| Webhook | Endpoint público que recebe os eventos de mensagens da Meta. |
| Backend/orquestrador | Aplica regras do negócio, chama serviços externos e decide a resposta. |
| Banco de dados | Guarda clientes, mensagens, status das conversas e auditoria. |
| IA | Interpreta a intenção e redige respostas conforme a personalidade e regras. |
| Base de conhecimento | Fonte de respostas sobre FAQ, serviços, catálogo, políticas e procedimentos. |
| Integrações | Consulta ou atualiza CRM, agenda, pedidos ou estoque através de funções autorizadas. |
| Painel humano | Permite visualizar e assumir uma conversa. |

## Como deixar a conversa natural e segura

- Definir uma personalidade: tom, vocabulário, emojis permitidos e tamanho máximo de resposta.
- Preferir respostas curtas; dividir mensagens longas em uma ou duas partes quando fizer sentido.
- Fazer somente as perguntas necessárias para concluir o atendimento.
- Confirmar informações importantes antes de criar pedidos, agendamentos, cobranças ou alterar dados.
- Oferecer claramente a opção de falar com uma pessoa.
- Informar na abertura que se trata de uma assistente virtual, por exemplo: “Oi! Sou a assistente virtual da Empresa X. Como posso ajudar?”
- Nunca inventar preço, estoque, prazo, política ou status de pedido. Quando faltar informação, encaminhar ou consultar uma fonte autorizada.

## Fluxo de processamento de uma mensagem

1. Receber o webhook e validar a assinatura da Meta.
2. Registrar a mensagem recebida e bloquear duplicidades usando o identificador da mensagem.
3. Identificar o cliente e o estado da conversa: `BOT`, `HUMANO` ou `ENCERRADA`.
4. Se a conversa estiver com humano, registrar a mensagem e não responder automaticamente.
5. Classificar a intenção: vendas, suporte, agendamento, financeiro, pedido de humano e outras.
6. Consultar dados reais apenas por funções ou integrações autorizadas.
7. Enviar para a IA o contexto mínimo necessário, as regras e os dados consultados.
8. Aplicar filtros de segurança, limites de mensagem, horário de atendimento e regra de baixa confiança.
9. Enviar a resposta pela Cloud API ou transferir a conversa para uma pessoa.
10. Registrar resposta, decisão e falhas para auditoria e melhoria contínua.

## Prompt-base do agente

```text
Você é a assistente virtual da Empresa X e fala português do Brasil.
Seja cordial, direta e natural. Use no máximo duas mensagens curtas por resposta.
Nunca invente preços, estoque, prazos, políticas ou status de pedido.
Use somente os dados fornecidos pelas ferramentas autorizadas.
Quando não tiver certeza, informe que vai encaminhar para um atendente.
Se o cliente pedir para falar com uma pessoa, marque a conversa como HANDOFF
e não responda mais automaticamente.
Antes de executar ações, confirme nome, item e os dados relevantes.
```

## Escopo do piloto e projeção de crescimento

O piloto será liberado inicialmente para **5 a 10 clientes selecionados**, com acompanhamento diário. A estimativa de 100 clientes permanece apenas como projeção de infraestrutura e crescimento; não é o público inicial.

Para esse volume, não é necessário Kubernetes, microserviços ou uma infraestrutura complexa.

```text
WhatsApp Cloud API
        |
        v
Backend hospedado
  |- regras de atendimento
  |- OpenAI API
  |- PostgreSQL/Supabase
  `- painel ou encaminhamento humano
        |
        v
WhatsApp Cloud API
```

### Stack recomendada: melhor relação custo x crescimento

Para começar com baixo custo e manter uma rota simples de crescimento, a recomendação principal é **Google Cloud Run + Supabase PostgreSQL + Node.js/Fastify + Meta Cloud API + OpenAI**. O backend é entregue como contêiner e pode escalar horizontalmente sem reescrever a aplicação; no início, o Cloud Run pode reduzir instâncias quando não há tráfego.

| Camada | Sugestão inicial |
| --- | --- |
| Canal | Meta WhatsApp Cloud API |
| Backend | Node.js + TypeScript com Fastify, em um contêiner Docker |
| Hospedagem | Google Cloud Run (recomendado) |
| Banco | Supabase Pro com PostgreSQL gerenciado |
| IA | OpenAI API, chamada somente pelo backend |
| Fila/cache | Começar sem Redis; adicionar Redis gerenciado + BullMQ quando houver maior concorrência ou tarefas assíncronas |
| Atendimento humano | Bot operacional interno no WhatsApp, por número corporativo autorizado; painel web fica fora do piloto |
| Observabilidade | Logs estruturados, alertas de erro e rastreamento por mensagem |

Fastify tende a ser uma escolha mais enxuta que um framework mais pesado para este MVP. O uso de Docker, PostgreSQL padrão e integrações por API evita aprisionamento relevante: se o custo ou a necessidade mudar, o backend pode migrar para outro provedor sem alterar a regra de negócio.

### Banco definido: Supabase Pro com PostgreSQL

O banco do piloto será o **Supabase Pro**, usando PostgreSQL gerenciado. Ele guarda clientes, conversas, protocolos, prioridades, equipes, escalonamentos, anexos e eventos de auditoria.

PostgreSQL foi escolhido porque o atendimento possui relações críticas: um protocolo pertence a um cliente, unidade, rota, prioridade e responsável, e pode ter histórico de confirmação e backup. Essas relações e regras de consistência são mais adequadas a um banco relacional do que a um NoSQL. O Supabase reduz a operação necessária ao fornecer banco gerenciado, backup, controle de acesso, armazenamento de arquivos e base para o painel humano futuro.

## Componentes de API da primeira fase

| Componente | Uso no piloto |
| --- | --- |
| Meta WhatsApp Cloud API - Messages API | Enviar mensagens pelo número oficial e notificações internas autorizadas. |
| Meta WhatsApp Cloud API - Webhooks | Receber mensagens, anexos e eventos de status. |
| OpenAI Responses API | Interpretar texto livre, extrair campos e gerar resumo; não diagnostica nem define risco. |
| Ploomes API | Criar ou atualizar somente leads e oportunidades comerciais. |
| API interna Fastify | Aplicar fluxos, regras P1-P4, protocolo, roteamento e escalonamento. |

## Hospedagem

| Cenário | Opções | Uso indicado |
| --- | --- | --- |
| MVP e início de produção | Google Cloud Run + Supabase | Baixo custo ocioso, HTTPS e escala automática; é a opção recomendada. |
| Alternativa de custo fixo | VPS com Docker + PostgreSQL gerenciado | Pode custar menos com tráfego constante, mas exige atualizações, backups e monitoramento próprios. |
| Produção em crescimento | Cloud Run + Redis gerenciado + PostgreSQL gerenciado | Escala os componentes que realmente precisam, sem migrar o backend. |
| Alto volume/compliance | AWS, GCP ou Azure com serviços gerenciados | Operação crítica, mais equipe e requisitos rigorosos. |

Para 100 clientes, a recomendação é **Meta Cloud API + Node.js/Fastify em Docker + Google Cloud Run + Supabase PostgreSQL + OpenAI**. Render e Railway continuam bons para protótipos muito rápidos, mas Cloud Run oferece uma transição mais direta para volumes maiores.

## Segurança, LGPD e regras do WhatsApp

- Usar a API oficial do WhatsApp Business; não automatizar WhatsApp Web.
- Guardar chaves da Meta e da OpenAI apenas em variáveis de ambiente ou cofre de segredos, nunca no código ou no navegador.
- Validar a assinatura de todo webhook recebido.
- Controlar acesso ao painel de atendimento e registrar ações administrativas.
- Coletar apenas os dados pessoais necessários e definir prazo de retenção de conversas, conforme a LGPD.
- Fazer backup do banco de dados.
- Limitar mensagens por cliente e criar proteção contra loops de resposta.
- Para mensagens proativas, garantir consentimento e usar templates aprovados pela Meta quando exigido.
- Aplicar regras para conteúdo sensível e escalonar ao humano em casos de baixa confiança.

### Retenção, acesso e continuidade

| Tema | Regra inicial para validação |
| --- | --- |
| Conversas e protocolos | Reter por 180 dias, sujeito a obrigação contratual ou legal aplicável. |
| Anexos | Reter por 90 dias, salvo necessidade operacional, técnica ou contratual. |
| Backups | Reter por pelo menos 30 dias e testar restauração periodicamente. |
| Acesso | Perfis separados para administração, comercial, técnico e consulta; princípio de menor privilégio. |
| Ambientes | Homologação e produção separados, com credenciais, banco e número Meta de teste distintos. |
| Alertas | Falhas de integração, P1/P2 sem confirmação, indisponibilidade e consumo de Meta/OpenAI/Supabase acima do orçamento. |

## Custos

O custo não é definido apenas pela quantidade de clientes, mas principalmente pela quantidade de mensagens e conversas mensais. Os itens são:

- Hospedagem do backend.
- Banco de dados.
- Consumo da IA, proporcional aos textos enviados e gerados.
- Tarifação de conversas/mensagens conforme as regras vigentes da Meta.
- Eventual CRM, painel de atendimento ou provedor adicional.

### Estimativa operacional para 100 clientes

Para transformar a estimativa em um orçamento concreto, foi considerado: **100 clientes ativos**, cada um recebendo em média **20 respostas automáticas por mês** (2.000 mensagens de saída no total), sem campanhas de marketing, sem imagens/áudios e com respostas curtas. Para converter itens cobrados em dólar, foi usado **US$ 1 = R$ 5,50**, apenas como premissa de orçamento; cartão, IOF, impostos, região e câmbio podem alterar o valor final.

| Item | Cálculo do cenário | Estimativa mensal |
| --- | --- | ---: |
| WhatsApp Cloud API | 2.000 mensagens de serviço × R$ 0,035 | **R$ 70** a partir de outubro de 2026 |
| Backend no Cloud Run | Cerca de 4.000 chamadas HTTP/mês (webhook + envio), processamento curto | **R$ 0 a R$ 5** |
| Supabase/PostgreSQL Pro | US$ 25/mês × R$ 5,50 | **R$ 137,50** antes de IOF/impostos |
| OpenAI — GPT-5 Mini | 3 milhões de tokens de entrada + 500 mil de saída | **R$ 9,63** antes de impostos |
| Domínio `.com.br` | Renovação anual dividida por 12 | **R$ 4 a R$ 6** |
| Logs/monitoramento | Cotas iniciais do provedor | **R$ 0** |
| **Total técnico recorrente** | Sem CRM/painel pago e sem impostos | **aproximadamente R$ 221 a R$ 228/mês** |

Com tributos, IOF e variação de câmbio, o orçamento prudente é **R$ 250 a R$ 300/mês**. Antes de 1º de outubro de 2026, se as respostas ainda se enquadrarem na regra vigente de mensagens de serviço gratuitas, o total pode ficar perto de **R$ 150/mês**, pois os R$ 70 do WhatsApp deixam de existir temporariamente.

### Como foi estimado o WhatsApp

Com 100 clientes ativos, supondo 20 respostas automáticas enviadas por cliente no mês, há cerca de **2.000 mensagens de saída**. A partir de 1º de outubro de 2026, as mensagens de serviço passam a ser tarifadas pela Meta; para o Brasil, a referência divulgada é aproximadamente **R$ 0,035 por mensagem de serviço/utilidade/autenticação**. Nesse exemplo, 2.000 × R$ 0,035 = **R$ 70/mês**. Uma campanha de marketing para os 100 clientes, a cerca de R$ 0,3217 por mensagem, adicionaria aproximadamente **R$ 32**.

Evite intermediários que cobram mensalidade por número ou margem sobre cada mensagem quando a intenção é economizar: a Cloud API usada diretamente cobra as tarifas da Meta, sem uma plataforma de API adicional. Um CRM/painel pode ser contratado depois se trouxer valor operacional.

### Como foi estimada a IA

Para o cenário de produção, a premissa é 2.000 respostas por mês, com média de 1.500 tokens de entrada (instruções, resumo e últimas mensagens) e 250 de saída por resposta. Isso equivale a 3 milhões de tokens de entrada e 500 mil de saída. Com GPT-5 Mini, a tabela oficial é US$ 0,25 por milhão de tokens de entrada e US$ 2,00 por milhão de tokens de saída: aproximadamente US$ 1,75, ou R$ 9,63 pela cotação de referência. Esse número só se mantém se o contexto for resumido; enviar todo o histórico em cada resposta é o principal risco de aumentar essa parte da fatura.

### Referências de preço

- O Cloud Run cobra por uso; no modo padrão baseado em requisições, CPU e memória são cobrados durante o processamento, inicialização e encerramento da instância. [Google Cloud Run Pricing](https://cloud.google.com/run/pricing)
- O Supabase oferece plano Free e plano Pro a partir de US$ 25/mês; o Pro inclui crédito de US$ 10 para compute, 8 GB de disco e backups diários com retenção de 7 dias. [Preços do Supabase](https://supabase.com/pricing)
- A documentação oficial da OpenAI lista GPT-5 Mini a US$ 0,25 por 1 milhão de tokens de entrada e US$ 2,00 por 1 milhão de tokens de saída. [OpenAI Docs — GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
- As tarifas de WhatsApp variam por país, categoria e data. Antes de contratar, conferir o rate card que aparece na conta Meta/Business Manager; o cálculo acima usa a referência brasileira de R$ 0,035 para serviço/utilidade/autenticação e R$ 0,3217 para marketing divulgada para julho de 2026.

### Estratégia para manter o custo baixo

- Escalar por necessidade: começar com uma única aplicação stateless no Cloud Run e não manter servidores, Redis ou busca vetorial ligados antes da demanda.
- Salvar no prompt apenas o resumo e as últimas mensagens relevantes, em vez do histórico inteiro. Isso reduz o custo de IA e melhora a resposta.
- Responder perguntas repetitivas por regras, FAQ ou dados do banco antes de chamar a IA.
- Aplicar limite de tamanho à resposta e ao contexto; registrar uso por cliente e por tipo de atendimento.
- Usar um modelo mais econômico para classificação, FAQ e triagem; reservar modelos mais capazes para casos complexos ou ferramentas sensíveis.
- Adicionar Redis, RAG e banco vetorial somente quando métricas mostrarem necessidade concreta.
- Manter o banco em PostgreSQL padrão desde o primeiro dia; ele atende o MVP e permite crescimento sem migração inicial.

### Caminho de escala sem desperdício

| Volume/situação | Mudança necessária |
| --- | --- |
| Até 100 clientes | Cloud Run, Supabase PostgreSQL, FAQ no banco e processamento direto no webhook. |
| Mais mensagens simultâneas | Redis + BullMQ para desacoplar o webhook do processamento e evitar perdas/repetições. |
| Muito conteúdo ou muitas consultas | Busca vetorial/RAG; manter PostgreSQL como fonte principal de dados. |
| Integrações críticas e equipe maior | Banco gerenciado com réplicas/backups, observabilidade centralizada e ambientes separados. |

## Plano de entrega recomendado

### Fase 1 — MVP

1. Configurar WhatsApp Cloud API e webhook.
2. Criar banco com clientes, conversas, mensagens e estados.
3. Implementar FAQ, qualificação inicial e transferência para humano.
4. Criar logs, limite de mensagens e página simples de acompanhamento.
5. Testar com poucos clientes e revisar conversas reais.

### Fase 2 — Operação

1. Integrar agenda, CRM, pedidos, catálogo ou estoque.
2. Adicionar base de conhecimento pesquisável (RAG), se o conteúdo crescer.
3. Criar painéis de métricas: tempo de resposta, transferências e temas sem resposta.
4. Incluir Redis/fila para maior confiabilidade e volume.
5. Criar avaliações periódicas para melhorar respostas e regras.

## Resultado esperado do MVP

O agente deve responder dúvidas frequentes, qualificar o contato, coletar dados mínimos, encaminhar situações complexas para uma pessoa e registrar todo o histórico. Somente depois de validar isso é indicado automatizar ações como agendamento ou consulta de pedidos.
