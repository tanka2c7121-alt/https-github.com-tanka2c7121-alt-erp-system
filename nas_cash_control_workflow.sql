-- NAS PostgreSQL migration for cash-control workflow.
-- Run this on the NAS database, not in Supabase.
--
-- Adds:
-- - source_key based duplicate prevention for daily_cash
-- - ledger_effective flag for balance-safe display rows
-- - settlement refund tracking columns
-- - cash_change_requests approval queue for refunds, corrections, and reopen requests

begin;

alter table if exists public.daily_cash
add column if not exists source_key text,
add column if not exists source_detail_id bigint,
add column if not exists ledger_effective boolean not null default true,
add column if not exists approval_status text not null default 'approved',
add column if not exists correction_note text;

update public.daily_cash
set ledger_effective = true
where ledger_effective is null;

update public.daily_cash
set approval_status = 'approved'
where approval_status is null or approval_status = '';

create unique index if not exists daily_cash_source_key_unique_idx
on public.daily_cash (source_key)
where source_key is not null;

create index if not exists daily_cash_source_detail_idx
on public.daily_cash (source_type, source_detail_id);

create index if not exists daily_cash_ledger_effective_idx
on public.daily_cash (ledger_effective);

alter table if exists public.settlement_payments
add column if not exists refund_requested boolean not null default false,
add column if not exists refund_status text not null default 'none',
add column if not exists refund_requested_at timestamptz,
add column if not exists refund_requested_by text,
add column if not exists refund_requested_name text,
add column if not exists refund_approved_at timestamptz,
add column if not exists refund_approved_by text,
add column if not exists refund_approved_name text,
add column if not exists refund_daily_cash_id bigint,
add column if not exists refund_reason text;

update public.settlement_payments
set refund_requested = false
where refund_requested is null;

update public.settlement_payments
set refund_status = 'none'
where refund_status is null or refund_status = '';

create table if not exists public.cash_change_requests (
  id bigserial primary key,
  request_type text not null,
  status text not null default 'pending',
  source_type text,
  source_work_name text,
  source_detail_id bigint,
  source_key text,
  target_table text,
  target_id bigint,
  title text not null,
  reason text,
  before_payload jsonb,
  requested_payload jsonb,
  requested_by text,
  requested_name text,
  requested_at timestamptz not null default now(),
  approved_by text,
  approved_name text,
  approved_at timestamptz,
  rejected_by text,
  rejected_name text,
  rejected_at timestamptz,
  reject_reason text
);

alter table if exists public.cash_change_requests
add column if not exists request_type text,
add column if not exists status text default 'pending',
add column if not exists source_type text,
add column if not exists source_work_name text,
add column if not exists source_detail_id bigint,
add column if not exists source_key text,
add column if not exists target_table text,
add column if not exists target_id bigint,
add column if not exists title text,
add column if not exists reason text,
add column if not exists before_payload jsonb,
add column if not exists requested_payload jsonb,
add column if not exists requested_by text,
add column if not exists requested_name text,
add column if not exists requested_at timestamptz default now(),
add column if not exists approved_by text,
add column if not exists approved_name text,
add column if not exists approved_at timestamptz,
add column if not exists rejected_by text,
add column if not exists rejected_name text,
add column if not exists rejected_at timestamptz,
add column if not exists reject_reason text;

update public.cash_change_requests
set status = 'pending'
where status is null or status = '';

update public.cash_change_requests
set requested_at = now()
where requested_at is null;

create index if not exists cash_change_requests_status_idx
on public.cash_change_requests (status, requested_at desc);

create index if not exists cash_change_requests_source_idx
on public.cash_change_requests (source_type, source_work_name, source_detail_id);

create unique index if not exists cash_change_requests_pending_source_key_idx
on public.cash_change_requests (source_key)
where source_key is not null and status = 'pending';

commit;
