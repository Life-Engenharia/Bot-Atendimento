-- Cadastro permanente de CPF/CNPJ para reutilização nos próximos atendimentos.
alter table public.contacts
  add column if not exists document_type text,
  add column if not exists document_number text;

alter table public.contacts
  add constraint contacts_document_type_check
  check (document_type is null or document_type in ('cpf', 'cnpj'));

create unique index if not exists contacts_document_number_unique
  on public.contacts (document_number)
  where document_number is not null;

create index if not exists contacts_document_number_lookup
  on public.contacts (document_number);
