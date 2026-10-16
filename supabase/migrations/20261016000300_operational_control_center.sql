-- Base para a central operacional: uma escala vigente por vez e alertas auditáveis.
alter table public.operational_documents
  add column if not exists is_current boolean not null default false,
  add column if not exists published_by text,
  add column if not exists published_at timestamptz;

create unique index if not exists operational_documents_one_current_schedule
  on public.operational_documents (category)
  where category = 'on_call_schedule' and is_current;

create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('missing_on_call', 'overdue_follow_up', 'unassigned_critical')),
  title text not null,
  detail text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.operational_alerts enable row level security;
revoke all on public.operational_alerts from anon, authenticated;
grant select, insert, update on public.operational_alerts to service_role;
