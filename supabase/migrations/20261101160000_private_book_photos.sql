-- Objects are private and tied to an actual book owned by the authenticated reader.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-book-photos', 'private-book-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists private_book_photos_select on storage.objects;
create policy private_book_photos_select on storage.objects
for select to authenticated
using (
  bucket_id = 'private-book-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.books b
    where b.id::text = (storage.foldername(name))[2] and b.user_id = auth.uid()
  )
);

drop policy if exists private_book_photos_insert on storage.objects;
create policy private_book_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'private-book-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'
  and exists (
    select 1 from public.books b
    where b.id::text = (storage.foldername(name))[2] and b.user_id = auth.uid()
  )
);

drop policy if exists private_book_photos_delete on storage.objects;
create policy private_book_photos_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'private-book-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
