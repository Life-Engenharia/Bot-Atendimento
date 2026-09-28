# Sprint 01 - Base técnica e fluxo comercial local

## Objetivo

Transformar a fundação já criada em um fluxo comercial completo e demonstrável localmente: mensagem recebida, consentimento, escolha de rota, coleta, resumo, protocolo, auditoria e encaminhamento para uma fila comercial simulada.

Esta sprint não conecta contas reais da Meta, Supabase, Ploomes ou OpenAI. O objetivo é estabilizar contratos, regras e testes antes de depender de credenciais ou serviços externos.

## Janela e capacidade

- Duração: 1 semana.
- Capacidade planejada: 20 horas.
- Faixa aprovada no plano geral para base técnica: 18 a 24 horas.
- Cadência: cinco blocos de aproximadamente quatro horas, com validação ao fim de cada bloco.

## Resultado de saída

Ao final, o time consegue enviar uma sequência de mensagens simuladas para o webhook e observar uma solicitação comercial passar por todos os estados até gerar um protocolo único e entrar na fila comercial local.

## Plano diário

| Dia | Horas | Entrega | Critério de aceite |
| --- | ---: | --- | --- |
| 1 | 4 h | Consolidar contratos de entrada e saída do webhook, estados da conversa e formato de mensagem de resposta. | Um contrato de payload de teste cobre criação, retomada e duplicidade. |
| 2 | 4 h | Ligar o webhook ao serviço de conversa comercial em memória. | A primeira mensagem cria ou retoma conversa por telefone e devolve consentimento/menu. |
| 3 | 4 h | Implementar coleta comercial por mensagem, revisão e confirmação. | Campos obrigatórios são solicitados um por vez; resumo só aparece quando a coleta está completa. |
| 4 | 4 h | Criar protocolo, fila comercial local e eventos de auditoria de ponta a ponta. | Confirmação cria um único protocolo e um evento auditável; redelivery não repete o efeito. |
| 5 | 4 h | Cobrir cenários de erro, revisar documentação e demonstrar o fluxo. | Testes de sucesso, duplicidade, entrada inválida, retomada e confirmação passam. |

## Backlog priorizado

### P0 - obrigatório nesta sprint

1. Adaptador de mensagem simulada com contrato próximo ao evento da Meta.
2. Repositório em memória de conversa indexado por telefone.
3. Máquina de estados comercial ligada ao webhook.
4. Respostas estruturadas de consentimento, menu, pergunta, resumo e protocolo.
5. Fila comercial local e auditoria dos eventos principais.
6. Testes unitários e de integração dos fluxos críticos.

### P1 - somente se sobrar capacidade

1. Persistência PostgreSQL em ambiente local usando a migration inicial.
2. Expiração de conversas inativas e retorno a um estado seguro.
3. Simulação de falha de fila e encaminhamento humano.

### Fora desta sprint

- Credenciais e webhook real da Meta.
- Supabase e armazenamento de anexos reais.
- Ploomes, OpenAI, assistência técnica, P1/P2 e bot operacional interno.
- Deploy no Cloud Run.

## Riscos e dependências

| Item | Impacto | Tratamento nesta sprint |
| --- | --- | --- |
| Texto de menu e perguntas ainda sujeito à aprovação da Life. | Pode exigir ajuste de mensagens. | Deixar mensagens em um módulo configurável e validar antes da integração externa. |
| Matriz nominal, horários e SLA ainda não definidos. | Bloqueia roteamento real e escalonamento. | Usar fila comercial simulada; não implementar P1/P2. |
| Contas externas ainda indisponíveis. | Bloqueia integração real. | Usar adaptadores falsos e contratos testáveis. |
| Retenção/LGPD pendente. | Bloqueia produção. | Não usar dados reais de clientes em desenvolvimento. |

## Demonstração de fim de sprint

1. Iniciar o serviço com `npm run dev`.
2. Enviar mensagens simuladas para `POST /webhooks/whatsapp`.
3. Exibir a criação/retomada da conversa, as perguntas e o resumo.
4. Confirmar a solicitação e mostrar o protocolo local e o evento de auditoria.
5. Reenviar a mesma mensagem e provar que não há protocolo duplicado.

## Próxima sprint prevista

Persistência com Supabase/PostgreSQL, validação de assinatura da Meta em homologação, adaptador real de mensagens e, se a Life aprovar acesso, integração comercial inicial com Ploomes.
