-- Cash control workflow for settlement payments, daily cash linking, refunds,
-- and manager approval requests.

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

update public.daily_cash
set source_detail_id = nullif(regexp_replace(source_work_name, '\D', '', 'g'), '')::bigint
where source_detail_id is null
  and source_type = 'settlement_payment'
  and false;

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

alter table if exists public.cash_change_requests enable row level security;

grant select, insert, update, delete on public.cash_change_requests to authenticated;
grant usage, select on sequence public.cash_change_requests_id_seq to authenticated;

drop policy if exists cash_change_requests_select_scope on public.cash_change_requests;
drop policy if exists cash_change_requests_insert_own on public.cash_change_requests;
drop policy if exists cash_change_requests_update_admin on public.cash_change_requests;
drop policy if exists cash_change_requests_delete_admin on public.cash_change_requests;

create policy cash_change_requests_select_scope
on public.cash_change_requests
for select
to authenticated
using (
  public.current_app_user_is_admin_dept()
  or requested_by = public.current_app_user_id()
);

create policy cash_change_requests_insert_own
on public.cash_change_requests
for insert
to authenticated
with check (
  public.current_app_user_id() is not null
  and requested_by = public.current_app_user_id()
);

create policy cash_change_requests_update_admin
on public.cash_change_requests
for update
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());

create policy cash_change_requests_delete_admin
on public.cash_change_requests
for delete
to authenticated
using (public.current_app_user_is_admin_dept());

do $$
begin
  alter publication supabase_realtime add table public.cash_change_requests;
exception
  when duplicate_object then null;
end $$;
