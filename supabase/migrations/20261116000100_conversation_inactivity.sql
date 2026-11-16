-- Controle durável da inatividade do cliente. A rotina agendada pode ser
-- executada em paralelo sem duplicar aviso ou encerramento.
create table if not exists public.conversation_inactivity (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  last_customer_activity_at timestamptz not null,
  warning_sent_at timestamptz,
  warning_claimed_at timestamptz,
  warning_claim_token uuid,
  closure_due_at timestamptz,
  closure_claimed_at timestamptz,
  closure_claim_token uuid,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists conversation_inactivity_due_idx
  on public.conversation_inactivity (last_customer_activity_at, closure_due_at)
  where closed_at is null;

alter table public.conversation_inactivity enable row level security;
revoke all on public.conversation_inactivity from public, anon, authenticated;
grant select, insert, update, delete on public.conversation_inactivity to service_role;

create or replace function public.record_customer_conversation_activity(p_conversation_id uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.conversation_inactivity (conversation_id, last_customer_activity_at)
  values (p_conversation_id, now())
  on conflict (conversation_id) do update
  set last_customer_activity_at = excluded.last_customer_activity_at,
      warning_sent_at = null, warning_claimed_at = null, warning_claim_token = null,
      closure_due_at = null, closure_claimed_at = null, closure_claim_token = null,
      closed_at = null, updated_at = now();
$$;

-- Reserva uma ação por cinco minutos. Assim, uma falha de rede pode ser
-- repetida sem deixar a conversa presa, mas execuções paralelas não duplicam mensagens.
create or replace function public.claim_due_conversation_inactivity_actions(p_limit integer default 50)
returns table(action text, conversation_id uuid, phone_e164 text, claim_token uuid)
language plpgsql security definer set search_path = public as $$
declare candidate record; token uuid; claimed integer := 0;
begin
  for candidate in
    select ci.conversation_id, ct.phone_e164,
      case when ci.warning_sent_at is not null and ci.closure_due_at <= now() then 'close'
           when ci.warning_sent_at is null and ci.last_customer_activity_at <= now() - interval '30 minutes' then 'warn' end as next_action
    from public.conversation_inactivity ci
    join public.conversations c on c.id = ci.conversation_id
    join public.contacts ct on ct.id = c.contact_id
    where ci.closed_at is null and c.state <> 'closed' and (
      (ci.warning_sent_at is null and ci.last_customer_activity_at <= now() - interval '30 minutes'
        and (ci.warning_claimed_at is null or ci.warning_claimed_at < now() - interval '5 minutes'))
      or (ci.warning_sent_at is not null and ci.closure_due_at <= now()
        and (ci.closure_claimed_at is null or ci.closure_claimed_at < now() - interval '5 minutes'))
    ) order by coalesce(ci.closure_due_at, ci.last_customer_activity_at) asc
    for update of ci skip locked
  loop
    exit when claimed >= greatest(1, least(p_limit, 100));
    token := gen_random_uuid();
    if candidate.next_action = 'warn' then
      update public.conversation_inactivity set warning_claimed_at = now(), warning_claim_token = token, updated_at = now() where conversation_inactivity.conversation_id = candidate.conversation_id;
    else
      update public.conversation_inactivity set closure_claimed_at = now(), closure_claim_token = token, updated_at = now() where conversation_inactivity.conversation_id = candidate.conversation_id;
    end if;
    action := candidate.next_action; conversation_id := candidate.conversation_id; phone_e164 := candidate.phone_e164; claim_token := token;
    claimed := claimed + 1; return next;
  end loop;
end;
$$;

create or replace function public.complete_conversation_inactivity_warning(p_conversation_id uuid, p_claim_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.conversation_inactivity set warning_sent_at = now(), closure_due_at = now() + interval '20 minutes',
    warning_claimed_at = null, warning_claim_token = null, updated_at = now()
  where conversation_id = p_conversation_id and warning_claim_token = p_claim_token and warning_sent_at is null;
  return found;
end;
$$;

create or replace function public.release_conversation_inactivity_warning(p_conversation_id uuid, p_claim_token uuid)
returns void language sql security definer set search_path = public as $$
  update public.conversation_inactivity set warning_claimed_at = null, warning_claim_token = null, updated_at = now()
  where conversation_id = p_conversation_id and warning_claim_token = p_claim_token and warning_sent_at is null;
$$;

create or replace function public.close_inactive_conversation(p_conversation_id uuid, p_claim_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare linked_protocol_id uuid;
begin
  update public.conversations c set state = 'closed', assigned_operator = null, assigned_user_id = null,
    assigned_at = null, follow_up_at = null,
    resolution_note = 'Encerrado automaticamente por inatividade do cliente.', updated_at = now()
  from public.conversation_inactivity ci
  where c.id = p_conversation_id and ci.conversation_id = c.id and c.state <> 'closed'
    and ci.warning_sent_at is not null and ci.closure_due_at <= now() and ci.closure_claim_token = p_claim_token
  returning c.protocol_id into linked_protocol_id;
  if not found then return false; end if;
  update public.conversation_inactivity set closed_at = now(), closure_claimed_at = null, closure_claim_token = null, updated_at = now()
  where conversation_id = p_conversation_id;
  if linked_protocol_id is not null then
    update public.protocols set status = 'closed', updated_at = now() where id = linked_protocol_id and status <> 'closed';
  end if;
  return true;
end;
$$;

revoke all on function public.record_customer_conversation_activity(uuid) from public, anon, authenticated;
revoke all on function public.claim_due_conversation_inactivity_actions(integer) from public, anon, authenticated;
revoke all on function public.complete_conversation_inactivity_warning(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_conversation_inactivity_warning(uuid, uuid) from public, anon, authenticated;
revoke all on function public.close_inactive_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_customer_conversation_activity(uuid) to service_role;
grant execute on function public.claim_due_conversation_inactivity_actions(integer) to service_role;
grant execute on function public.complete_conversation_inactivity_warning(uuid, uuid) to service_role;
grant execute on function public.release_conversation_inactivity_warning(uuid, uuid) to service_role;
grant execute on function public.close_inactive_conversation(uuid, uuid) to service_role;
