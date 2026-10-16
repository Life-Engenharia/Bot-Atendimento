-- Biblioteca privada para documentos que orientam a operação.
create table if not exists public.operational_documents (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  file_name text not null,
  media_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 8388608),
  category text not null check (category in ('on_call_schedule', 'procedure', 'commercial', 'technical', 'policy', 'other')),
  confidence text not null check (confidence in ('high', 'medium', 'needs_review')),
  summary text not null,
  status text not null default 'needs_review' check (status in ('ready', 'needs_review')),
  created_at timestamptz not null default now()
);

create index if not exists operational_documents_category_idx on public.operational_documents (category, created_at desc);
alter table public.operational_documents enable row level security;
revoke all on public.operational_documents from anon, authenticated;
grant select, insert on public.operational_documents to service_role;

insert into storage.buckets (id, name, public)
values ('operational-documents', 'operational-documents', false)
on conflict (id) do nothing;
