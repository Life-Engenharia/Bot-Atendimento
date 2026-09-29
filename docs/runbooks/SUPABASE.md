# Supabase: conexão e migrations

Projeto de destino: `zpgovlngrowxgdisflvx`.
Migrations canônicas: `supabase/migrations/`.
Requer Node.js 22+ e `npm install`.

## Credenciais

Preencha `.env.local`, ignorado pelo Git:

- `SUPABASE_URL`: `https://zpgovlngrowxgdisflvx.supabase.co`.
- `SUPABASE_PROJECT_REF`: `zpgovlngrowxgdisflvx`.
- `SUPABASE_API`: chave secreta de servidor da Data API, já usada neste projeto.
- `SUPABASE_ACCESS_TOKEN`: token pessoal da conta Supabase para a CLI, ou use `npx supabase login`.
- `SUPABASE_DB_PASSWORD`: senha PostgreSQL do projeto para a CLI.

A chave da Data API não executa migrations SQL. Os scripts `db:*` carregam
`.env.local` sem imprimir os valores. Não cole credenciais em comandos, commits ou chats.

## Validar e aplicar

```bash
npm run db:check
npm run db:link
npm run db:list
npm run db:plan
npm run db:push
```

`db:check` consulta apenas o catálogo da Data API, sem ler registros.
`db:plan` lista migrations pendentes sem aplicá-las; não valida a execução do SQL.
Antes do primeiro push, confirme que o banco está vazio. Se já houver tabelas ou
migrations aplicadas, reconcilie o esquema e o histórico antes de aplicar o baseline.
Em particular, se `001_initial_schema.sql` já foi executado manualmente, não execute
o baseline novamente: compare o esquema e registre a versão somente após confirmar equivalência.
Não use `db reset --linked` no banco remoto.

## Desenvolvimento local

Com Docker instalado e em execução:

```bash
npx supabase start
npx supabase migration up --local
npx supabase test db
```

Para criar uma próxima migration: `npx supabase migration new nome_da_alteracao`.

## Escopo desta etapa

O baseline cria contatos, protocolos, conversas, mensagens, auditoria e pedidos
comerciais. A segunda migration ativa RLS, remove acesso de `anon` e `authenticated`
e permite acesso pelo backend com `service_role`. Auditoria aceita apenas leitura e
inserção nesse papel. Não há políticas de acesso público.

Com `SUPABASE_URL` e `SUPABASE_API` preenchidas, o webhook usa persistência no
Supabase: deduplica a mensagem recebida, registra contato, conversa, resposta
pendente de envio pela Meta e auditoria. Sem essas variáveis, ele mantém o modo
local em memória para testes. O bucket privado `protocol-attachments` guarda
anexos; a API ainda não recebe mídia da Meta.

Referências: [migrations](https://supabase.com/docs/guides/local-development/database-migrations)
e [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
