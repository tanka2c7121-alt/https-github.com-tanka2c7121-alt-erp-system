-- 직원현황을 비상연락망처럼 사용할 수 있도록 필요한 연락처 컬럼만 공개 조회합니다.
-- Supabase SQL Editor에서 실행하세요.

create or replace function public.get_employee_contacts()
returns table (
  id bigint,
  user_id text,
  user_name text,
  department text,
  phone_number text,
  role text,
  is_active boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    app_users.id::bigint,
    app_users.user_id,
    app_users.user_name,
    app_users.department,
    app_users.phone_number,
    app_users.role,
    app_users.is_active,
    app_users.created_at
  from public.app_users
  order by app_users.department asc nulls last, app_users.user_name asc nulls last;
$$;

grant execute on function public.get_employee_contacts() to authenticated;
