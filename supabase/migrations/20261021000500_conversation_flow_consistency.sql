-- Ao cancelar pelo WhatsApp, encerra também o protocolo e remove atribuições
-- para que o caso não permaneça ativo ou preso na fila de um operador.
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
declare
  linked_protocol_id uuid;
begin
  update public.conversations
  set state = p_state,
      route = p_route,
      destination_area = p_route,
      context = p_context,
      updated_at = now(),
      assigned_operator = case when p_state = 'closed' then null else assigned_operator end,
      assigned_at = case when p_state = 'closed' then null else assigned_at end,
      assigned_user_id = case when p_state = 'closed' then null else assigned_user_id end,
      follow_up_at = case when p_state = 'closed' then null else follow_up_at end
  where id = p_conversation_id
  returning protocol_id into linked_protocol_id;

  if not found then
    raise exception 'Conversa % não encontrada', p_conversation_id;
  end if;

  if p_state = 'closed' and linked_protocol_id is not null then
    update public.protocols
    set status = 'closed', updated_at = now()
    where id = linked_protocol_id and status <> 'closed';
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
