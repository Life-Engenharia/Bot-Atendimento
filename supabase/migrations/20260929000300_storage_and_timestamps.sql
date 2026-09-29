-- Anexos permanecem privados e são acessados somente pelo backend.
insert into storage.buckets (id, name, public, file_size_limit)
values ('protocol-attachments', 'protocol-attachments', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

revoke all on table storage.objects from anon, authenticated;
grant select, insert, update, delete on table storage.objects to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function public.set_updated_at();

create trigger protocols_set_updated_at
before update on public.protocols
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();
