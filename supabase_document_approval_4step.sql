-- 4-step document approval flow
-- ADMIN: 관리자, CHIEF: 총괄관리, LEADER: 부서장, STAFF: 직원
-- 부서는 결재권한이 아닙니다. 관리부는 다른 부서와 같은 부서명이며,
-- 관리부의 부서장 역할은 총괄관리자가 함께 수행합니다.

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

alter table if exists public.attendance_requests
drop constraint if exists attendance_requests_status_check;

alter table if exists public.attendance_requests
add constraint attendance_requests_status_check
check (
  status in (
    '부서장 승인대기',
    '총괄관리 승인대기',
    '관리부 확인대기',
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
      and role in ('ADMIN', 'CHIEF', 'LEADER')
  )
$$;

drop policy if exists expense_requests_select_scope on public.expense_requests;
drop policy if exists expense_requests_update_scope on public.expense_requests;

create policy expense_requests_select_scope
on public.expense_requests
for select
to authenticated
using (
  public.current_app_user_is_admin()
  or requested_by = public.current_app_user_id()
  or (
    public.current_app_user_role() = 'CHIEF'
    and (
      status = '총괄관리 승인대기'
      or (status = '부서장 승인대기' and requested_department = '관리부')
    )
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status = '부서장 승인대기'
    and requested_department = public.current_app_user_department()
  )
);

drop policy if exists attendance_requests_select_scope on public.attendance_requests;
drop policy if exists attendance_requests_update_scope on public.attendance_requests;

create policy attendance_requests_select_scope
on public.attendance_requests
for select
to authenticated
using (
  public.current_app_user_is_admin()
  or requested_by = public.current_app_user_id()
  or (
    public.current_app_user_role() = 'CHIEF'
    and (
      status in ('총괄관리 승인대기', '관리부 확인대기')
      or (status = '부서장 승인대기' and requested_department = '관리부')
    )
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status = '부서장 승인대기'
    and requested_department = public.current_app_user_department()
  )
);

create policy attendance_requests_update_scope
on public.attendance_requests
for update
to authenticated
using (
  public.current_app_user_is_admin()
  or (
    public.current_app_user_role() = 'CHIEF'
    and (
      status in ('총괄관리 승인대기', '관리부 확인대기')
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
  or (
    public.current_app_user_role() = 'CHIEF'
    and status in ('총괄관리 승인대기', '관리자 승인대기', '반려')
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status in ('총괄관리 승인대기', '반려')
  )
);

create policy expense_requests_update_scope
on public.expense_requests
for update
to authenticated
using (
  public.current_app_user_is_admin()
  or (
    public.current_app_user_role() = 'CHIEF'
    and (
      status = '총괄관리 승인대기'
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
  or (
    public.current_app_user_role() = 'CHIEF'
    and status in ('총괄관리 승인대기', '관리자 승인대기', '반려')
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status in ('총괄관리 승인대기', '반려')
  )
);
