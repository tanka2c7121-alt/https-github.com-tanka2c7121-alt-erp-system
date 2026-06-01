-- app_users.role 4단계 권한 적용
-- ADMIN: 관리자
-- CHIEF: 총괄관리
-- LEADER: 부서장
-- STAFF: 일반직원

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format(
      'alter table public.app_users drop constraint if exists %I',
      constraint_record.conname
    );
  end loop;
end $$;

alter table public.app_users
add constraint app_users_role_check
check (role in ('ADMIN', 'CHIEF', 'LEADER', 'STAFF'));

update public.app_users
set role = 'STAFF'
where role is null
   or role not in ('ADMIN', 'CHIEF', 'LEADER', 'STAFF');

create or replace function public.current_app_user_is_admin()
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
      and role = 'ADMIN'
  )
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
        role in ('ADMIN', 'CHIEF')
        or approval_role in ('관리부', '관리자')
      )
  )
$$;

grant execute on function public.current_app_user_is_admin() to authenticated;
grant execute on function public.current_app_user_is_admin_dept() to authenticated;
