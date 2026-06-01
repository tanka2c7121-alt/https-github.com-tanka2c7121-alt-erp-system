-- Run after supabase_rls_auth.sql.
-- This makes ERP photo buckets private and allows only logged-in active ERP users.

update storage.buckets
set public = false
where id in ('work-photos', 'expense-receipts');

drop policy if exists "work photos public read" on storage.objects;
drop policy if exists "work photos public upload" on storage.objects;
drop policy if exists "work photos public update" on storage.objects;
drop policy if exists "work photos public delete" on storage.objects;
drop policy if exists "expense receipts read" on storage.objects;
drop policy if exists "expense receipts upload" on storage.objects;
drop policy if exists "erp private storage read" on storage.objects;
drop policy if exists "erp private storage upload" on storage.objects;
drop policy if exists "erp private storage update" on storage.objects;
drop policy if exists "erp private storage delete" on storage.objects;

create policy "erp private storage read"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('work-photos', 'expense-receipts')
  and public.current_app_user_id() is not null
);

create policy "erp private storage upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('work-photos', 'expense-receipts')
  and public.current_app_user_id() is not null
);

create policy "erp private storage update"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('work-photos', 'expense-receipts')
  and public.current_app_user_id() is not null
)
with check (
  bucket_id in ('work-photos', 'expense-receipts')
  and public.current_app_user_id() is not null
);

create policy "erp private storage delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('work-photos', 'expense-receipts')
  and public.current_app_user_id() is not null
);
