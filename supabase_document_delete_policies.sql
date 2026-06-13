-- ERP document status/delete policy stabilization.
-- Run this once in Supabase SQL Editor after the main RLS/auth scripts.
--
-- Purpose
-- 1. Allow current Korean status values used by the app.
-- 2. Allow document deletion from the document screens.
-- 3. Keep approved expense requests protected from ordinary user deletion.

alter table if exists public.expense_requests enable row level security;
alter table if exists public.attendance_requests enable row level security;
alter table if exists public.incident_reports enable row level security;

alter table if exists public.expense_requests
  drop constraint if exists expense_requests_status_check;

alter table if exists public.expense_requests
  add constraint expense_requests_status_check
  check (status in (
    '승인대기',
    '총괄관리 승인대기',
    '관리자 승인대기',
    '승인완료',
    '반려'
  ));

alter table if exists public.attendance_requests
  drop constraint if exists attendance_requests_status_check;

alter table if exists public.attendance_requests
  add constraint attendance_requests_status_check
  check (status in (
    '부서장 승인대기',
    '관리부 확인대기',
    '관리자 승인대기',
    '승인완료',
    '반려'
  ));

alter table if exists public.incident_reports
  drop constraint if exists incident_reports_status_check;

alter table if exists public.incident_reports
  add constraint incident_reports_status_check
  check (status in (
    '확인대기',
    '확인완료',
    '반려'
  ));

drop policy if exists expense_requests_delete_admin on public.expense_requests;
drop policy if exists expense_requests_delete_scope on public.expense_requests;

create policy expense_requests_delete_scope
on public.expense_requests
for delete
to authenticated
using (
  public.current_app_user_is_admin()
  or (
    requested_by = public.current_app_user_id()
    and status <> '승인완료'
  )
);

drop policy if exists attendance_requests_delete_admin on public.attendance_requests;
drop policy if exists attendance_requests_delete_scope on public.attendance_requests;

create policy attendance_requests_delete_scope
on public.attendance_requests
for delete
to authenticated
using (
  public.current_app_user_is_admin()
  or requested_by = public.current_app_user_id()
);

drop policy if exists incident_reports_delete_scope on public.incident_reports;

create policy incident_reports_delete_scope
on public.incident_reports
for delete
to authenticated
using (
  public.current_app_user_is_admin()
  or public.current_app_user_department() = '관리부'
  or requested_by = public.current_app_user_id()
);
