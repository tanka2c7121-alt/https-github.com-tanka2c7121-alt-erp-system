-- 1) Run this before turning on RLS for the ERP tables.
-- 2) In Supabase Auth > Providers > Email, turn OFF email confirmation for beta use.
-- 3) Existing users should log in once before strict operation so auth_uid can be linked.

alter table if exists public.app_users
add column if not exists auth_uid uuid;

create unique index if not exists app_users_auth_uid_unique
on public.app_users (auth_uid)
where auth_uid is not null;

create or replace function public.current_app_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.app_users
  where (
      auth_uid = auth.uid()
      or lower(user_id) = lower(auth.jwt() ->> 'email')
    )
    and is_active = true
  limit 1
$$;

create or replace function public.current_app_user_department()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department
  from public.app_users
  where (
      auth_uid = auth.uid()
      or lower(user_id) = lower(auth.jwt() ->> 'email')
    )
    and is_active = true
  limit 1
$$;

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

create or replace function public.current_app_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select user_id
  from public.app_users
  where (
      auth_uid = auth.uid()
      or lower(user_id) = lower(auth.jwt() ->> 'email')
    )
    and is_active = true
  limit 1
$$;

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
    where (
        auth_uid = auth.uid()
        or lower(user_id) = lower(auth.jwt() ->> 'email')
      )
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

grant execute on function public.current_app_user_role() to authenticated;
grant execute on function public.current_app_user_department() to authenticated;
grant execute on function public.current_app_user_approval_role() to authenticated;
grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_app_user_is_admin() to authenticated;
grant execute on function public.current_app_user_is_admin_dept() to authenticated;
grant execute on function public.current_app_user_can_approve_expenses() to authenticated;

alter table if exists public.app_users enable row level security;

drop policy if exists app_users_signup_insert on public.app_users;
drop policy if exists app_users_admin_insert on public.app_users;
drop policy if exists app_users_select_self_admin on public.app_users;
drop policy if exists app_users_update_self_admin on public.app_users;
drop policy if exists app_users_delete_admin on public.app_users;

create policy app_users_signup_insert
on public.app_users
for insert
to anon, authenticated
with check (
  is_active = false
  and role = 'STAFF'
);

create policy app_users_admin_insert
on public.app_users
for insert
to authenticated
with check (public.current_app_user_is_admin());

create policy app_users_select_self_admin
on public.app_users
for select
to authenticated
using (
  auth_uid = auth.uid()
  or user_id = lower(auth.jwt() ->> 'email')
  or public.current_app_user_is_admin()
);

create policy app_users_update_self_admin
on public.app_users
for update
to authenticated
using (
  auth_uid = auth.uid()
  or user_id = lower(auth.jwt() ->> 'email')
  or public.current_app_user_is_admin()
)
with check (
  auth_uid = auth.uid()
  or user_id = lower(auth.jwt() ->> 'email')
  or public.current_app_user_is_admin()
);

create policy app_users_delete_admin
on public.app_users
for delete
to authenticated
using (public.current_app_user_is_admin());

alter table if exists public.work_orders enable row level security;
alter table if exists public.work_details enable row level security;
alter table if exists public.repair_settlements enable row level security;
alter table if exists public.settlement_payments enable row level security;
alter table if exists public.settlement_expenses enable row level security;
alter table if exists public.daily_cash enable row level security;
alter table if exists public.vehicle_catalog enable row level security;
alter table if exists public.business_catalog enable row level security;
alter table if exists public.daily_cash_categories enable row level security;

