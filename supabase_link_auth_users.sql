-- Link Supabase Auth users to ERP app_users by email.
-- Run this after logging in once, or after creating users in Authentication > Users.

alter table if exists public.app_users
add column if not exists auth_uid uuid;

update public.app_users app
set auth_uid = auth_user.id
from auth.users auth_user
where lower(app.user_id) = lower(auth_user.email)
  and app.auth_uid is null;

select
  app.id,
  app.user_id,
  app.user_name,
  app.role,
  app.is_active,
  app.auth_uid,
  case
    when app.auth_uid is null then 'NOT LINKED'
    else 'LINKED'
  end as link_status
from public.app_users app
order by app.id;
