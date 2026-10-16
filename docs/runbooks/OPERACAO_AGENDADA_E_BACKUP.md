# Operação agendada, backup e recuperação

## Alertas a cada 10 minutos

Depois da publicação no Cloud Run, crie um Cloud Scheduler que faça `POST` em
`/api/admin/jobs/alerts`. Use autenticação OIDC de uma service account e
proteja o serviço com IAP. O endpoint é idempotente: repetir a chamada não
duplica alertas ainda abertos.

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
