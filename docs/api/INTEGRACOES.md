# Integrações do Bot Atendimento Life

## Regra geral

Todas as integrações são chamadas exclusivamente pelo backend. Chaves nunca entram no navegador, código-fonte, logs ou documentação. Cada chamada externa deve registrar identificador de correlação, tentativa, resultado, erro e chave de idempotência.

O contrato navegável da API do bot está em `docs/api/openapi.yaml`. A interface Swagger local usa esse mesmo arquivo, portanto API e documentação não se desviam.

## Meta WhatsApp Cloud API

| Direção | Contrato do bot           | Regra                                                                                   |
| ------- | ------------------------- | --------------------------------------------------------------------------------------- |
| Entrada | `GET /webhooks/whatsapp`  | Devolve o desafio somente se `hub.verify_token` coincidir com o segredo configurado.    |
| Entrada | `POST /webhooks/whatsapp` | O adaptador valida assinatura, normaliza o evento e deduplica pelo ID da mensagem Meta. |
| Saída   | Messages API              | Envia mensagens apenas pelo número oficial da Life; salva ID e status de entrega.       |

A Cloud API requer portfólio Meta, conta WhatsApp Business e número comercial. O cliente de leitura em `src/infra/meta/whatsapp-cloud-client.ts` valida o token e o `Phone Number ID` com `npm run meta:check`. O adaptador em `src/infra/meta/whatsapp-cloud-adapter.ts` normaliza mensagens de texto do payload oficial e valida `X-Hub-Signature-256` a partir do corpo bruto; a ativação no endpoint depende do App Secret fornecido pela Life.

## Ploomes: API pública, acesso e limite

A documentação e o endpoint do Ploomes são públicos, mas isso **não comprova que o acesso esteja incluído gratuitamente no plano da Life**. A Life precisa confirmar no contrato se a API está habilitada e se há custo adicional. A integração só começa após essa confirmação.

| Aspecto        | Decisão                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Base URL       | `https://public-api2.ploomes.com`                                                                    |
| Autenticação   | Cabeçalho `User-Key`, obtido de um usuário de integração criado por administrador do Ploomes.        |
| Escopo         | `Contacts` e `Deals` para orçamento, contratação e assistência avulsa sem contrato.                  |
| Fora do escopo | Chamados técnicos, P1/P2, escalonamento e encerramento técnico.                                      |
| Consulta       | OData com `$filter`, `$select`, `$top`, `$skip`, `$orderby` e `$expand`.                             |
| Limite         | 120 requisições/minuto compartilhadas por todos os usuários de integração da conta; tratar HTTP 429. |
| Paginação      | Usar páginas de até 100 itens e selecionar apenas campos necessários.                                |
| Payload        | Máximo de 10 MB.                                                                                     |

### Fluxo comercial proposto

1. Cliente confirma o resumo comercial.
2. Bot cria o protocolo local, que é a fonte de continuidade em caso de falha.
3. Adaptador procura contato por telefone/e-mail com OData.
4. Cria ou atualiza `Contact` somente com os dados confirmados.
5. Cria ou atualiza `Deal` com serviço, unidade, necessidade, prazo e referência do protocolo Life.
6. Salva IDs externos, resultado e chave de idempotência.
7. Se Ploomes falhar, mantém o protocolo e alerta Comercial; nunca informa ao cliente que a oportunidade externa foi criada.

Antes da implementação, a Life deve fornecer: User-Key de homologação, IDs de funil/etapa, campos obrigatórios, chaves de campos personalizados e regra para localizar duplicidade.

## Supabase

Supabase fornece o PostgreSQL do bot e o armazenamento privado de anexos. Migrations em `supabase/migrations/` são a fonte de verdade para o banco. O procedimento está em `docs/runbooks/SUPABASE.md`.

- O backend usa credenciais de servidor; cliente WhatsApp nunca recebe chave privilegiada.
- Anexos ficam em bucket privado, associados ao protocolo.
- Acesso é liberado por URL assinada de vida curta somente após verificar a permissão do usuário.
- Retenção proposta, ainda pendente de validação LGPD: 180 dias para conversas/protocolos e 90 dias para anexos.

## OpenAI Responses API

O backend chama `POST /v1/responses` com chave de servidor. A integração recebe somente contexto mínimo para extrair campos, resumir a triagem e sinalizar baixa confiança.

Não pode classificar risco final, reduzir prioridade, definir SLA, realizar diagnóstico, chamar Ploomes ou Meta diretamente, alterar registros nem conceder acesso. Regras determinísticas do backend decidem estado, prioridade, handoff e permissões.

Para reduzir retenção desnecessária, a configuração de produção deve ser validada com a política de dados da Life antes de habilitar envio de conteúdo de clientes.

## Fontes oficiais

- [Ploomes API](https://developers.ploomes.com/)
- [Ploomes: como obter acesso à API](https://suporte.ploomes.com/pt-BR/articles/5452438-como-obter-acesso-a-api-do-ploomes)
- [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- [Supabase: URLs assinadas](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)
- [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
