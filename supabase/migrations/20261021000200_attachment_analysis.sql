alter table public.conversation_attachments
  add column if not exists analysis_status text not null default 'not_requested'
    check (analysis_status in ('not_requested', 'completed', 'needs_review', 'failed')),
  add column if not exists extracted_text text,
  add column if not exists analysis_error text;
