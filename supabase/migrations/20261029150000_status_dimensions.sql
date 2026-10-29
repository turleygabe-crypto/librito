-- Status dimensions: replace default shelves and ad-hoc flags with two per-book
-- status dimensions plus a favorite flag on public.books.
--   reading_status:   next_read | reading | read | dnf   (nullable, one at a time)
--   ownership_status: wishlist | owned | sold | donated  (nullable, one at a time)
--   is_favorite:      boolean (replaces the liked_books join table)
--   owned_format:     print | ebook | audio (nullable, meaningful when owned)
--
-- Data migration (one-time, guarded by a marker row in status_migration_log):
--   * reading_status 'completed' -> 'read'; unknown values logged and nulled.
--   * liked_books rows -> is_favorite = true (table kept for rollback).
--   * disposition 'sold'/'donated' -> ownership_status (column kept for rollback).
--   * Books on the built-in Wishlist shelf -> ownership_status = 'wishlist'.
--   * shelf_items become real library books; custom-shelf items get book_shelves
--     joins. The built-in Wishlist shelf, its join rows and shelf_items are then
--     backed up (for the rollback script) and removed.
--   * Conflicts (e.g. a sold book also on the Wishlist shelf) keep the stronger
--     value and are logged in status_migration_log.
--
-- Rollback: supabase/rollbacks/20261029150000_status_dimensions_down.sql
-- restores the previous model from the backup tables and the migration log.

-- New columns -----------------------------------------------------------------
alter table public.books add column if not exists ownership_status text;
alter table public.books add column if not exists is_favorite boolean not null default false;
alter table public.books add column if not exists owned_format text;

-- Migration log: marker + conflict records. Service-role only (RLS, no policies).
create table if not exists public.status_migration_log (
  id bigint generated always as identity primary key,
  step text not null,
  user_id uuid,
  book_id uuid,
  shelf_id uuid,
  detail text,
  created_at timestamptz not null default now()
);
alter table public.status_migration_log enable row level security;
revoke all on public.status_migration_log from anon, authenticated;

