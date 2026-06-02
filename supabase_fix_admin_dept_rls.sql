-- Fix admin-department write permission checks for catalog/settings data.
-- Run this once in the Supabase SQL editor if "관리부" users cannot add catalog rows.
-- This accepts either a linked auth_uid or a matching login email(user_id), so older users are covered too.

alter table if exists public.app_users
add column if not exists auth_uid uuid;

update public.app_users app
set auth_uid = auth_user.id
from auth.users auth_user
where lower(app.user_id) = lower(auth_user.email)
  and app.auth_uid is null;

create or replace function public.current_app_user_approval_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(approval_role, case when role = 'ADMIN' then '관리자' else '직원' end)
  from public.app_users
  where (
      auth_uid = auth.uid()
      or lower(user_id) = lower(auth.jwt() ->> 'email')
    )
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
    where (
        auth_uid = auth.uid()
        or lower(user_id) = lower(auth.jwt() ->> 'email')
      )
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

select
  user_id,
  user_name,
  department,
  approval_role,
  role,
  is_active,
  case when auth_uid is null then 'NOT LINKED' else 'LINKED' end as auth_link_status
from public.app_users
where role = 'ADMIN'
   or btrim(coalesce(department, '')) = '관리부'
   or btrim(coalesce(approval_role, '')) in ('관리부', '관리자')
order by user_name;
