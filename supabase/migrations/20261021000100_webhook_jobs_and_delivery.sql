-- Processamento durável do webhook. A Meta recebe 200 logo após persistência;
-- IA, download de mídia e envio de respostas ocorrem fora da requisição HTTP.
create table if not exists public.webhook_jobs (
  id uuid primary key default gen_random_uuid(),
  meta_message_id text not null unique,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists webhook_jobs_ready_idx
  on public.webhook_jobs (status, available_at, created_at)
  where status = 'queued';

create or replace function public.claim_webhook_jobs(p_limit integer default 10)
returns setof public.webhook_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id from public.webhook_jobs
    where (status = 'queued' and available_at <= now())
      or (status = 'processing' and locked_at < now() - interval '10 minutes')
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.webhook_jobs jobs
  set status = 'processing', attempts = jobs.attempts + 1, locked_at = now()
  from picked
  where jobs.id = picked.id
  returning jobs.*;
end;
$$;

grant execute on function public.claim_webhook_jobs(integer) to service_role;
