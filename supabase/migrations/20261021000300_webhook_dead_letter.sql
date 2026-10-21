-- Evita retry infinito de eventos que falham por payload inválido ou erro permanente.
alter table if exists public.webhook_jobs
  drop constraint if exists webhook_jobs_status_check;

alter table if exists public.webhook_jobs
  add constraint webhook_jobs_status_check
  check (status in ('queued', 'processing', 'completed', 'failed'));

create index if not exists webhook_jobs_failed_idx
  on public.webhook_jobs (status, completed_at)
  where status = 'failed';
