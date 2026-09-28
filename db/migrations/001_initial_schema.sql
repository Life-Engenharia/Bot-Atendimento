create extension if not exists pgcrypto;

create type conversation_route as enum ('commercial', 'technical', 'human');
create type conversation_state as enum ('started', 'consent', 'route', 'collecting', 'review', 'queued', 'human', 'closed');
create type protocol_type as enum ('commercial', 'technical');
create type protocol_status as enum ('new', 'awaiting_confirmation', 'in_progress', 'awaiting_customer', 'resolved', 'closed');
create type priority_level as enum ('P1', 'P2', 'P3', 'P4');

create table contacts (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  name text,
  company text,
  email text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table protocols (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  type protocol_type not null,
  status protocol_status not null default 'new',
  suggested_priority priority_level,
  confirmed_priority priority_level,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id),
  protocol_id uuid references protocols(id),
  route conversation_route,
  state conversation_state not null default 'started',
  assigned_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_active_conversation_per_contact
  on conversations (contact_id)
  where state not in ('closed');

create table messages (
  id uuid primary key default gen_random_uuid(),
  meta_message_id text not null unique,
  conversation_id uuid references conversations(id),
  direction text not null check (direction in ('inbound', 'outbound')),
  content text,
  delivery_status text,
  received_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid references protocols(id),
  actor text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  rule_version text not null default 'v1',
  occurred_at timestamptz not null default now()
);

create table commercial_requests (
  protocol_id uuid primary key references protocols(id),
  service text not null,
  location text not null,
  timeline text not null,
  need text not null check (char_length(need) <= 1000),
  ploomes_id text,
  status text not null default 'queued'
);
