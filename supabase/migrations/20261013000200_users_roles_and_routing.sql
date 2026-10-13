create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'coordination', 'commercial', 'technical', 'on_call', 'viewer')),
  area text not null check (area in ('commercial', 'technical', 'on_call', 'coordination')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations
  add column if not exists destination_area text,
  add column if not exists assigned_user_id uuid references public.app_users(id),
  add column if not exists handoff_reason text;

create table public.technical_tickets (
  protocol_id uuid primary key references public.protocols(id),
  contract_reference text,
  equipment text not null,
  manufacturer_model text not null,
  asset_identifier text,
  symptom text not null,
  alarm text,
  started_frequency text not null,
  operational_impact text not null,
  contingency text not null,
  reported_risk text not null,
  priority_reason text not null,
  confirmed_by uuid references public.app_users(id),
  confirmed_at timestamptz
);

create index conversations_destination_queue_idx
  on public.conversations (destination_area, state, updated_at desc)
  where state in ('queued', 'human');
create index app_users_area_active_idx on public.app_users (area, active);

alter table public.app_users enable row level security;
alter table public.technical_tickets enable row level security;
revoke all on public.app_users, public.technical_tickets from anon, authenticated;
grant select, insert, update on public.app_users, public.technical_tickets to service_role;

create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();
