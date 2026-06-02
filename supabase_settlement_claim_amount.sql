-- Separate claim amount from actual payment amount.
-- Run this once in Supabase SQL Editor before saving settlement rows with separate claim/payment amounts.

alter table if exists public.settlement_payments
add column if not exists claim_amount numeric default 0;

update public.settlement_payments
set claim_amount = payment_amount
where claim_amount is null
  and payment_amount is not null;
