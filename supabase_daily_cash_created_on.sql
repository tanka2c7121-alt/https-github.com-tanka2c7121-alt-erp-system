-- Add an input-date column for daily cash printouts.
-- Existing rows are backfilled with their transaction date so old print behavior remains stable.

alter table if exists public.daily_cash
add column if not exists created_on date;

update public.daily_cash
set created_on = date
where created_on is null;

alter table if exists public.daily_cash
alter column created_on set default current_date;
