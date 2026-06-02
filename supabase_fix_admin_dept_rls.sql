-- Fix admin-department write permission checks for catalog/settings data.
-- Run this once in the Supabase SQL editor if "관리부" users cannot add catalog rows.

create or replace function public.current_app_user_approval_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(approval_role, case when role = 'ADMIN' then '관리자' else '직원' end)
  from public.app_users
  where auth_uid = auth.uid()
    and is_active = true
  limit 1
$$;

create or replace function public.current_app_user_is_admin_dept()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where auth_uid = auth.uid()
      and is_active = true
      and (
        role = 'ADMIN'
        or btrim(coalesce(department, '')) = '관리부'
        or btrim(coalesce(approval_role, '')) in ('관리부', '관리자')
      )
  )
$$;

grant execute on function public.current_app_user_approval_role() to authenticated;
grant execute on function public.current_app_user_is_admin_dept() to authenticated;
