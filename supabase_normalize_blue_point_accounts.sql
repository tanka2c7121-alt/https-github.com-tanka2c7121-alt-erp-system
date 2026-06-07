-- Normalize legacy BLUE account values to BLUE POINT.
-- Run once in Supabase SQL Editor if existing rows were saved as BLUE, BUlE, or similar.

update public.daily_cash
set account = 'BLUE POINT'
where upper(replace(replace(replace(coalesce(account, ''), ' ', ''), '-', ''), '_', '')) like '%BLUE%'
   or coalesce(account, '') like '%블루%';

update public.expense_requests
set account = 'BLUE POINT'
where upper(replace(replace(replace(coalesce(account, ''), ' ', ''), '-', ''), '_', '')) like '%BLUE%'
   or coalesce(account, '') like '%블루%';

update public.settlement_payments
set payment_method = 'BLUE POINT'
where upper(replace(replace(replace(coalesce(payment_method, ''), ' ', ''), '-', ''), '_', '')) like '%BLUE%'
   or coalesce(payment_method, '') like '%블루%';
