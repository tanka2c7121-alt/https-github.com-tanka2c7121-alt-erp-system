create table if not exists public.pending_insurance_management (
  work_name text primary key,
  status text not null default '관리중',
  action_memo text,
  final_result text,
  updated_at timestamptz not null default now()
);

alter table public.pending_insurance_management enable row level security;

drop policy if exists "pending_insurance_management_select" on public.pending_insurance_management;
create policy "pending_insurance_management_select"
on public.pending_insurance_management
for select
using (true);

drop policy if exists "pending_insurance_management_insert" on public.pending_insurance_management;
create policy "pending_insurance_management_insert"
on public.pending_insurance_management
for insert
with check (true);

drop policy if exists "pending_insurance_management_update" on public.pending_insurance_management;
create policy "pending_insurance_management_update"
on public.pending_insurance_management
for update
using (true)
with check (true);
