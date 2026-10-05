# Todo — homologação incremental do Bot de Atendimento Life

**Objetivo:** integrar e validar o bot em etapas pequenas. Cada item só é marcado como concluído após passar no teste indicado. Não usar clientes reais antes de concluir a etapa de homologação controlada.

## Como usar

- `[x]` concluído no código local.
- `[ ]` pendente.
- Executar os itens na ordem indicada; itens externos dependem de acesso às respectivas contas.
- Registrar evidência do teste: data, responsável, resultado e protocolo/mensagem de teste.

## Etapa 0 — Base local e segurança do código

- [x] Criar servidor Fastify, endpoint de saúde e documentação Swagger.
- [x] Implementar validação do desafio do webhook (`GET /webhooks/whatsapp`).
- [x] Normalizar o payload oficial recebido da Meta.
- [x] Deduplicar mensagens pelo `meta_message_id`.
- [x] Validar a assinatura `x-hub-signature-256` quando `META_APP_SECRET` estiver configurado.
- [x] Implementar envio de texto pelo cliente oficial da WhatsApp Cloud API.
- [x] Persistir mensagem de entrada, mensagem de saída e eventos de auditoria no Supabase.
- [x] Exigir `META_APP_SECRET` em produção quando a Meta estiver configurada.
- [x] Cobrir payload assinado, assinatura inválida, duplicidade e envio de resposta com testes.
- [x] Adicionar limite de tamanho de payload e tratamento específico para JSON/payload Meta inválido.
- [ ] Separar o processamento demorado do webhook em fila assíncrona antes de produção (o webhook deve responder rapidamente).
- [ ] Adicionar logs estruturados com `requestId`, `conversationId`, `protocolId` e `meta_message_id`.
- [ ] Criar alertas para falhas de banco, Meta, Ploomes e mensagens P1/P2 sem confirmação.

**Teste de saída:** `npm run typecheck` e `npm test` aprovados; chamadas locais para `/health` e para os cenários do webhook retornam o esperado.

## Etapa 1 — Infraestrutura de homologação

