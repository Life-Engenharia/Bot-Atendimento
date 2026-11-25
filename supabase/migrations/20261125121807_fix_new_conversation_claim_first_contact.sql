-- A webhook claim runs before the queued message processor, so first-time
-- senders may not exist in contacts yet. Create the contact atomically before
-- attempting to find or create a conversation.
create or replace function public.claim_new_conversation_notification(
  p_meta_message_id text,
  p_phone_e164 text
) returns table(conversation jsonb)
language plpgsql security definer set search_path = public as $$
declare
  linked_conversation uuid;
  customer_id uuid;
  active_conversation public.conversations%rowtype;
  inserted_cycle uuid;
begin
  select m.conversation_id into linked_conversation
  from public.messages m where m.meta_message_id = p_meta_message_id;
  if linked_conversation is not null then return; end if;

  insert into public.contacts(phone_e164)
  values(p_phone_e164)
  on conflict(phone_e164) do update set phone_e164 = excluded.phone_e164
  returning id into customer_id;

  select * into active_conversation from public.conversations c
  where c.contact_id = customer_id and c.state <> 'closed'
  order by c.updated_at desc limit 1 for update;
  if found then return; end if;

  select * into active_conversation from public.conversations c
  where c.contact_id = customer_id and c.state = 'closed'
  order by c.updated_at desc limit 1 for update;
  if found then
    update public.conversations set state = 'consent', route = null, context = '{}'::jsonb,
      assigned_operator = null, assigned_user_id = null, assigned_at = null,
      resolution_note = null, updated_at = now()
    where id = active_conversation.id returning * into active_conversation;
  else
    insert into public.conversations(contact_id, state, context)
    values(customer_id, 'consent', '{}'::jsonb) returning * into active_conversation;
  end if;

  insert into public.conversation_notification_cycles(conversation_id, opened_by_message_id)
  values(active_conversation.id, p_meta_message_id)
  on conflict do nothing returning conversation_id into inserted_cycle;
  if inserted_cycle is null then return; end if;
  conversation := to_jsonb(active_conversation);
  return next;
end;
$$;

revoke all on function public.claim_new_conversation_notification(text, text) from public, anon, authenticated;
grant execute on function public.claim_new_conversation_notification(text, text) to service_role;
