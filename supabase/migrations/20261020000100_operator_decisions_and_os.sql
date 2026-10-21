-- Estados operacionais confirmados por pessoas. A integração com Sankhya pode
-- preencher os mesmos campos no futuro, mas nunca deve marcar uma OS como
-- aberta antes de receber confirmação do sistema externo.
alter table public.technical_tickets
  add column if not exists service_order_number text,
  add column if not exists service_order_status text not null default 'not_opened'
    check (service_order_status in ('not_opened', 'manual_opened', 'automatic_opened')),
  add column if not exists service_order_opened_at timestamptz,
  add column if not exists service_order_opened_by text;

alter table public.commercial_requests
  add column if not exists ploomes_registered_by text,
  add column if not exists ploomes_registered_at timestamptz;

create index if not exists technical_tickets_service_order_status_idx
  on public.technical_tickets (service_order_status);
