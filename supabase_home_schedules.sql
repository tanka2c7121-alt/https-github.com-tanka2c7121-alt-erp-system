create table if not exists public.home_schedules (
  id bigserial primary key,
  start_date date not null,
  end_date date not null,
  title text not null,
  memo text not null default '',
  tone text not null default 'red',
  visibility text not null default 'public',
  created_by text,
  created_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_schedules_date_order check (end_date >= start_date),
  constraint home_schedules_tone_check check (
    tone in ('amber', 'blue', 'green', 'indigo', 'red')
  ),
  constraint home_schedules_visibility_check check (
    visibility in ('public', 'private')
  )
);

alter table public.home_schedules enable row level security;

drop policy if exists "home_schedules_select" on public.home_schedules;
create policy "home_schedules_select"
on public.home_schedules
for select
using (true);

drop policy if exists "home_schedules_insert" on public.home_schedules;
create policy "home_schedules_insert"
on public.home_schedules
for insert
with check (true);

drop policy if exists "home_schedules_update" on public.home_schedules;
create policy "home_schedules_update"
on public.home_schedules
for update
using (true)
with check (true);

drop policy if exists "home_schedules_delete" on public.home_schedules;
create policy "home_schedules_delete"
on public.home_schedules
for delete
using (true);

create or replace function public.set_home_schedules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists home_schedules_set_updated_at on public.home_schedules;

create trigger home_schedules_set_updated_at
before update on public.home_schedules
for each row
execute function public.set_home_schedules_updated_at();
