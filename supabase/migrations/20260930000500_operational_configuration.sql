create table public.operational_settings (
  key text primary key,
  value jsonb not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  protocol_id uuid references public.protocols(id),
  reason text not null,
  source_route conversation_route,
  destination_area text not null default 'human',
  initiated_by text not null,
  created_at timestamptz not null default now()
);

create index handoffs_conversation_created_at_idx
  on public.handoffs (conversation_id, created_at desc);

alter table public.operational_settings enable row level security;
alter table public.handoffs enable row level security;
revoke all on table public.operational_settings, public.handoffs from anon, authenticated;
grant select, insert, update on table public.operational_settings to service_role;
grant select, insert on table public.handoffs to service_role;
