-- Preserva recibos da Meta que chegam antes da gravação da mensagem de saída.
create table if not exists public.pending_meta_delivery_statuses (
  meta_message_id text primary key,
  delivery_status text not null,
  error text,
  received_at timestamptz not null default now()
);

alter table public.pending_meta_delivery_statuses enable row level security;
revoke all on table public.pending_meta_delivery_statuses from public, anon, authenticated;
grant select, insert, update, delete on table public.pending_meta_delivery_statuses to service_role;

create or replace function public.record_meta_delivery_status(
  p_meta_message_id text,
  p_status text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
  normalized_status text;
begin
  normalized_status := case when p_error is null or p_error = '' then p_status
    else left(p_status || ': ' || p_error, 500) end;
  perform pg_advisory_xact_lock(hashtextextended(p_meta_message_id, 0));

  update public.messages
  set delivery_status = normalized_status
  where meta_message_id = p_meta_message_id and direction = 'outbound';
  get diagnostics changed = row_count;

  if changed = 0 then
    insert into public.pending_meta_delivery_statuses(meta_message_id, delivery_status, error)
    values (p_meta_message_id, normalized_status, p_error)
    on conflict (meta_message_id) do update
      set delivery_status = excluded.delivery_status,
          error = excluded.error,
          received_at = now();
  else
    delete from public.pending_meta_delivery_statuses where meta_message_id = p_meta_message_id;
  end if;
  return true;
end;
$$;

create or replace function public.persist_outbound_message(
  p_conversation_id uuid,
  p_meta_message_id text,
  p_content text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending public.pending_meta_delivery_statuses%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_meta_message_id, 0));
  insert into public.messages(meta_message_id, conversation_id, direction, content, delivery_status)
  values (p_meta_message_id, p_conversation_id, 'outbound', p_content, p_status)
  on conflict (meta_message_id) do nothing;

  select * into pending from public.pending_meta_delivery_statuses
  where meta_message_id = p_meta_message_id for update;
  if found then
    update public.messages
    set delivery_status = pending.delivery_status,
        conversation_id = p_conversation_id,
        content = p_content
    where meta_message_id = p_meta_message_id and direction = 'outbound';
    delete from public.pending_meta_delivery_statuses where meta_message_id = p_meta_message_id;
  end if;

  update public.conversations set updated_at = now() where id = p_conversation_id;
end;
$$;

revoke all on function public.record_meta_delivery_status(text, text, text) from public, anon, authenticated;
revoke all on function public.persist_outbound_message(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_meta_delivery_status(text, text, text) to service_role;
grant execute on function public.persist_outbound_message(uuid, text, text, text) to service_role;