-- One-time backfill -------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.status_migration_log where step = 'backfill_complete') then
    return;
  end if;

  -- Backups used by the rollback script.
  create table if not exists public.status_migration_backup_shelf_items
    as select * from public.shelf_items where false;
  create table if not exists public.status_migration_backup_wishlist_shelves
    as select * from public.shelves where false;
  create table if not exists public.status_migration_backup_wishlist_book_shelves
    as select * from public.book_shelves where false;
  alter table public.status_migration_backup_shelf_items enable row level security;
  alter table public.status_migration_backup_wishlist_shelves enable row level security;
  alter table public.status_migration_backup_wishlist_book_shelves enable row level security;
  revoke all on public.status_migration_backup_shelf_items from anon, authenticated;
  revoke all on public.status_migration_backup_wishlist_shelves from anon, authenticated;
  revoke all on public.status_migration_backup_wishlist_book_shelves from anon, authenticated;

  -- Tier-limit triggers must not block the backfill (existing overage stands).
  alter table public.books disable trigger enforce_book_limit;
  alter table public.books disable trigger enforce_reading_limit;

  -- 1. Normalize reading_status values.
  update public.books set reading_status = 'read' where reading_status = 'completed';
  insert into public.status_migration_log (step, user_id, book_id, detail)
  select 'unknown_reading_status', user_id, id, reading_status
  from public.books
  where reading_status is not null
    and reading_status <> ''
    and reading_status not in ('next_read', 'reading', 'read', 'dnf');
  update public.books
  set reading_status = null
  where reading_status is not null
    and reading_status not in ('next_read', 'reading', 'read', 'dnf');

  -- Per-edition progress stores the same status keys.
  update public.books
  set edition_progress = (
    select coalesce(jsonb_object_agg(
      entry.key,
      case when entry.value ->> 'reading_status' = 'completed'
        then jsonb_set(entry.value, '{reading_status}', '"read"')
        else entry.value end
    ), '{}'::jsonb)
    from jsonb_each(edition_progress) as entry(key, value)
  )
  where edition_progress is not null
    and exists (
      select 1 from jsonb_each(edition_progress) as entry(key, value)
      where entry.value ->> 'reading_status' = 'completed'
    );

  -- 2. liked_books -> is_favorite.
  update public.books b
  set is_favorite = true
  from public.liked_books l
  where l.book_id = b.id and not b.is_favorite;

  -- 3. disposition -> ownership_status (sold/donated win over anything else).
  update public.books
  set ownership_status = disposition
  where disposition in ('sold', 'donated') and ownership_status is null;

  -- 4. Library books on the built-in Wishlist shelf -> ownership wishlist.
  insert into public.status_migration_log (step, user_id, book_id, shelf_id, detail)
  select 'wishlist_ownership_conflict', b.user_id, b.id, s.id,
         'kept ' || b.ownership_status || ', dropped wishlist'
  from public.book_shelves bs
  join public.shelves s on s.id = bs.shelf_id and s.is_wishlist
  join public.books b on b.id = bs.book_id
  where b.ownership_status is not null and b.ownership_status <> 'wishlist';

  update public.books b
  set ownership_status = 'wishlist'
  from public.book_shelves bs
  join public.shelves s on s.id = bs.shelf_id and s.is_wishlist
  where bs.book_id = b.id and b.ownership_status is null;

  -- 5. shelf_items become real library books.
  create temp table tmp_shelf_item_books on commit drop as
  select si.id as item_id,
         si.user_id,
         si.shelf_id,
         s.is_wishlist,
         si.title,
         si.author,
         si.isbn,
         si.genre,
         si.cover_url,
         si.page_count,
         si.added_at,
         coalesce(nullif(lower(btrim(coalesce(si.isbn, ''))), ''),
                  lower(si.title || '|' || coalesce(si.author, ''))) as book_key,
         null::uuid as book_id
  from public.shelf_items si
  join public.shelves s on s.id = si.shelf_id;

  -- Match existing library books by the same key the app uses (isbn, else title|author).
  update tmp_shelf_item_books t
  set book_id = (
    select b.id from public.books b
    where b.user_id = t.user_id
      and coalesce(nullif(lower(btrim(coalesce(b.isbn, ''))), ''),
                   lower(b.title || '|' || coalesce(b.author, ''))) = t.book_key
    order by b.created_at nulls last, b.id
    limit 1
  );

  -- Create the missing books (one per user+key), logging them for rollback.
  with missing as (
    select distinct on (user_id, book_key)
      user_id, book_key, title, author,
      nullif(btrim(coalesce(isbn, '')), '') as isbn,
      nullif(btrim(coalesce(genre, '')), '') as genre,
      nullif(btrim(coalesce(cover_url, '')), '') as cover_url,
      page_count,
      added_at
    from tmp_shelf_item_books
    where book_id is null
    order by user_id, book_key, added_at
  ), inserted as (
    insert into public.books (user_id, title, author, isbn, genre, cover_url, page_count, added_on)
    select user_id, title, author, isbn, genre, cover_url, page_count, coalesce(added_at::date, current_date)
    from missing
    returning id, user_id
  )
  insert into public.status_migration_log (step, user_id, book_id)
  select 'created_book_from_shelf_item', inserted.user_id, inserted.id
  from inserted;

  update tmp_shelf_item_books t
  set book_id = b.id
  from public.status_migration_log l
  join public.books b on b.id = l.book_id
  where l.step = 'created_book_from_shelf_item'
    and t.book_id is null
    and b.user_id = t.user_id
    and coalesce(nullif(lower(btrim(coalesce(b.isbn, ''))), ''),
                 lower(b.title || '|' || coalesce(b.author, ''))) = t.book_key;

  -- Wishlist items -> ownership wishlist (sold/donated keep priority, logged).
  insert into public.status_migration_log (step, user_id, book_id, shelf_id, detail)
  select distinct 'wishlist_ownership_conflict', b.user_id, b.id, t.shelf_id,
         'kept ' || b.ownership_status || ', dropped wishlist'
  from tmp_shelf_item_books t
  join public.books b on b.id = t.book_id
  where t.is_wishlist and b.ownership_status is not null and b.ownership_status <> 'wishlist';

  update public.books b
  set ownership_status = 'wishlist'
  from tmp_shelf_item_books t
  where t.is_wishlist and t.book_id = b.id and b.ownership_status is null;

  -- Custom-shelf items -> proper join rows (new rows logged for rollback).
  insert into public.status_migration_log (step, user_id, book_id, shelf_id)
  select distinct 'added_book_shelf_from_shelf_item', t.user_id, t.book_id, t.shelf_id
  from tmp_shelf_item_books t
  where not t.is_wishlist and t.book_id is not null
    and not exists (
      select 1 from public.book_shelves bs
      where bs.book_id = t.book_id and bs.shelf_id = t.shelf_id
    );

  insert into public.book_shelves (book_id, shelf_id, user_id)
  select distinct t.book_id, t.shelf_id, t.user_id
  from tmp_shelf_item_books t
  where not t.is_wishlist and t.book_id is not null
  on conflict (book_id, shelf_id) do nothing;

  -- 6. Back up and remove the retired structures.
  insert into public.status_migration_backup_shelf_items select * from public.shelf_items;
  delete from public.shelf_items;

  insert into public.status_migration_backup_wishlist_book_shelves
  select bs.* from public.book_shelves bs
  join public.shelves s on s.id = bs.shelf_id and s.is_wishlist;

  insert into public.status_migration_backup_wishlist_shelves
  select * from public.shelves where is_wishlist;

  delete from public.book_shelves bs
  using public.shelves s
  where s.id = bs.shelf_id and s.is_wishlist;

  delete from public.shelves where is_wishlist;

  alter table public.books enable trigger enforce_book_limit;
  alter table public.books enable trigger enforce_reading_limit;

  insert into public.status_migration_log (step, detail)
  values ('backfill_complete', 'status dimensions backfill finished');
