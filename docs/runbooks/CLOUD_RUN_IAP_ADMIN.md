# Proteção do painel administrativo com IAP

## Modelo adotado

O painel é interno. O colaborador entra com sua conta Google corporativa; o
Identity-Aware Proxy (IAP) bloqueia qualquer pessoa que não esteja autorizada
antes de a requisição chegar ao Cloud Run.

Não publique o painel em uma porta/IP local nem conceda `allUsers` ao serviço.

## Configuração no Google Cloud

1. Publique o serviço administrativo no Cloud Run **sem acesso público**.
2. Em **Cloud Run > serviço > Security**, habilite IAP diretamente no serviço.
3. Em **IAP > Cloud Run**, conceda `IAP-secured Web App User` apenas ao grupo
   corporativo, por exemplo `atendimento@life.eng.br`, ou aos e-mails individuais.
4. Em **Networking**, use ingress `Internal and Cloud Load Balancing` quando
   houver balanceador; sem balanceador, mantenha IAP direto e não adicione
   `allUsers` como Cloud Run Invoker.
5. Não exponha `SUPABASE_API`, `SMTP_PASSWORD`, tokens Meta ou token admin no
   navegador. Use Secret Manager/variáveis do Cloud Run.

## Acesso sem domínio próprio

O endereço HTTPS padrão `run.app` funciona com IAP e não exige domínio. O
domínio serve apenas para um endereço mais fácil de memorizar.

## Matriz de acesso da aplicação

- Administração: configurações, equipe, documentos e auditoria.
- Coordenação: escala vigente, alertas e visão operacional.
- Técnico/Plantão: escala e atendimentos de sua área.
- Comercial: atendimentos e retornos comerciais.
- Consulta: somente leitura.

## Verificação após publicar

1. Uma conta autorizada abre o painel após login Google.
2. Uma conta não autorizada recebe bloqueio do IAP.
3. O URL do Cloud Run não contém `allUsers` em suas permissões.
4. A API administrativa responde somente depois do proxy IAP.
