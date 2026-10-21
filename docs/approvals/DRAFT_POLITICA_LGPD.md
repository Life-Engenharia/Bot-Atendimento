# RASCUNHO — Política de dados e retenção da Central Life

**Status:** aguardando aprovação formal da Life/LGPD  
**Versão:** 0.1  
**Responsável pela aprovação:** Administração + responsável LGPD

## 1. Finalidade

Tratar os dados necessários para receber, organizar, encaminhar e acompanhar atendimentos iniciados pelo WhatsApp oficial da Life Engenharia.

## 2. Dados tratados

- nome, telefone, e-mail e empresa/instituição informados pelo cliente;
- cidade, unidade, equipamento, patrimônio, sintomas e descrição do atendimento;
- mensagens, anexos enviados voluntariamente e transcrições/análises associadas;
- protocolo, prioridade, responsável, histórico de ações e status de entrega;
- dados de operadores necessários para autenticação e auditoria.

## 3. Finalidades e acesso

O acesso deve seguir o princípio do menor privilégio. Comercial, Técnico, Plantão, Coordenação e Administração visualizam somente filas e dados necessários à função. Anexos permanecem privados e são acessados por URL temporária autorizada.

## 4. Retenção proposta

| Categoria | Prazo inicial proposto | Destinação |
|---|---:|---|
| Conversas e protocolos | 180 dias após encerramento | anonimização ou exclusão auditada |
| Anexos | 90 dias após encerramento | exclusão do Storage privado |
| Auditoria operacional | 365 dias | retenção restrita para segurança e prestação de contas |
| Credenciais e tokens | conforme política de segurança | rotação e revogação imediata |

Os prazos acima são propostas e só entram em vigor após aprovação documentada.

## 5. Segurança e incidentes

Usar HTTPS, tokens em Secret Manager/variáveis protegidas, acesso por perfil, URLs assinadas, logs sem conteúdo sensível desnecessário e rotação de credenciais. Incidentes devem ser registrados, contidos, avaliados pelo responsável LGPD e comunicados conforme a legislação e os procedimentos internos.

## 6. Aprovação necessária

- [ ] Base legal e finalidades revisadas pela Life/LGPD
- [ ] Prazos de retenção aprovados
- [ ] Responsável por exclusão e evidência de backup definido
- [ ] Procedimento de incidente aprovado
- [ ] Data, nome, cargo e assinatura do aprovador registrados

