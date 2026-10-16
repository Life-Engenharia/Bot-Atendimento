alter table public.operational_documents
  add column if not exists on_call_date text,
  add column if not exists on_call_members text;
