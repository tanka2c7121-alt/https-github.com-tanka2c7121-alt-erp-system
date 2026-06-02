-- Separate claim amount from actual payment amount.
-- Run this once in Supabase SQL Editor before saving settlement rows with separate claim/payment amounts.

alter table if exists public.settlement_payments
add column if not exists claim_amount numeric default 0;

update public.settlement_payments
set claim_amount = payment_amount
where claim_amount is null
  and payment_amount is not null;

alter table if exists public.repair_settlements
add column if not exists own_claim_amount numeric default 0,
add column if not exists other_claim_amount numeric default 0,
add column if not exists own_claim_date date,
add column if not exists other_claim_date date;
