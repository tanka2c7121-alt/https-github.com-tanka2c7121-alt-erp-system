-- Emergency recovery only.
-- Run this in Supabase SQL Editor if ERP login is blocked during RLS migration.
-- After users can log in once and auth_uid is linked, run supabase_rls_auth.sql again.

alter table if exists public.app_users disable row level security;

select
  id,
  user_id,
  user_name,
  role,
  is_active,
  auth_uid
from public.app_users
order by id;
