# MINUTA PARA REVISÃO JURÍDICA
## Política de privacidade e governança de dados — Central de Atendimento Life Engenharia

**Versão:** 0.1  
**Data da minuta:** 21/10/2026  
**Status:** não aprovada; sujeita à revisão jurídica, LGPD e aprovação da Life Engenharia.

> Esta minuta descreve o funcionamento planejado da Central de Atendimento. O Jurídico deve validar a identidade da controladora, bases legais, prazos, contratos com fornecedores, transferências internacionais e textos finais antes da utilização com dados reais.

## 1. Identificação e escopo

Esta política se aplica à Central de Atendimento da **Life Engenharia** (“Life”), utilizada para receber solicitações pelo WhatsApp oficial, organizar triagens, encaminhar atendimentos às equipes e acompanhar a resolução.

O documento cobre mensagens, dados cadastrais, informações técnicas, anexos, registros de atendimento, notificações internas e dados dos operadores.

**Preencher pelo Jurídico:**

- razão social completa:
- CNPJ:
- endereço:
- contato do controlador:
- encarregado/DPO e canal de contato:
- empresas do grupo abrangidas:

## 2. Papéis no tratamento

- **Controladora:** Life Engenharia, a confirmar pelo Jurídico.
- **Operadores e fornecedores:** provedores contratados para infraestrutura, mensageria, armazenamento, inteligência artificial, CRM, e-mail e hospedagem.
- **Usuários internos:** colaboradores autorizados por área, cargo e necessidade operacional.
- **Titulares:** clientes, representantes, funcionários de clientes, prestadores e demais pessoas que enviem mensagens ou apareçam nos dados do atendimento.

Os contratos com fornecedores devem definir confidencialidade, segurança, subcontratação, incidentes, exclusão/devolução de dados e cooperação com solicitações de titulares.

## 3. Dados tratados

### 3.1 Dados fornecidos pelo solicitante

- nome e telefone;
- e-mail, quando informado;
- empresa, instituição, cidade e unidade;
- contrato ou histórico informado;
- equipamento, patrimônio, número de série e sintomas;
- prazo, impacto, risco, contingência e descrição da necessidade;
- documentos, imagens, vídeos e áudios enviados voluntariamente.

### 3.2 Dados gerados pela operação

- protocolo, rota, prioridade, fila e status;
- mensagens recebidas e enviadas;
- responsável, backup, horários, transferências e confirmações;
- registros de entrega, leitura e falha de mensagens;
- auditoria, logs técnicos, tentativas de integração e histórico de alterações.

### 3.3 Dados potencialmente sensíveis

A operação pode receber informações que revelem risco à saúde, funcionamento de hospitais, sangue, medicamentos ou pessoas. O bot deve solicitar somente o mínimo necessário, não deve pedir diagnóstico médico e não deve orientar ações inseguras. O Jurídico deve confirmar a base legal e os controles adicionais quando houver dado pessoal sensível.

## 4. Finalidades

Os dados são tratados para:

1. receber e registrar solicitações;
2. confirmar consentimento ou autorização do atendimento quando aplicável;
3. realizar triagem operacional e classificar prioridade sugerida;
4. encaminhar o caso à área responsável, plantão ou contingência;
5. permitir que operadores assumam, respondam, transfiram e concluam atendimentos;
6. criar e acompanhar protocolos, oportunidades comerciais e registros técnicos;
7. enviar notificações operacionais e mensagens necessárias ao atendimento;
8. disponibilizar anexos autorizados por URLs temporárias;
9. melhorar segurança, auditoria, prevenção de fraude e continuidade do serviço;
10. cumprir obrigações legais, regulatórias, contratuais e solicitações de titulares.

Não usar os dados para publicidade, venda de listas ou treinamento genérico de modelos sem base legal, transparência e aprovação específica.

## 5. Bases legais a validar

O Jurídico deve confirmar, finalidade por finalidade, a base legal aplicável, que pode incluir execução de contrato ou procedimentos preliminares, legítimo interesse, cumprimento de obrigação legal/regulatória, exercício regular de direitos e consentimento quando necessário.

O consentimento do fluxo conversacional não substitui a análise jurídica da base legal. Quando o consentimento for utilizado, deve ser livre, informado, inequívoco, registrável e revogável.