create table if not exists public.home_notices (
  id bigserial primary key,
  title text not null,
  content text not null,
  is_active boolean not null default true,
  created_by text,
  created_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.home_notices enable row level security;

drop policy if exists work_orders_authenticated_all on public.work_orders;
drop policy if exists work_details_authenticated_all on public.work_details;
drop policy if exists repair_settlements_admin_dept_all on public.repair_settlements;
drop policy if exists settlement_payments_admin_dept_all on public.settlement_payments;
drop policy if exists settlement_expenses_admin_dept_all on public.settlement_expenses;
drop policy if exists daily_cash_admin_dept_all on public.daily_cash;
drop policy if exists vehicle_catalog_authenticated_read on public.vehicle_catalog;
drop policy if exists vehicle_catalog_admin_dept_write on public.vehicle_catalog;
drop policy if exists business_catalog_authenticated_read on public.business_catalog;
drop policy if exists business_catalog_admin_dept_write on public.business_catalog;
drop policy if exists daily_cash_categories_authenticated_read on public.daily_cash_categories;
drop policy if exists daily_cash_categories_admin_dept_write on public.daily_cash_categories;
drop policy if exists home_notices_authenticated_read on public.home_notices;
drop policy if exists home_notices_admin_write on public.home_notices;

create policy work_orders_authenticated_all
on public.work_orders
for all
to authenticated
using (public.current_app_user_id() is not null)
with check (public.current_app_user_id() is not null);

create policy work_details_authenticated_all
on public.work_details
for all
to authenticated
using (public.current_app_user_id() is not null)
with check (public.current_app_user_id() is not null);

create policy repair_settlements_admin_dept_all
on public.repair_settlements
for all
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());

create policy settlement_payments_admin_dept_all
on public.settlement_payments
for all
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());

create policy settlement_expenses_admin_dept_all
on public.settlement_expenses
for all
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());

create policy daily_cash_admin_dept_all
on public.daily_cash
for all
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());

create policy vehicle_catalog_authenticated_read
on public.vehicle_catalog
for select
to authenticated
using (public.current_app_user_id() is not null);

create policy vehicle_catalog_admin_dept_write
on public.vehicle_catalog
for all
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());

create policy business_catalog_authenticated_read
on public.business_catalog
for select
to authenticated
using (public.current_app_user_id() is not null);

create policy business_catalog_admin_dept_write
on public.business_catalog
for all
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());

create policy daily_cash_categories_authenticated_read
on public.daily_cash_categories
for select
to authenticated
using (public.current_app_user_id() is not null);

create policy daily_cash_categories_admin_dept_write
on public.daily_cash_categories
for all
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());

create policy home_notices_authenticated_read
on public.home_notices
for select
to authenticated
using (public.current_app_user_id() is not null);

create policy home_notices_admin_write
on public.home_notices
for all
to authenticated
using (public.current_app_user_is_admin())
with check (public.current_app_user_is_admin());

alter table if exists public.expense_requests enable row level security;
alter table if exists public.attendance_requests enable row level security;

drop policy if exists expense_requests_select_scope on public.expense_requests;
drop policy if exists expense_requests_insert_own on public.expense_requests;
drop policy if exists expense_requests_update_scope on public.expense_requests;
drop policy if exists expense_requests_delete_admin on public.expense_requests;
drop policy if exists attendance_requests_select_scope on public.attendance_requests;
drop policy if exists attendance_requests_insert_own on public.attendance_requests;
drop policy if exists attendance_requests_update_scope on public.attendance_requests;
drop policy if exists attendance_requests_delete_admin on public.attendance_requests;

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

create policy expense_requests_insert_own
on public.expense_requests
for insert
to authenticated
with check (requested_by = public.current_app_user_id());

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

create policy expense_requests_delete_admin
on public.expense_requests
for delete
to authenticated
using (public.current_app_user_is_admin());

create policy attendance_requests_select_scope
on public.attendance_requests
for select
to authenticated
using (
  public.current_app_user_is_admin_dept()
  or requested_by = public.current_app_user_id()
  or (
    public.current_app_user_approval_role() = '부서장'
    and requested_department = public.current_app_user_department()
  )
);

create policy attendance_requests_insert_own
on public.attendance_requests
for insert
to authenticated
with check (requested_by = public.current_app_user_id());

create policy attendance_requests_update_scope
on public.attendance_requests
for update
to authenticated
using (
  public.current_app_user_is_admin_dept()
  or requested_by = public.current_app_user_id()
  or (
    public.current_app_user_approval_role() = '부서장'
    and requested_department = public.current_app_user_department()
  )
)
with check (
  public.current_app_user_is_admin_dept()
  or requested_by = public.current_app_user_id()
  or (
    public.current_app_user_approval_role() = '부서장'
    and requested_department = public.current_app_user_department()
  )
);

create policy attendance_requests_delete_admin
on public.attendance_requests
for delete
to authenticated
using (public.current_app_user_is_admin());
