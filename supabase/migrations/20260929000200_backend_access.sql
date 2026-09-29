-- Dados operacionais acessíveis somente pelo backend privilegiado.
alter table public.contacts enable row level security;
alter table public.protocols enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.audit_events enable row level security;
alter table public.commercial_requests enable row level security;

revoke all on table public.contacts, public.protocols, public.conversations,
  public.messages, public.audit_events, public.commercial_requests
  from anon, authenticated;

grant select, insert, update, delete on table public.contacts, public.protocols,
  public.conversations, public.messages, public.commercial_requests to service_role;

-- Auditoria append-only para o papel usado pela API do backend.
revoke all on table public.audit_events from service_role;
grant select, insert on table public.audit_events to service_role;