end
$$;

-- Constraints (stable keys only; display labels live in the client translations).
alter table public.books drop constraint if exists books_reading_status_check;
alter table public.books add constraint books_reading_status_check
  check (reading_status is null or reading_status in ('next_read', 'reading', 'read', 'dnf'));

alter table public.books drop constraint if exists books_ownership_status_check;
alter table public.books add constraint books_ownership_status_check
  check (ownership_status is null or ownership_status in ('wishlist', 'owned', 'sold', 'donated'));

alter table public.books drop constraint if exists books_owned_format_check;
alter table public.books add constraint books_owned_format_check
  check (owned_format is null or owned_format in ('print', 'ebook', 'audio'));

-- Retire the built-in Wishlist shelf machinery. Wishlist is a status now.
drop trigger if exists create_wishlist_shelf on public.profiles;
drop function if exists public.create_wishlist_shelf();
drop trigger if exists reserve_wishlist_name on public.shelves;
drop function if exists public.reserve_wishlist_name();
drop index if exists public.shelves_one_wishlist_per_user;

-- Shelves policies: plain own-rows rules again (no built-in shelf carve-outs).
drop policy if exists shelves_insert_own on public.shelves;
create policy shelves_insert_own on public.shelves
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists shelves_update_own on public.shelves;
create policy shelves_update_own on public.shelves
  for update to authenticated using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists shelves_delete_own on public.shelves;
create policy shelves_delete_own on public.shelves
  for delete to authenticated using (auth.uid() = user_id);

-- Lite Reader limits without the Wishlist exemption (every shelf is custom now).
create or replace function public.enforce_tier_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_tier text;
begin
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
        where user_id = new.user_id and id is distinct from new.id) >= 5 then
      raise exception 'Lite Reader accounts are limited to 5 shelves. Upgrade to Book Lover for more.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_tier_limits() from public, anon, authenticated;

-- Currently Reading limit now keys off reading_status alone (disposition retired).
create or replace function public.enforce_reading_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_tier text;
begin
  if new.reading_status is distinct from 'reading' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.reading_status is not distinct from 'reading' then
    return new;
  end if;

  select tier into user_tier from public.profiles where id = new.user_id;
  if coalesce(user_tier, 'lite_reader') <> 'lite_reader' then
    return new;
  end if;

  if (select count(*) from public.books
      where user_id = new.user_id and reading_status = 'reading'
        and id is distinct from new.id) >= 5 then
    raise exception 'Lite Reader accounts are limited to 5 books in Currently Reading. Upgrade to Book Lover for more.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_reading_limit() from public, anon, authenticated;

drop trigger if exists enforce_reading_limit on public.books;
create trigger enforce_reading_limit before insert or update of reading_status on public.books
for each row execute procedure public.enforce_reading_limit();

create index if not exists books_reading_status_idx on public.books(user_id, reading_status);
create index if not exists books_ownership_status_idx on public.books(user_id, ownership_status);

-- liked_books, books.disposition, books.shelf and shelves.is_wishlist are kept
-- (unused) so the rollback script can restore the previous model. Remove them in
-- a later migration once the rollback window has passed.
