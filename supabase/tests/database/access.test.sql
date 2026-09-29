begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select is(
  (select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity
   and c.relname in ('contacts', 'protocols', 'conversations', 'messages', 'audit_events', 'commercial_requests')),
  6, 'RLS habilitada nas seis tabelas operacionais'
);
select ok(not exists (
  select 1 from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and table_name in ('contacts', 'protocols', 'conversations', 'messages', 'audit_events', 'commercial_requests')
), 'Papéis públicos não têm grants operacionais');
select ok(has_table_privilege('service_role', 'public.contacts', 'INSERT'), 'Backend pode criar contatos');
select ok(has_table_privilege('service_role', 'public.audit_events', 'INSERT'), 'Backend pode registrar auditoria');
select ok(
  not has_table_privilege('service_role', 'public.audit_events', 'UPDATE')
  and not has_table_privilege('service_role', 'public.audit_events', 'DELETE')
  and not has_table_privilege('service_role', 'public.audit_events', 'TRUNCATE'),
  'Backend não pode modificar ou apagar auditoria'
);
select * from finish();
rollback;
