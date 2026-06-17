-- Fix expense request submit failures caused by stale status constraints/RLS.
-- Run once in Supabase SQL Editor.

alter table if exists public.expense_requests enable row level security;

alter table if exists public.expense_requests
add column if not exists requested_department text,
add column if not exists department_approved_by text,
add column if not exists department_approved_name text,
add column if not exists department_approved_at timestamptz,
add column if not exists chief_approved_by text,
add column if not exists chief_approved_name text,
add column if not exists chief_approved_at timestamptz,
add column if not exists final_approved_by text,
add column if not exists final_approved_name text,
add column if not exists final_approved_at timestamptz;

alter table if exists public.expense_requests
drop constraint if exists expense_requests_status_check;

alter table if exists public.expense_requests
add constraint expense_requests_status_check
check (
  status in (
    '승인대기',
    '부서장 승인대기',
    '총괄관리 승인대기',
    '관리자 승인대기',
    '승인완료',
    '반려'
  )
);

create index if not exists expense_requests_requested_department_idx
on public.expense_requests (requested_department);

create or replace function public.current_app_user_can_approve_expenses()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where (
        auth_uid = auth.uid()
        or lower(user_id) = lower(auth.jwt() ->> 'email')
        or lower(user_id) = lower(auth.jwt() ->> 'sub')
      )
      and is_active = true
      and (
        role in ('ADMIN', 'CHIEF', 'LEADER')
        or btrim(coalesce(approval_role, '')) in ('관리자', '총괄관리', '부서장')
      )
  )
$$;

grant execute on function public.current_app_user_can_approve_expenses() to authenticated;

drop policy if exists expense_requests_insert_own on public.expense_requests;

create policy expense_requests_insert_own
on public.expense_requests
for insert
to authenticated
with check (
  public.current_app_user_id() is not null
  and lower(requested_by) = lower(public.current_app_user_id())
);

drop policy if exists expense_requests_select_scope on public.expense_requests;
drop policy if exists expense_requests_update_scope on public.expense_requests;

create policy expense_requests_select_scope
on public.expense_requests
for select
to authenticated
using (
  public.current_app_user_is_admin()
  or lower(requested_by) = lower(public.current_app_user_id())
  or (
    public.current_app_user_role() = 'CHIEF'
    and (
      status in ('총괄관리 승인대기', '관리자 승인대기')
      or (status = '부서장 승인대기' and requested_department = '관리부')
    )
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status = '부서장 승인대기'
    and requested_department = public.current_app_user_department()
  )
);

create policy expense_requests_update_scope
on public.expense_requests
for update
to authenticated
using (
  public.current_app_user_is_admin()
  or lower(requested_by) = lower(public.current_app_user_id())
  or (
    public.current_app_user_role() = 'CHIEF'
    and (
      status in ('총괄관리 승인대기', '관리자 승인대기')
      or (status = '부서장 승인대기' and requested_department = '관리부')
    )
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status = '부서장 승인대기'
    and requested_department = public.current_app_user_department()
  )
)
with check (
  public.current_app_user_is_admin()
  or lower(requested_by) = lower(public.current_app_user_id())
  or (
    public.current_app_user_role() = 'CHIEF'
    and status in ('총괄관리 승인대기', '관리자 승인대기', '승인완료', '반려')
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status in ('총괄관리 승인대기', '반려')
  )
);
