-- Allow admin-approved service settlements to be completed/closed without claim/payment amounts.
-- Run this once in Supabase SQL Editor before saving service-checked settlements.

alter table if exists public.repair_settlements
add column if not exists service_charge_override boolean default false;
