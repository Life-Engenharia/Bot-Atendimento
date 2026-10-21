-- Checkpoint de processamento para que uma retentativa recupere mensagens
-- persistidas antes de uma falha, sem repetir turnos já concluídos.
alter table public.messages
  add column if not exists processed_at timestamptz;

-- A mesma confirmação não pode criar protocolos duplicados em uma retentativa.
alter table public.protocols
  add column if not exists source_message_id text;

create unique index if not exists protocols_source_message_id_uidx
  on public.protocols (source_message_id)
  where source_message_id is not null;

create or replace function public.persist_conversation_turn(
  p_conversation_id uuid,
  p_state public.conversation_state,
  p_route public.conversation_route,
  p_context jsonb,
  p_meta_message_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set state = p_state,
      route = p_route,
      destination_area = p_route,
      context = p_context,
      updated_at = now()
  where id = p_conversation_id;

  if not found then
    raise exception 'Conversa % não encontrada', p_conversation_id;
  end if;

  update public.messages
  set conversation_id = p_conversation_id,
      processed_at = coalesce(processed_at, now())
  where meta_message_id = p_meta_message_id
    and direction = 'inbound';

  if not found then
    raise exception 'Mensagem recebida % não encontrada', p_meta_message_id;
  end if;
end;
$$;

revoke all on function public.persist_conversation_turn(
  uuid, public.conversation_state, public.conversation_route, jsonb, text
) from public, anon, authenticated;
grant execute on function public.persist_conversation_turn(
  uuid, public.conversation_state, public.conversation_route, jsonb, text
) to service_role;
