insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'work-photos',
  'work-photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "work photos public read" on storage.objects;
drop policy if exists "work photos public upload" on storage.objects;
drop policy if exists "work photos public update" on storage.objects;
drop policy if exists "work photos public delete" on storage.objects;

create policy "work photos public read"
on storage.objects
for select
using (bucket_id = 'work-photos');

create policy "work photos public upload"
on storage.objects
for insert
with check (bucket_id = 'work-photos');

create policy "work photos public update"
on storage.objects
for update
using (bucket_id = 'work-photos')
with check (bucket_id = 'work-photos');

create policy "work photos public delete"
on storage.objects
for delete
using (bucket_id = 'work-photos');
