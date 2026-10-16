-- Normaliza o horário exibido na trilha operacional sem perder o histórico já existente.
alter table public.audit_events add column if not exists created_at timestamptz;
update public.audit_events set created_at = occurred_at where created_at is null;
alter table public.audit_events alter column created_at set default now();
alter table public.audit_events alter column created_at set not null;

create index if not exists audit_events_created_at_idx
  on public.audit_events (created_at desc);
