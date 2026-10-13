alter table public.conversations
  add column if not exists follow_up_at timestamptz,
  add column if not exists resolution_note text;

create table if not exists public.operator_notes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  author text not null,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists operator_notes_conversation_created_idx
  on public.operator_notes(conversation_id, created_at desc);

alter table public.operator_notes enable row level security;
create policy "service role manages operator notes" on public.operator_notes
  for all to service_role using (true) with check (true);
