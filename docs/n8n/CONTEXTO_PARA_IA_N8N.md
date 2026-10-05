# Contexto para IA do n8n — Bot de Atendimento Life Engenharia

Copie o bloco **Prompt para construir o workflow** para a IA do n8n. Valores entre `<...>` devem ser configurados como credenciais ou variáveis de ambiente; nunca incluídos no workflow em texto puro.

## Prompt para construir o workflow

```text
Crie um workflow de produção inicial para o "Bot de Atendimento Life Engenharia", em português do Brasil. Use somente a API oficial WhatsApp Cloud API da Meta. Não use WhatsApp Web, bibliotecas não oficiais, scraping ou automação de navegador.

OBJETIVO
Receber mensagens de clientes no WhatsApp, conduzir uma triagem estruturada, criar um protocolo, encaminhar a solicitação para a área humana correta e registrar tudo no Supabase. O bot é um orquestrador de triagem: ele não faz diagnóstico técnico, não dá instruções perigosas, não define decisão comercial e não promete prazo.

ARQUITETURA
WhatsApp Cloud API da Meta -> Webhook n8n -> Supabase/PostgreSQL -> regras/estado do fluxo -> (OpenAI apenas para extrair ou resumir texto, quando necessário) -> WhatsApp Cloud API da Meta.

Também integrar Ploomes apenas nas solicitações comerciais: criar ou atualizar contato e oportunidade. Não criar nem atualizar chamados técnicos no Ploomes.

CREDENCIAIS E VARIÁVEIS (crie placeholders; não peça nem exponha segredos)
- META_VERIFY_TOKEN: <META_VERIFY_TOKEN>
- META_ACCESS_TOKEN: <META_ACCESS_TOKEN>
- META_PHONE_NUMBER_ID: <META_PHONE_NUMBER_ID>
- META_GRAPH_API_VERSION: <META_GRAPH_API_VERSION>
- SUPABASE_URL: <SUPABASE_URL>
- SUPABASE_SERVICE_ROLE_KEY: <SUPABASE_SERVICE_ROLE_KEY>
- OPENAI_API_KEY: <OPENAI_API_KEY> (opcional)
- OPENAI_MODEL: <OPENAI_MODEL> (opcional)
- PLOOMES_USER_KEY: <PLOOMES_USER_KEY> (opcional)
- ADMIN_PHONE_E164: <ADMIN_PHONE_E164>

DESENHO DO WORKFLOW
1. Crie uma rota GET /webhooks/whatsapp para a validação da Meta. Quando hub.mode=subscribe e hub.verify_token for igual a META_VERIFY_TOKEN, responda o texto de hub.challenge; caso contrário, responda 403.
2. Crie uma rota POST /webhooks/whatsapp para eventos recebidos da Meta. Responda HTTP 200 rapidamente. Extraia mensagens de entry[].changes[].value.messages[]. Ignore eventos que contenham somente statuses. Preserve o payload bruto para auditoria quando possível.
3. Normalize a mensagem em: meta_message_id, from (E.164 sem +), timestamp, tipo, texto, media_id, mime_type, contact_name e payload bruto.
4. Faça deduplicação antes de qualquer envio usando meta_message_id como chave única. Em duplicidade, registre a ocorrência e não responda nem crie novo protocolo.
5. Busque ou crie contato e conversa no Supabase. A conversa tem: telefone, rota, estado, campos coletados, protocolo, prioridade_sugerida, prioridade_confirmada, atendente_responsavel e timestamps.
6. Sempre procure antes por intenção de humano. Se a mensagem indicar "falar com uma pessoa", "atendente", "humano" ou equivalente, interrompa a automação, crie handoff com o motivo PEDIDO_HUMANO, registre auditoria, responda que a equipe foi acionada e não prossiga com perguntas automáticas.
7. Envie mensagens pela Meta com POST para https://graph.facebook.com/<META_GRAPH_API_VERSION>/<META_PHONE_NUMBER_ID>/messages, autenticação Bearer META_ACCESS_TOKEN. Grave o ID da mensagem enviada e o status. Trate erros: não reenvie automaticamente mensagens com código 130497; registre como RESTRICAO_DE_PAIS_META e alerte a operação.

MENSAGEM INICIAL E CONSENTIMENTO
Na primeira mensagem válida, enviar:
"Olá! Tudo bem? Eu sou a assistente virtual da Life Engenharia. Posso organizar sua solicitação e encaminhá-la para a equipe responsável. Para isso, vou registrar as informações desta conversa. Podemos continuar?\n\n1. Sim, vamos lá\n2. Prefiro falar com uma pessoa"

Sem aceite explícito, não colete informações. Se aceitar (1, sim, continuar), mostrar o menu:
"Como podemos ajudar?\n\n1. Contratar serviço ou solicitar orçamento\n2. Já sou cliente Life e preciso de assistência técnica\n3. Falar com uma pessoa"

Se receber texto livre, a IA opcional pode sugerir a rota, mas o workflow deve pedir confirmação explícita antes de iniciar coleta. A decisão de estado, permissões e prioridade deve ser sempre determinística; IA nunca decide isso.

ESTADOS
INICIADA -> CONSENTIMENTO -> ESCOLHA_ROTA -> COMERCIAL_COLETA -> COMERCIAL_REVISAO -> FILA_COMERCIAL -> HUMANO -> ENCERRADA
INICIADA -> CONSENTIMENTO -> ESCOLHA_ROTA -> TECNICA_COLETA -> VALIDAR_VINCULO -> TECNICA_REVISAO -> FILA_TECNICA -> HUMANO -> ENCERRADA
VALIDAR_VINCULO -> ASSISTENCIA_AVULSA -> FILA_COMERCIAL -> HUMANO
Qualquer estado -> HANDOFF_HUMANO -> HUMANO quando houver pedido de humano, risco, baixa confiança ou falha de integração.

ROTA COMERCIAL
Serviços disponíveis:
1 Limpeza de dutos; 2 PMOC; 3 Assistência técnica; 4 Projetos de engenharia; 5 Engenharia clínica; 6 Locação de chillers; 7 Chiller novo; 8 Banco de sangue; 9 Calibração de equipamentos e instrumentos de medição; 10 Outro/não sei.

Colete uma pergunta por vez; conserve os campos confirmados. Campos obrigatórios: serviço, nome, empresa/instituição, cidade e unidade, telefone para retorno, prazo/urgência (urgente, até 7 dias, neste mês, ainda avaliando) e necessidade em texto de até 1.000 caracteres. Campos opcionais: e-mail (validar formato básico) e anexo. Para anexo, aceite "pular".

Ao fim, mostre e peça confirmação explícita:
"Resumo da solicitação comercial\nCliente: {nome}\nEmpresa: {empresa}\nLocal: {cidade} - {unidade}\nServiço: {servico}\nPrazo: {prazo}\nNecessidade: {necessidade}\nContato: {telefone} | {email}\nArquivos: {quantidade ou nenhum}\n\nResponda CONFIRMAR para encaminhar ou EDITAR para corrigir."

Após CONFIRMAR: crie um protocolo no padrão LFE-000001 (sequencial/único), crie ou atualize Contato e Oportunidade no Ploomes se a credencial estiver disponível, vincule o protocolo e notifique a fila comercial. Se o Ploomes falhar, mantenha o protocolo local e alerte a fila; não diga ao cliente que o cadastro externo foi concluído. Resposta ao cliente: "Obrigado. Registramos sua solicitação sob o protocolo {protocolo}. A equipe comercial irá avaliar e retornar pelo contato informado."

ROTA TÉCNICA: CLIENTE LIFE
Antes de qualquer pergunta, enviar obrigatoriamente:
"Para sua segurança, não abra equipamentos, não acesse painéis energizados, não desative alarmes e não altere parâmetros. Esta conversa faz uma pré-triagem; o diagnóstico e as orientações técnicas serão validados pela equipe."

Colete uma pergunta por vez: nome/empresa; unidade/local e contato local; contrato ativo ou equipamento já atendido pela Life (aceitar "não sei"); equipamento; fabricante/modelo (aceitar "não identificado"); patrimônio/série opcional; sintoma; alarme opcional; início e frequência; impacto (parado totalmente, parcialmente ou funcionando); contingência; risco para pessoas, sangue, medicamentos ou operação essencial; evidências opcionais (foto, vídeo curto ou documento, somente se seguro).

Se não houver contrato ativo ou histórico Life, não descarte nem reinicie a conversa: preserve os campos, classifique como ASSISTENCIA_AVULSA, gere protocolo comercial, crie/atualize oportunidade no Ploomes e encaminhe para o Comercial.

PRIORIDADE TÉCNICA SUGERIDA — APLICAR COM SWITCH/IF, SEM IA
- P1: risco a pessoas, sangue, medicamentos ou operação essencial E equipamento crítico parado SEM contingência. Ação: alerta imediato a técnico/plantão, exigir confirmação humana.
- P2: equipamento parado ou falha relevante com alternativa temporária ou contingência limitada. Ação: fila prioritária e confirmação rápida.
- P3: falha parcial, desempenho reduzido ou sem interrupção crítica. Ação: fila técnica regular.
- P4: preventiva, ajuste, dúvida, visita programada ou demanda administrativa. Ação: fila de planejamento/agendamento.
- Resposta vaga, contraditória, entre níveis ou risco declarado: usar provisoriamente o nível mais alto plausível e encaminhar para validação humana. A IA nunca pode reduzir prioridade, negar risco ou diagnosticar equipamento.

Apresente antes de encaminhar:
"Resumo de pré-triagem técnica\nProtocolo: {protocolo}\nCliente/empresa: {nome_empresa}\nUnidade e contato local: {unidade_contato}\nContrato: {contrato}\nEquipamento: {equipamento}\nFabricante/modelo: {fabricante_modelo}\nPatrimônio/série: {identificador}\nSintoma/alarme: {sintoma} | {alarme}\nInício e frequência: {inicio_frequencia}\nImpacto: {impacto}\nContingência: {contingencia}\nRisco informado: {risco}\nPrioridade sugerida: {P1/P2/P3/P4} - {justificativa}\nEvidências: {links ou nenhuma}\n\nResponda CONFIRMAR para encaminhar ou EDITAR para corrigir."

Após confirmação: criar protocolo antes de notificar a fila. Enviar mensagem ao cliente: "Registramos a pré-triagem sob o protocolo {protocolo} com prioridade sugerida {prioridade}. A equipe técnica vai validar as informações e retornar. Em caso de risco imediato, mantenha o local seguro e acione também os procedimentos internos de emergência da unidade." Nunca prometer tempo de atendimento.

HANDOFF, FILAS E ESCALONAMENTO
- Comercial: recebe orçamento, contratação e assistência avulsa.
- Técnico regular: recebe P3/P4 e P1/P2 em horário regular, conforme escala.
- Plantão: recebe P1/P2 fora do horário ou sem técnico elegível.
- P1: confirmação humana proposta em até 5 minutos; se não houver confirmação, chamar backup; persistindo, chamar Coordenação/Contingência.
- P2: confirmação proposta em até 15 minutos; mesma cadeia de escalonamento.
- P3/P4/Comercial: conforme horário e SLA configurados.
- Todos os alertas, confirmações, mudanças de responsável, transferências e escalonamentos precisam ficar registrados com data/hora e destinatário.

OPERAÇÃO INTERNA POR WHATSAPP
Reconheça números internos autorizados (uma tabela de perfis). O comando MENU mostra opções conforme perfil:
- Comercial: meus leads, novas oportunidades, responder cliente, atualizar oportunidade, transferir.
- Técnico: meus chamados, fila autorizada, ver anexos, responder cliente, registrar ação, transferir.
- Plantão: alertas críticos, confirmar P1/P2, meus chamados, acionar backup, registrar ação.
- Backup: casos escalados, assumir, indisponibilidade, ver resumo, responder cliente.
- Coordenação: fila técnica, P1/P2 pendentes, designar responsável, transferir, histórico, encerrar.
- Administração: equipes, números autorizados, escalas, backups, auditoria e incidentes.

Somente usuários autorizados veem protocolos e anexos. Respostas de colaboradores ao cliente são enviadas pelo número oficial Life, nunca pelo telefone pessoal. Quando um colaborador escolher RESPONDER CLIENTE, peça a mensagem, mostre prévia, peça confirmação e envie pela API Meta; grave autor, data/hora, conteúdo e status de entrega.

MÍDIA, DADOS E SEGURANÇA
- Aceite texto, imagem, áudio, PDF/DOCX/planilha e vídeo. Guarde anexos como privados no Supabase Storage; nunca use URL pública. Para acesso interno, gere URL assinada temporária e somente para perfil autorizado.
- Arquivos ilegíveis, protegidos por senha, grandes ou não permitidos devem ser encaminhados a humano sem inventar conteúdo.
- Não solicitar dados de pacientes, doadores, prontuários ou outros dados sensíveis no fluxo padrão.
- Proposta de retenção: conversas 180 dias; anexos 90 dias, sujeita à aprovação de LGPD.
- Registre auditoria imutável para: mensagem recebida/enviada, mudança de estado, coleta de campo, protocolo criado, prioridade sugerida/confirmada, handoff, responsável alterado, tentativa de integração e falha.

SUPABASE — CRIE/USE TABELAS
contacts, conversations, messages, commercial_requests, technical_tickets, handoffs, audit_events, authorized_users, schedules, routing_rules e integration_attempts.
Use IDs únicos, timestamps em UTC e RLS/controle de acesso. Em messages, imponha unicidade de meta_message_id. Em integration_attempts, armazene integração, chave de idempotência, tentativa, resultado, erro e possibilidade de reprocessamento.

ERROS E CONTINGÊNCIA
Encaminhe para humano e registre falha se ocorrer: baixa confiança após uma tentativa de esclarecimento; pedido de diagnóstico/procedimento perigoso; preço final/prazo garantido; cancelamento/reclamação grave/direito de dados; falha em Supabase, Ploomes, Meta ou fila. Nunca crie duplicidade em reentrega da Meta. Nunca reenvie automaticamente erro 130497 da Meta; significa que a conta empresarial está restringida de falar com usuários naquele país e exige revisão da conta Meta.

OPENAI (OPCIONAL)
Use somente depois das regras determinísticas, para: resumir texto livre, extrair campos já definidos e sinalizar baixa confiança. Passe o mínimo de dados. O retorno deve ser JSON validado antes de persistir. Não usar OpenAI para escolher rota sem confirmação, definir prioridade, analisar risco, autorizar acesso, diagnosticar ou mandar instrução técnica.

ENTREGA ESPERADA
Construa o workflow modularmente com subworkflows: validação Meta, normalização/deduplicação, máquina de estados do cliente, comercial, técnico, integração Meta de saída, persistência Supabase, Ploomes, mídia, operação interna, auditoria e escalonamento. Nomeie cada nó em português. Inclua nós de teste/manual com exemplos de mensagem comercial, P1, P2, cliente sem contrato, pedido de humano, duplicidade e falha 130497. Antes de ativar, deixe claramente marcados os campos que precisam ser preenchidos: tokens Meta, URL/credenciais Supabase, WABA/phone_number_id, números internos, responsáveis, backups, horários e regras de roteamento.
```

## Estado real do repositório

O projeto atual já possui uma base TypeScript/Fastify de webhook, deduplicação, menu inicial/comercial, Supabase, cliente Meta, Ploomes, OpenAI e uma configuração administrativa. O fluxo técnico completo, a operação interna, mídia, filas e escalonamentos continuam sendo regras/especificações a concluir. Portanto, o workflow do n8n deve ser tratado inicialmente como ambiente de teste/homologação, não como substituição automática de todo o backend em produção.
