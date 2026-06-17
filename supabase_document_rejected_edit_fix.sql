-- Allow authors to edit rejected document rows and resubmit them.
-- Run once in Supabase SQL Editor after the document/RLS scripts.

alter table if exists public.attendance_requests enable row level security;
alter table if exists public.incident_reports enable row level security;
alter table if exists public.expense_requests enable row level security;

drop policy if exists expense_requests_update_scope on public.expense_requests;

create policy expense_requests_update_scope
on public.expense_requests
for update
to authenticated
using (
  public.current_app_user_is_admin()
  or (
    lower(requested_by) = lower(public.current_app_user_id())
    and status = '반려'
  )
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
  or (
    lower(requested_by) = lower(public.current_app_user_id())
    and status in ('부서장 승인대기', '총괄관리 승인대기', '관리자 승인대기')
  )
  or (
    public.current_app_user_role() = 'CHIEF'
    and status in ('총괄관리 승인대기', '관리자 승인대기', '승인완료', '반려')
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status in ('총괄관리 승인대기', '반려')
  )
);

drop policy if exists attendance_requests_update_scope on public.attendance_requests;

create policy attendance_requests_update_scope
on public.attendance_requests
for update
to authenticated
using (
  public.current_app_user_is_admin()
  or (
    lower(requested_by) = lower(public.current_app_user_id())
    and status = '반려'
  )
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
    lower(requested_by) = lower(public.current_app_user_id())
    and status in (
      '부서장 승인대기',
      '총괄관리 승인대기',
      '관리부 확인대기',
      '관리자 승인대기'
    )
  )
  or (
    public.current_app_user_role() = 'CHIEF'
    and status in ('총괄관리 승인대기', '관리자 승인대기', '반려')
  )
  or (
    public.current_app_user_role() = 'LEADER'
    and status in ('총괄관리 승인대기', '반려')
  )
);

drop policy if exists "incident_reports_update_check" on public.incident_reports;

create policy "incident_reports_update_check"
on public.incident_reports
for update
to authenticated
using (
  public.current_app_user_role() = 'ADMIN'
  or public.current_app_user_department() = '관리부'
  or (
    lower(requested_by) = lower(public.current_app_user_id())
    and status = '반려'
  )
)
with check (
  public.current_app_user_role() = 'ADMIN'
  or public.current_app_user_department() = '관리부'
  or (
    lower(requested_by) = lower(public.current_app_user_id())
    and status = '확인대기'
  )
);