- [ ] Escolher subdomínio de homologação, por exemplo `bot-hml.seudominio.com.br`.
- [x] Criar `Dockerfile`, `.dockerignore` e guia de deploy para Cloud Run.
- [ ] Publicar a aplicação em hospedagem com HTTPS e certificado válido.
- [ ] Garantir acesso público a `https://<dominio>/health` e `https://<dominio>/webhooks/whatsapp`.
- [ ] Criar ambiente de homologação separado do ambiente de produção.
- [ ] Criar `.env.local` apenas para desenvolvimento e configurar segredos no provedor de hospedagem; nunca versionar tokens.
- [ ] Configurar `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `SUPABASE_URL` e `SUPABASE_API`.
- [ ] Criar banco/projeto Supabase de homologação e aplicar todas as migrations.
- [ ] Configurar backup, acesso mínimo necessário e rotação de credenciais.

**Teste de saída:** URL HTTPS acessível; `GET /health` retorna `200 {"status":"ok"}`; banco de homologação possui o schema esperado.

## Etapa 2 — Meta e número de homologação

- [ ] Criar ou selecionar o aplicativo Meta correto e adicionar o produto WhatsApp.
- [ ] Cadastrar um número exclusivo de teste/bot ou migrar um número existente conscientemente.
- [ ] Verificar o número por SMS ou ligação.
- [ ] Confirmar que a conta e o número podem enviar mensagens ao Brasil; investigar/reverter o erro Meta `130497`, se persistir.
- [ ] Cadastrar a URL pública do webhook na Meta.
- [ ] Informar na Meta o mesmo `WHATSAPP_VERIFY_TOKEN` configurado no servidor.
- [ ] Assinar o campo **messages** nos webhooks da Meta.
- [ ] Confirmar o `META_APP_SECRET` correto no servidor e testar uma assinatura válida.
- [ ] Configurar destinatários de teste, se a aplicação ainda estiver em modo de desenvolvimento.

**Teste de saída:** a Meta valida o webhook; uma mensagem enviada por um número de teste chega ao endpoint e fica registrada em `messages` e `audit_events`.

## Etapa 3 — Fluxo mínimo comercial ponta a ponta

- [x] Exibir consentimento e menu inicial.
- [x] Oferecer rota comercial, assistência técnica e pedido de humano.
- [x] Oferecer catálogo inicial de serviços comerciais.
- [x] Coletar os campos comerciais mínimos atuais e pedir confirmação.
- [x] Criar protocolo comercial local após confirmação.
- [ ] Validar telefone em E.164 e e-mail em formato básico.
- [ ] Incluir e-mail opcional, anexo opcional e comando `pular`.
- [ ] Permitir `EDITAR` de cada campo antes de confirmar o resumo.
- [ ] Salvar dados confirmados também no contato (nome, empresa, telefone e e-mail).
- [ ] Enviar a resposta real da Meta e registrar o ID/status de entrega no banco.
- [ ] Criar mensagem padrão de contingência quando o envio falhar, sem duplicar o protocolo.

**Teste de saída:** cliente de teste percorre orçamento do início ao fim, recebe o protocolo e o banco contém somente uma conversa, um protocolo e as mensagens correspondentes.

## Etapa 4 — Integração comercial Ploomes

- [ ] Criar usuário de integração com privilégios mínimos no Ploomes.
- [ ] Configurar `PLOOMES_USER_KEY` somente no ambiente de homologação.
- [ ] Mapear campos de contato e oportunidade com a Life.
- [ ] Criar/atualizar contato de forma idempotente.
- [ ] Criar/atualizar oportunidade comercial e vincular o protocolo Life.
- [ ] Tratar limite de requisições, falha temporária e reprocessamento manual.
- [ ] Nunca criar chamado técnico no Ploomes nesta fase.
- [ ] Quando o Ploomes falhar, manter protocolo local, alertar Comercial e não afirmar ao cliente que o CRM foi atualizado.

**Teste de saída:** solicitação comercial confirmada cria/atualiza uma única oportunidade de homologação no Ploomes e mantém o protocolo local vinculado.

## Etapa 5 — Fluxo técnico seguro

- [ ] Implementar a mensagem inicial obrigatória de segurança.
- [ ] Coletar: nome/empresa, unidade e contato local, contrato/histórico Life, equipamento, fabricante/modelo, patrimônio/série opcional, sintoma, alarme opcional, início/frequência, impacto, contingência, risco e evidências opcionais.
- [ ] Fazer uma pergunta por vez e preservar respostas já confirmadas.
- [ ] Identificar cliente sem contrato/histórico e encaminhar como assistência avulsa para Comercial, sem reiniciar a conversa.
- [ ] Criar resumo técnico para revisão e confirmação do cliente.
- [ ] Criar protocolo técnico antes de qualquer notificação interna.
- [ ] Não fornecer diagnóstico, intervenção elétrica/mecânica/sanitária, promessa de prazo ou orientação insegura.

**Teste de saída:** cliente Life de teste completa a pré-triagem e recebe um protocolo técnico; cliente sem vínculo cria uma oportunidade comercial de assistência avulsa sem perder os dados coletados.

## Etapa 6 — Prioridade, fila e escalonamento

- [ ] Implementar regra determinística P1: risco crítico + equipamento parado sem contingência.
- [ ] Implementar regra determinística P2: parada/falha relevante com contingência limitada.
- [ ] Implementar regra determinística P3: falha parcial/perda de desempenho sem interrupção crítica.
- [ ] Implementar regra determinística P4: preventiva, ajuste, dúvida, agendamento ou administrativo.
- [ ] Quando houver ambiguidade, contradição ou risco declarado, usar provisoriamente o nível mais alto plausível e exigir validação humana.
- [ ] Cadastrar responsáveis, backup, horário e destino para Comercial, Técnico regular, Plantão e Contingência.
- [ ] Criar notificação interna para P1/P2 e registrar confirmação humana.
- [ ] Escalonar P1 sem confirmação para backup após 5 minutos (somente após aprovação formal da Life).
- [ ] Escalonar P2 sem confirmação para backup após 15 minutos (somente após aprovação formal da Life).
- [ ] Acionar Coordenação/Contingência se responsável e backup não confirmarem.

**Teste de saída:** cenários P1, P2, P3 e P4 roteiam à fila correta; P1/P2 sem confirmação geram escalonamento e auditoria verificável.

## Etapa 7 — Operação interna autorizada

- [ ] Criar tabela de números internos autorizados, perfil, equipe, ativo/inativo e permissões.
- [ ] Implementar o comando `MENU` com opções específicas para Comercial, Técnico, Plantão, Backup, Coordenação e Administração.
- [ ] Implementar consulta de fila e consulta de protocolo apenas para usuários autorizados.
- [ ] Implementar `ASSUMIR`, `TRANSFERIR`, `CONFIRMAR`, `REGISTRAR AÇÃO`, `ATUALIZAR STATUS` e `ENCERRAR` com auditoria.
- [ ] Implementar `RESPONDER CLIENTE`: prévia, confirmação e envio pelo número oficial Life.
- [ ] Garantir que o número pessoal do colaborador nunca seja exposto ao cliente.
- [ ] Restringir anexos, histórico e dados de cada protocolo ao perfil autorizado.
- [ ] Implementar configuração administrativa de responsáveis, escalas, horários e roteamento sem alteração de código.

**Teste de saída:** cada perfil vê somente o próprio menu e dados autorizados; uma resposta interna chega ao cliente pelo número oficial e fica auditada.

## Etapa 8 — Mídias e status da Meta

- [ ] Reconhecer mensagens de imagem, áudio, documento e vídeo no payload oficial.
- [ ] Baixar mídia da Meta de forma autenticada e armazenar em bucket privado.
- [ ] Criar URLs assinadas de curta duração somente para usuários internos autorizados.
- [ ] Transcrever áudio quando a integração estiver aprovada; preservar original.
- [ ] Extrair texto de PDF/DOCX/planilha quando suportado; encaminhar ilegíveis/protegidos a humano.
- [ ] Tratar vídeos com limites de tamanho e duração; encaminhar para humano quando necessário.
- [ ] Processar `statuses` de enviado, entregue, lido e falho recebidos da Meta.
- [ ] Registrar erro Meta `130497` como restrição de país, sem reenvio automático.

**Teste de saída:** foto de teste fica privada e vinculada ao protocolo; status de entrega é atualizado; mídia não autorizada não fica pública.

## Etapa 9 — IA complementar e guardrails

- [ ] Configurar OpenAI apenas no ambiente de homologação e com chave no servidor.
- [ ] Usar IA somente para extrair campos, resumir texto livre e identificar baixa confiança.
- [ ] Validar JSON de saída da IA antes de persistir.
- [ ] Exigir confirmação da rota pelo cliente quando a IA sugerir Comercial ou Técnico.
- [ ] Impedir IA de decidir prioridade, risco, permissões, diagnóstico ou instruções técnicas.
- [ ] Registrar uso, falhas e custo aproximado da IA.
- [ ] Criar contingência humana se a IA estiver indisponível ou com baixa confiança.

**Teste de saída:** texto livre é resumido/extraído corretamente, mas não altera prioridade ou rota crítica sem regra determinística e confirmação do cliente.

## Etapa 10 — Qualidade, LGPD e liberação do piloto

- [ ] Definir e aprovar retenção: referência inicial de 180 dias para conversas e 90 dias para anexos.
- [ ] Implementar rotina de retenção/expurgo aprovada pela Life e LGPD.
- [ ] Revisar RLS, chaves de serviço, MFA e acesso de menor privilégio.
- [ ] Implementar logs de segurança e procedimento de incidente.
- [ ] Criar cenários end-to-end: comercial, P1, P2, P3, P4, sem contrato, humano, duplicidade, mídia, erro Meta, erro Supabase e erro Ploomes.
- [ ] Executar pelo menos 20 cenários de homologação e registrar resultados.
- [ ] Confirmar responsáveis nominais, horários, plantão, backups e SLAs antes de liberar P1/P2.
- [ ] Criar runbook de reprocessamento, indisponibilidade da Meta, indisponibilidade do Supabase e contingência humana.
- [ ] Validar mensagens com a Life e liberar apenas 5 a 10 clientes selecionados no piloto.
- [ ] Revisar métricas diariamente: triagens concluídas, roteamento correto, primeiro retorno humano, confirmações P1/P2, duplicidades, escapes para humano e oportunidades comerciais.

**Teste de saída:** critérios de segurança e operação aprovados; piloto controlado liberado e monitorado sem dados ou acesso indevido.
