-- Retenção LGPD: preserva a rastreabilidade operacional, mas remove conteúdo
-- pessoal após o prazo aprovado. A execução é chamada somente pelo backend.
create table if not exists public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  executed_at timestamptz not null default now(),
  executed_by text not null,
  dry_run boolean not null,
  conversation_cutoff timestamptz not null,
  attachment_cutoff timestamptz not null,
  conversations_anonymized integer not null default 0,
  attachments_deleted integer not null default 0
);

alter table public.retention_runs enable row level security;
revoke all on public.retention_runs from anon, authenticated;
grant select, insert on public.retention_runs to service_role;

create or replace function public.apply_lgpd_retention(
  conversation_days integer,
  attachment_days integer,
  dry_run boolean default true
)
returns table(conversations_anonymized integer, attachments_deleted integer)
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  conversation_cutoff timestamptz := now() - make_interval(days => conversation_days);
  attachment_cutoff timestamptz := now() - make_interval(days => attachment_days);
  expired_conversations uuid[];
  expired_attachments integer := 0;
  anonymized integer := 0;
begin
  if conversation_days < 30 or attachment_days < 7 then
    raise exception 'Prazos de retenção abaixo do mínimo de segurança.';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[]) into expired_conversations
  from conversations
  where state = 'closed' and updated_at < conversation_cutoff;

  select count(*) into expired_attachments
  from conversation_attachments
  where expires_at < attachment_cutoff;

  if not dry_run then
    -- Remove primeiro o arquivo privado e depois seus metadados.
    delete from storage.objects
    where bucket_id = 'protocol-attachments'
      and name in (select storage_path from conversation_attachments where expires_at < attachment_cutoff);
    delete from conversation_attachments where expires_at < attachment_cutoff;

    update messages set content = null
    where conversation_id = any(expired_conversations);
    update conversations set context = '{}'::jsonb, resolution_note = null
    where id = any(expired_conversations);
    update audit_events set payload = '{"retained":true}'::jsonb
    where protocol_id in (select protocol_id from conversations where id = any(expired_conversations) and protocol_id is not null);
    update contacts set
      phone_e164 = 'deleted-' || id::text,
      name = null, company = null, email = null, consented_at = null, anonymized_at = now()
    where id in (select distinct contact_id from conversations where id = any(expired_conversations))
      and not exists (select 1 from conversations recent where recent.contact_id = contacts.id and recent.updated_at >= conversation_cutoff);
    get diagnostics anonymized = row_count;
  else
    anonymized := cardinality(expired_conversations);
  end if;

  insert into retention_runs (executed_by, dry_run, conversation_cutoff, attachment_cutoff, conversations_anonymized, attachments_deleted)
  values ('retention-job', dry_run, conversation_cutoff, attachment_cutoff, anonymized, expired_attachments);
  return query select anonymized, expired_attachments;
end;
$$;

revoke all on function public.apply_lgpd_retention(integer, integer, boolean) from public;
grant execute on function public.apply_lgpd_retention(integer, integer, boolean) to service_role;
