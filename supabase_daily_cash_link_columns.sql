-- Ensure daily_cash has the columns used by Vercel/Supabase automatic linking.
-- Run this in Supabase SQL Editor before deploying code that syncs settlements,
-- expense requests, deductibles, or parts payments into daily_cash.

alter table if exists public.daily_cash
add column if not exists source_type text,
add column if not exists source_work_name text,
add column if not exists created_on date;

update public.daily_cash
set created_on = date
where created_on is null;

alter table if exists public.daily_cash
alter column created_on set default current_date;

create index if not exists daily_cash_source_lookup_idx
on public.daily_cash (source_type, source_work_name);

create index if not exists daily_cash_created_on_idx
on public.daily_cash (created_on);
