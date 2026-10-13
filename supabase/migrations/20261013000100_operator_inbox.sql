-- Caixa operacional: a conversa continua no número oficial; o operador só a assume internamente.
alter table public.conversations
  add column if not exists assigned_operator text,
  add column if not exists assigned_at timestamptz;

create index if not exists conversations_operator_queue_idx
  on public.conversations (state, route, updated_at desc)
  where state in ('queued', 'human');
