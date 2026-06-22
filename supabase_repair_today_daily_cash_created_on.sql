-- Hide rows that were incorrectly pulled into today's Daily Cash without deleting data.
--
-- Keeps legitimate rows entered today even when their transaction date is yesterday
-- or another day. Only rows whose created_on is today but whose actual DB created_at
-- date is before today are moved out of today's input list.

-- 1) Preview rows that will be removed from today's Daily Cash view.
with params as (
  select (now() at time zone 'Asia/Seoul')::date as today
)
select
  id,
  date,
  created_on,
  (created_at at time zone 'Asia/Seoul')::date as actual_input_date,
  account,
  type,
  category,
  content,
  income,
  expense,
  memo,
  source_type,
  source_work_name
from public.daily_cash, params
where created_on = params.today
  and created_at is not null
  and (created_at at time zone 'Asia/Seoul')::date < params.today
order by created_at desc, id desc;

-- 2) Repair. This does not delete rows; it restores their input date.
with params as (
  select (now() at time zone 'Asia/Seoul')::date as today
)
update public.daily_cash
set created_on = (created_at at time zone 'Asia/Seoul')::date
from params
where created_on = params.today
  and created_at is not null
  and (created_at at time zone 'Asia/Seoul')::date < params.today;

-- 3) Check remaining suspicious rows.
with params as (
  select (now() at time zone 'Asia/Seoul')::date as today
)
select count(*) as remaining_wrong_today_rows
from public.daily_cash, params
where created_on = params.today
  and created_at is not null
  and (created_at at time zone 'Asia/Seoul')::date < params.today;
