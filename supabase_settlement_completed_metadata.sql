-- Store who completed a vehicle settlement and when.
-- Run this once in Supabase SQL Editor before saving new completed settlements.

alter table if exists public.repair_settlements
add column if not exists completed_at date,
add column if not exists completed_by text,
add column if not exists completed_by_name text;
