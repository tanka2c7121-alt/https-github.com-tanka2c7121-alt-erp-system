-- Admin-only password reset for ERP users.
-- Run this after supabase_rls_auth.sql.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_reset_app_user_password(
  target_user_id text,
  new_password text
)
returns void
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  target_auth_uid uuid;
begin
  if not public.current_app_user_is_admin() then
    raise exception 'Only admins can reset passwords.';
  end if;

  if length(new_password) < 6 or new_password !~ '[^A-Za-z0-9]' then
    raise exception 'Password must be at least 6 characters and include a special character.';
  end if;

  select auth_uid
    into target_auth_uid
  from public.app_users
  where user_id = target_user_id;

  if target_auth_uid is null then
    raise exception 'This user is not linked to Supabase Auth.';
  end if;

  update auth.users
  set
    encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
    updated_at = now()
  where id = target_auth_uid;

  if not found then
    raise exception 'Supabase Auth user was not found.';
  end if;

  update public.app_users
  set password = new_password
  where user_id = target_user_id;
end;
$$;

grant execute on function public.admin_reset_app_user_password(text, text)
to authenticated;
