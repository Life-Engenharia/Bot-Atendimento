alter table public.conversations
  add column context jsonb not null default '{}'::jsonb;