## 6. Compartilhamento e fornecedores

### 6.1 Meta / WhatsApp Cloud API

Recebe e envia mensagens pelo número oficial da Life, incluindo texto, mídia e status de entrega. Devem ser avaliados os termos da Meta, localização do tratamento, transferência internacional e retenção aplicável.

### 6.2 Supabase

Armazena dados relacionais, mensagens, auditoria e anexos privados. O projeto deve utilizar controles de acesso, chaves protegidas, backups e URLs assinadas. Não usar buckets públicos para dados de atendimento.

### 6.3 OpenAI

Pode processar triagem assistida, transcrição de áudio e leitura/resumo de documentos quando habilitado. Enviar somente o conteúdo necessário, limitar tamanho, registrar status da análise e validar contratos, retenção, uso para treinamento e transferência internacional antes da produção.

### 6.4 Ploomes

Pode receber dados mínimos para criação ou atualização de lead/oportunidade comercial. Não enviar informações técnicas ou sensíveis que não sejam necessárias ao CRM.

### 6.5 Google Cloud e e-mail corporativo

Podem hospedar a aplicação, logs e notificações institucionais. O Jurídico/TI deve confirmar regiões, controles de acesso, retenção e contratos.

## 7. Segurança

A Life deve manter, no mínimo:

- HTTPS em produção;
- tokens e senhas em Secret Manager ou mecanismo equivalente;
- rotação e revogação de credenciais;
- autenticação de operadores e perfis por função;
- menor privilégio para filas, conversas e anexos;
- assinatura/verificação dos webhooks da Meta;
- deduplicação e auditoria de eventos;
- URLs temporárias para anexos privados;
- backups e testes periódicos de restauração;
- logs sem conteúdo sensível desnecessário;
- revisão de acessos após mudança de função ou desligamento.

## 8. Retenção proposta

Os prazos abaixo são proposta para aprovação e devem considerar obrigação legal, necessidade contratual, defesa de direitos e backup:

| Registro | Prazo proposto | Ação ao vencer |
|---|---:|---|
| Conversa e protocolo | 180 dias após encerramento | anonimizar ou excluir, conforme decisão jurídica |
| Anexos | 90 dias após encerramento | excluir do Storage privado |
| Logs de auditoria | 365 dias | revisar e eliminar/anonimizar conforme necessidade |
| Backups | conforme política corporativa | expirar de forma segura e auditável |
| Credenciais e tokens | até substituição/revogação | revogar imediatamente quando comprometidos |

Nenhum dado deve ser excluído automaticamente até que a Life aprove os prazos, a exceção de retenção legal e o procedimento de backup/restauração.

## 9. Direitos dos titulares

O canal definido pelo Jurídico deverá permitir solicitações de confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade quando aplicável, informação sobre compartilhamentos e revogação de consentimento.

Solicitações devem ser autenticadas, registradas, encaminhadas ao responsável e respondidas dentro dos prazos legais aplicáveis. O atendimento operacional não deve excluir dados diretamente sem autorização do processo de privacidade.

**Canal oficial a preencher:** ______________________________

## 10. Incidentes de segurança

Qualquer suspeita de acesso indevido, vazamento, perda, indisponibilidade ou envio incorreto deve ser registrada imediatamente. O procedimento deve conter: contenção, preservação de evidências, avaliação de risco, identificação dos titulares afetados, comunicação interna, decisão sobre comunicação à ANPD/titulares e plano de prevenção de recorrência.

**Responsável pelo incidente:** ______________________________  
**E-mail/telefone de plantão:** ______________________________

## 11. Governança e aprovação

- [ ] Dados do controlador preenchidos
- [ ] Encarregado/DPO e canal definidos
- [ ] Bases legais validadas por finalidade
- [ ] Contratos/DPAs dos fornecedores revisados
- [ ] Transferências internacionais avaliadas
- [ ] Prazos de retenção aprovados
- [ ] Procedimento de direitos dos titulares aprovado
- [ ] Plano de incidentes aprovado
- [ ] Backup e restauração testados
- [ ] Política publicada e versão registrada

**Aprovador jurídico:** ______________________________  
**Cargo:** ______________________________  
**Data:** ____/____/________  
**Assinatura/registro:** ______________________________

