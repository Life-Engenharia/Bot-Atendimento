-- Resiliência operacional do piloto: integrações reprocessáveis, escalonamento
-- auditável e expurgo de dados. A entrega de mensagens continua desacoplada da
-- Meta para permitir homologação local.

create table if not exists public.commercial_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null unique references public.protocols(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  external_contact_id text,
  external_deal_id text,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commercial_sync_jobs_pending_idx
  on public.commercial_sync_jobs (status, next_attempt_at)
  where status in ('pending', 'failed');

create table if not exists public.handoff_escalations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  protocol_id uuid not null references public.protocols(id) on delete cascade,
  priority priority_level not null check (priority in ('P1', 'P2')),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'acknowledged', 'escalated', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  escalated_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists handoff_escalations_open_protocol_idx
  on public.handoff_escalations (protocol_id)
  where status = 'pending';
create index if not exists handoff_escalations_due_idx
  on public.handoff_escalations (status, due_at)
  where status = 'pending';

create table if not exists public.conversation_attachments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  protocol_id uuid references public.protocols(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  media_type text not null,
  source_media_id text,
  status text not null default 'stored' check (status in ('pending_connection', 'stored', 'failed')),
  error_message text,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists conversation_attachments_expiry_idx
  on public.conversation_attachments (expires_at);

alter table public.contacts add column if not exists anonymized_at timestamptz;

alter table public.commercial_sync_jobs enable row level security;
alter table public.handoff_escalations enable row level security;
alter table public.conversation_attachments enable row level security;
revoke all on public.commercial_sync_jobs, public.handoff_escalations, public.conversation_attachments from anon, authenticated;
grant select, insert, update, delete on public.commercial_sync_jobs, public.handoff_escalations, public.conversation_attachments to service_role;

drop trigger if exists commercial_sync_jobs_set_updated_at on public.commercial_sync_jobs;
create trigger commercial_sync_jobs_set_updated_at
before update on public.commercial_sync_jobs
for each row execute function public.set_updated_at();
