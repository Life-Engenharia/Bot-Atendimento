# Operação agendada, backup e recuperação

## Alertas a cada 10 minutos

Depois da publicação no Cloud Run, crie um Cloud Scheduler que faça `POST` em
`/api/admin/jobs/alerts`. Use autenticação OIDC de uma service account e
proteja o serviço com IAP. O endpoint é idempotente: repetir a chamada não
duplica alertas ainda abertos.

## Retenção LGPD

A referência inicial é 180 dias para conteúdo de conversas fechadas e 90 dias
para anexos. Antes de executar exclusão, a Life deve registrar em
`privacidade` no painel: `approved=true`, `approvedAt` e `approvedBy`.

Execute inicialmente em modo de simulação:

```text
POST /api/admin/jobs/retention
Authorization: Bearer <ADMIN_DASHBOARD_TOKEN>
{}
```

O resultado informa quantas conversas seriam anonimizadas e anexos excluídos.
Após aprovação jurídica e evidência do backup/restauração, execute com
`{"dryRun":false}`. A rotina remove anexos privados vencidos, apaga o conteúdo
das mensagens e anonimiza contatos sem atividade recente; protocolos e a trilha
de auditoria permanecem para rastreabilidade.

## Incidente de dados

1. Interrompa os acessos e revogue tokens potencialmente expostos.
2. Preserve logs, hora, usuários afetados e evidências sem copiar dados para canais inseguros.
3. Avise o responsável de segurança/LGPD da Life e classifique o impacto.
4. Corrija o acesso, teste a restauração em ambiente isolado e documente a decisão de notificação.
5. Registre causa, alcance, medidas tomadas e ações preventivas na auditoria operacional.

## Backup e restauração

1. Habilite os backups/PITR disponíveis no plano Supabase contratado.
2. Exporte mensalmente a estrutura e dados operacionais para armazenamento
   privado, com retenção definida pela política LGPD da empresa.
3. Trimestralmente, restaure o backup em um projeto isolado e valide: escala
   vigente, documentos, conversas, alertas e auditoria.
4. Registre data, responsável e resultado do teste de recuperação.

## Monitoramento

Monitore `/health` e a execução do Scheduler. Trate como incidente qualquer
falha por mais de 15 minutos no webhook, banco ou processo de alertas.
