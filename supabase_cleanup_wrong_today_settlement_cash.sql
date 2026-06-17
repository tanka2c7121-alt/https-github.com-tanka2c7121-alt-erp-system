-- Clean settlement-linked daily_cash rows that were accidentally re-created as today's input.
--
-- What this fixes:
-- - Old settlement payments were copied into daily_cash with created_on = today.
-- - DailyCash "today" screen uses created_on, so those old rows appear as today's input.
--
-- This does NOT delete money rows. It only moves suspicious old transaction rows out of
-- today's input list by setting created_on back to the transaction date.
--
-- Before running the UPDATE, run the PREVIEW query and check the rows.

-- 1) PREVIEW
with params as (
  select (now() at time zone 'Asia/Seoul')::date as cleanup_created_on
)
select
  daily_cash.id,
  daily_cash.date,
  daily_cash.created_on,
  daily_cash.account,
  daily_cash.type,
  daily_cash.category,
  daily_cash.content,
  daily_cash.income,
  daily_cash.expense,
  daily_cash.memo,
  daily_cash.source_type,
  daily_cash.source_work_name
from public.daily_cash
cross join params
where source_type = 'settlement_payment'
  and created_on = params.cleanup_created_on
  and date < params.cleanup_created_on
order by date desc, id desc;

-- 2) REPAIR
-- Run only after the preview rows are the wrongly loaded old settlement rows.
with params as (
  select (now() at time zone 'Asia/Seoul')::date as cleanup_created_on
)
update public.daily_cash
set created_on = date
from params
where source_type = 'settlement_payment'
  and created_on = params.cleanup_created_on
  and date < params.cleanup_created_on;

-- 3) CHECK
with params as (
  select (now() at time zone 'Asia/Seoul')::date as cleanup_created_on
)
select
  count(*) as remaining_wrong_today_rows
from public.daily_cash
cross join params
where source_type = 'settlement_payment'
  and created_on = params.cleanup_created_on
  and date < params.cleanup_created_on;
