create table if not exists public.part_cost_entries (
  id bigserial primary key,
  use_date date not null,
  supplier_name text not null,
  work_name text,
  part_name text not null,
  amount numeric not null default 0,
  memo text,
  created_by text,
  created_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.part_cost_monthly_settlements (
  id bigserial primary key,
  usage_month text not null check (usage_month ~ '^\d{4}-\d{2}$'),
  supplier_name text not null,
  calculated_amount numeric not null default 0,
  confirmed_amount numeric not null default 0,
  status text not null default '입력중'
    check (status in ('입력중', '거래처확인중', '금액확정', '결제예약', '결제완료')),
  payment_due_date date,
  payment_method text,
  paid_at date,
  confirm_memo text,
  created_by text,
  created_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists part_cost_monthly_settlements_unique
on public.part_cost_monthly_settlements (usage_month, supplier_name);

create index if not exists part_cost_entries_use_date_idx
on public.part_cost_entries (use_date);

create index if not exists part_cost_entries_supplier_idx
on public.part_cost_entries (supplier_name);

create or replace function public.set_part_cost_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists part_cost_entries_set_updated_at
on public.part_cost_entries;

create trigger part_cost_entries_set_updated_at
before update on public.part_cost_entries
for each row
execute function public.set_part_cost_updated_at();

drop trigger if exists part_cost_monthly_settlements_set_updated_at
on public.part_cost_monthly_settlements;

create trigger part_cost_monthly_settlements_set_updated_at
before update on public.part_cost_monthly_settlements
for each row
execute function public.set_part_cost_updated_at();

alter table if exists public.part_cost_entries enable row level security;
alter table if exists public.part_cost_monthly_settlements enable row level security;

drop policy if exists part_cost_entries_authenticated_read
on public.part_cost_entries;

create policy part_cost_entries_authenticated_read
on public.part_cost_entries
for select
to authenticated
using (public.current_app_user_id() is not null);

drop policy if exists part_cost_entries_authenticated_write
on public.part_cost_entries;

create policy part_cost_entries_authenticated_write
on public.part_cost_entries
for all
to authenticated
using (public.current_app_user_id() is not null)
with check (public.current_app_user_id() is not null);

drop policy if exists part_cost_monthly_settlements_authenticated_read
on public.part_cost_monthly_settlements;

create policy part_cost_monthly_settlements_authenticated_read
on public.part_cost_monthly_settlements
for select
to authenticated
using (public.current_app_user_id() is not null);

drop policy if exists part_cost_monthly_settlements_authenticated_write
on public.part_cost_monthly_settlements;

create policy part_cost_monthly_settlements_authenticated_write
on public.part_cost_monthly_settlements
for all
to authenticated
using (public.current_app_user_id() is not null)
with check (public.current_app_user_id() is not null);
