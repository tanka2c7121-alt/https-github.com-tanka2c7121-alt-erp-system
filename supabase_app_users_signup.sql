alter table public.app_users
add column if not exists department text,
add column if not exists phone_number text;
