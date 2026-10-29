-- Rollback for supabase/migrations/20261029150000_status_dimensions.sql.
-- Restores the previous model (liked_books, disposition, built-in Wishlist shelf,
-- shelf_items) from the migration's backup tables and log, then removes the new
-- status columns. Run manually; not part of the forward migration chain.

begin;

-- 1. Drop the new constraints and indexes.
alter table public.books drop constraint if exists books_reading_status_check;
alter table public.books drop constraint if exists books_ownership_status_check;
alter table public.books drop constraint if exists books_owned_format_check;
drop index if exists public.books_reading_status_idx;
drop index if exists public.books_ownership_status_idx;

-- 2. Restore liked_books from is_favorite.
insert into public.liked_books (user_id, book_id)
select user_id, id from public.books
where is_favorite and user_id is not null
on conflict (user_id, book_id) do nothing;

-- 3. Restore disposition from ownership_status.
update public.books
set disposition = ownership_status
where ownership_status in ('sold', 'donated') and disposition is null;

-- 4. Restore legacy reading_status values ('read' was 'completed'; next_read/dnf
--    did not exist before).
update public.books set reading_status = 'completed' where reading_status = 'read';
update public.books set reading_status = null where reading_status in ('next_read', 'dnf');

update public.books
set edition_progress = (
  select coalesce(jsonb_object_agg(
    entry.key,
    case when entry.value ->> 'reading_status' = 'read'
      then jsonb_set(entry.value, '{reading_status}', '"completed"')
      else entry.value end
  ), '{}'::jsonb)
  from jsonb_each(edition_progress) as entry(key, value)
)
where edition_progress is not null
  and exists (
    select 1 from jsonb_each(edition_progress) as entry(key, value)
    where entry.value ->> 'reading_status' = 'read'
  );

-- 5. Remove the join rows and books the migration created from shelf_items.
delete from public.book_shelves bs
using public.status_migration_log l
where l.step = 'added_book_shelf_from_shelf_item'
  and bs.book_id = l.book_id and bs.shelf_id = l.shelf_id;

delete from public.books b
using public.status_migration_log l
where l.step = 'created_book_from_shelf_item' and b.id = l.book_id;

-- 6. Restore the built-in Wishlist shelves, their join rows and shelf_items.
alter table public.shelves disable trigger enforce_shelf_limit;
insert into public.shelves
select * from public.status_migration_backup_wishlist_shelves
on conflict (id) do nothing;
alter table public.shelves enable trigger enforce_shelf_limit;

insert into public.book_shelves
select * from public.status_migration_backup_wishlist_book_shelves
on conflict (book_id, shelf_id) do nothing;

insert into public.shelf_items
select * from public.status_migration_backup_shelf_items
on conflict (shelf_id, book_key) do nothing;

-- 7. Recreate the built-in Wishlist machinery
--    (as defined in 20261024240000_builtin_wishlist_shelf.sql).
create unique index if not exists shelves_one_wishlist_per_user
  on public.shelves(user_id) where is_wishlist;

drop policy if exists shelves_insert_own on public.shelves;
create policy shelves_insert_own on public.shelves
  for insert to authenticated with check (auth.uid() = user_id and not is_wishlist);

drop policy if exists shelves_update_own on public.shelves;
create policy shelves_update_own on public.shelves
  for update to authenticated using (auth.uid() = user_id and not is_wishlist)
  with check (auth.uid() = user_id and not is_wishlist);

drop policy if exists shelves_delete_own on public.shelves;
create policy shelves_delete_own on public.shelves
  for delete to authenticated using (auth.uid() = user_id and not is_wishlist);

create or replace function public.reserve_wishlist_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.is_wishlist and lower(btrim(new.name)) = 'wishlist' then
    raise exception '“Wishlist” is a built-in shelf. Choose another name.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists reserve_wishlist_name on public.shelves;
create trigger reserve_wishlist_name before insert or update of name on public.shelves
for each row execute procedure public.reserve_wishlist_name();

create or replace function public.enforce_tier_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_tier text;
begin
  if tg_table_name = 'shelves' and new.is_wishlist then
    return new;
  end if;

  select tier into user_tier from public.profiles where id = new.user_id;
  if coalesce(user_tier, 'lite_reader') <> 'lite_reader' then
    return new;
  end if;

  if tg_table_name = 'books' then
    if (select count(*) from public.books where user_id = new.user_id) >= 100 then
      raise exception 'Lite Reader accounts are limited to 100 books. Upgrade to Book Lover for more.'
        using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'shelves' then
    if (select count(*) from public.shelves
        where user_id = new.user_id and not is_wishlist and id is distinct from new.id) >= 5 then
      raise exception 'Lite Reader accounts are limited to 5 shelves. Upgrade to Book Lover for more.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_tier_limits() from public, anon, authenticated;

create or replace function public.create_wishlist_shelf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shelves (user_id, name, color, is_wishlist)
  values (new.id, 'Wishlist', '#b64d2c', true)
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.create_wishlist_shelf() from public, anon, authenticated;

drop trigger if exists create_wishlist_shelf on public.profiles;
create trigger create_wishlist_shelf after insert on public.profiles
for each row execute procedure public.create_wishlist_shelf();

insert into public.shelves (user_id, name, color, is_wishlist)
select p.id, 'Wishlist', '#b64d2c', true
from public.profiles p
where not exists (select 1 from public.shelves s where s.user_id = p.id and s.is_wishlist)
on conflict do nothing;

-- 8. Restore the disposition-aware Currently Reading limit
--    (as defined in 20261024210000_lite_reader_reading_limit.sql).
create or replace function public.enforce_reading_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_tier text;
begin
  if new.reading_status is distinct from 'reading' or new.disposition is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.reading_status is not distinct from 'reading' and old.disposition is null then
    return new;
  end if;

  select tier into user_tier from public.profiles where id = new.user_id;
  if coalesce(user_tier, 'lite_reader') <> 'lite_reader' then
    return new;
  end if;

  if (select count(*) from public.books
      where user_id = new.user_id and reading_status = 'reading' and disposition is null
        and id is distinct from new.id) >= 5 then
    raise exception 'Lite Reader accounts are limited to 5 books in Currently Reading. Upgrade to Book Lover for more.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_reading_limit() from public, anon, authenticated;

drop trigger if exists enforce_reading_limit on public.books;
create trigger enforce_reading_limit before insert or update of reading_status, disposition on public.books
for each row execute procedure public.enforce_reading_limit();

-- 9. Drop the new columns and the migration bookkeeping tables.
alter table public.books drop column if exists ownership_status;
alter table public.books drop column if exists is_favorite;
alter table public.books drop column if exists owned_format;

drop table if exists public.status_migration_backup_shelf_items;
drop table if exists public.status_migration_backup_wishlist_shelves;
drop table if exists public.status_migration_backup_wishlist_book_shelves;
drop table if exists public.status_migration_log;

commit;
