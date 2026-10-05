# Deploy de homologação no Google Cloud Run

Este guia publica **somente homologação**. Não configure tokens de produção nesse serviço.

## Pré-requisitos

- Projeto Google Cloud com faturamento ativo.
- `gcloud` autenticado em uma conta com permissão para Cloud Run, Cloud Build, Artifact Registry, Secret Manager e Cloud DNS (se o DNS for gerenciado no Google).
- Um subdomínio definido, por exemplo `bot-hml.seudominio.com.br`.
- Projeto Supabase de homologação e conta Meta/número destinados a teste.

## 1. Definir identificadores locais

No PowerShell, substitua os valores antes de executar:

```powershell
$projectId = "SEU_PROJECT_ID"
$region = "southamerica-east1"
$service = "bot-atendimento-hml"
$image = "$region-docker.pkg.dev/$projectId/bot-atendimento/bot-atendimento-hml:latest"
```

## 2. Ativar serviços e criar repositório de imagem

```powershell
gcloud config set project $projectId
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create bot-atendimento --repository-format=docker --location=$region --description="Imagens do Bot Atendimento"
```

Se o repositório já existir, o segundo comando retornará erro; nesse caso, prossiga sem recriá-lo.

## 3. Criar segredos

Crie versões de segredo pelo Console do Secret Manager ou pelo terminal. Nunca coloque valores em `Dockerfile`, Git ou arquivos versionados.

Segredos mínimos:

- `bot-hml-whatsapp-verify-token`
- `bot-hml-meta-app-secret`
- `bot-hml-meta-access-token`
- `bot-hml-supabase-url`
- `bot-hml-supabase-api`
- `bot-hml-whatsapp-phone-number-id`
- `bot-hml-whatsapp-business-account-id`

## 4. Build e deploy

Na raiz do projeto:

```powershell
gcloud builds submit --tag $image .

gcloud run deploy $service `
  --image $image `
  --region $region `
  --platform managed `
  --port 8080 `
  --allow-unauthenticated `
  --set-env-vars "NODE_ENV=production" `
  --set-secrets "WHATSAPP_VERIFY_TOKEN=bot-hml-whatsapp-verify-token:latest,META_APP_SECRET=bot-hml-meta-app-secret:latest,META_ACCESS_TOKEN=bot-hml-meta-access-token:latest,SUPABASE_URL=bot-hml-supabase-url:latest,SUPABASE_API=bot-hml-supabase-api:latest,WHATSAPP_PHONE_NUMBER_ID=bot-hml-whatsapp-phone-number-id:latest,WHATSAPP_BUSINESS_ACCOUNT_ID=bot-hml-whatsapp-business-account-id:latest"
```

O webhook da Meta precisa ser público; por isso o serviço usa `--allow-unauthenticated`. A proteção do endpoint é feita pela assinatura HMAC `x-hub-signature-256`, não por login de navegador.

## 5. Validar antes de apontar o domínio

Pegue a URL retornada pelo Cloud Run e teste:

```powershell
Invoke-WebRequest "https://URL_DO_CLOUD_RUN/health"
```

O retorno esperado é `{"status":"ok"}`.

## 6. URL inicial e subdomínio definitivo

Para o primeiro teste da Meta, use a URL HTTPS `run.app` retornada pelo Cloud Run. Ela já possui certificado válido e evita bloquear a homologação enquanto o DNS é preparado:

```text
https://URL_DO_CLOUD_RUN/webhooks/whatsapp
```

Para o subdomínio definitivo, por exemplo `bot-hml.seudominio.com.br`, use um **Application Load Balancer externo global** na frente do Cloud Run, com certificado gerenciado pelo Google e registro DNS apontando para o endereço IP do balanceador. Essa é a opção recomendada pelo Google para domínios personalizados no Cloud Run.

Não use o mapeamento direto de domínio do Cloud Run para este serviço em `southamerica-east1`: ele é um recurso de visualização, não é recomendado para produção e a região não consta entre as regiões compatíveis. Referência: https://cloud.google.com/run/docs/mapping-custom-domains

Após o DNS e o certificado estarem ativos, o callback definitivo a cadastrar na Meta será:

```text
https://bot-hml.seudominio.com.br/webhooks/whatsapp
```

## 7. Teste de webhook Meta

1. No painel Meta, informe a URL de callback acima.
2. Informe o mesmo valor de `WHATSAPP_VERIFY_TOKEN` armazenado no Secret Manager.
3. Assine o campo `messages`.
4. Envie uma mensagem de um número de teste ao número do bot.
5. Confira Cloud Run Logs, `messages` e `audit_events` no Supabase.

## Verificações de segurança

- Use exclusivamente segredos de homologação.
- Não exponha `SUPABASE_API`, tokens Meta ou `META_APP_SECRET` em logs, telas ou respostas HTTP.
- Mantenha `ADMIN_DASHBOARD_TOKEN` desativado até a dashboard administrativa ser configurada.
- Não promova a imagem de homologação a produção sem testes de webhook, assinatura e deduplicação.
