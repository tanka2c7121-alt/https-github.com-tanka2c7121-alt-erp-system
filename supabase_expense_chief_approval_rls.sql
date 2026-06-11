-- Allow CHIEF / 총괄관리 users to see and process pending expense requests.
-- Run this once in Supabase SQL Editor if RLS is enabled.

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
      )
      and is_active = true
      and (
        role in ('ADMIN', 'CHIEF')
        or btrim(coalesce(approval_role, '')) in ('관리자', '총괄관리')
      )
  )
$$;

grant execute on function public.current_app_user_can_approve_expenses() to authenticated;

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
    public.current_app_user_can_approve_expenses()
    and status in ('승인대기', '총괄관리 승인대기', '관리자 승인대기')
  )
);

create policy expense_requests_update_scope
on public.expense_requests
for update
to authenticated
using (
  public.current_app_user_is_admin()
  or requested_by = public.current_app_user_id()
  or (
    public.current_app_user_can_approve_expenses()
    and status in ('승인대기', '총괄관리 승인대기', '관리자 승인대기')
  )
)
with check (
  public.current_app_user_is_admin()
  or requested_by = public.current_app_user_id()
  or public.current_app_user_can_approve_expenses()
);
