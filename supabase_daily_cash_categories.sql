create table if not exists daily_cash_categories (
  id bigserial primary key,
  type text not null check (type in ('수입', '고정비', '변동비', '내부이동')),
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_cash_categories_unique
on daily_cash_categories (
  type,
  lower(trim(name))
);

create or replace function set_daily_cash_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_cash_categories_set_updated_at on daily_cash_categories;

create trigger daily_cash_categories_set_updated_at
before update on daily_cash_categories
for each row
execute function set_daily_cash_categories_updated_at();

insert into daily_cash_categories (type, name, sort_order)
values
  ('수입', '수리비', 10),
  ('수입', '면책금', 20),
  ('수입', '부가세', 30),
  ('수입', '보험금', 40),
  ('수입', '카드매출', 50),
  ('수입', 'BLUE포인트', 60),
  ('수입', '임대료', 70),
  ('수입', '차량정산', 80),
  ('수입', '기타수입', 90),
  ('고정비', '임대료', 10),
  ('고정비', '관리비', 20),
  ('고정비', '전기세', 30),
  ('고정비', '수도세', 40),
  ('고정비', '인터넷', 50),
  ('고정비', '직원급여', 60),
  ('고정비', '연장근로수당', 70),
  ('고정비', '4대보험', 80),
  ('고정비', '직원식대', 90),
  ('고정비', '세금', 100),
  ('고정비', '렌트료', 110),
  ('고정비', 'AOS프로그램사용료', 120),
  ('변동비', '부품대', 10),
  ('변동비', '외주', 20),
  ('변동비', '도장부관리비', 30),
  ('변동비', '판금부관리비', 40),
  ('변동비', '소모품', 50),
  ('변동비', '유류비', 60),
  ('변동비', '택시비', 70),
  ('변동비', '식대', 80),
  ('변동비', '탁송비', 90),
  ('변동비', '세차비', 100),
  ('변동비', '공구구입비', 110),
  ('내부이동', '계좌이체', 10),
  ('내부이동', '현금이동', 20),
  ('내부이동', '카드정산', 30)
on conflict do nothing;

alter table if exists public.daily_cash_categories enable row level security;

drop policy if exists daily_cash_categories_authenticated_read
on public.daily_cash_categories;

create policy daily_cash_categories_authenticated_read
on public.daily_cash_categories
for select
to authenticated
using (public.current_app_user_id() is not null);

drop policy if exists daily_cash_categories_admin_dept_write
on public.daily_cash_categories;

create policy daily_cash_categories_admin_dept_write
on public.daily_cash_categories
for all
to authenticated
using (public.current_app_user_is_admin_dept())
with check (public.current_app_user_is_admin_dept());
