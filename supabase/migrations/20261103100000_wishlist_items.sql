create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_key text not null,
  title text not null,
  author text,
  isbn text,
  cover_url text,
  genre text,
  page_count integer,
  added_at timestamptz not null default now(),
  unique (user_id, book_key)
);

create index if not exists wishlist_items_user_id_idx on public.wishlist_items(user_id);

alter table public.wishlist_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishlist_items' and policyname = 'wishlist_items_select_own') then
    create policy wishlist_items_select_own on public.wishlist_items
      for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishlist_items' and policyname = 'wishlist_items_insert_own') then
    create policy wishlist_items_insert_own on public.wishlist_items
      for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishlist_items' and policyname = 'wishlist_items_update_own') then
    create policy wishlist_items_update_own on public.wishlist_items
      for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wishlist_items' and policyname = 'wishlist_items_delete_own') then
    create policy wishlist_items_delete_own on public.wishlist_items
      for delete to authenticated using (auth.uid() = user_id);
  end if;
end
$$;

revoke all on public.wishlist_items from anon;

insert into public.wishlist_items (user_id, book_key, title, author, isbn, cover_url, genre, page_count, added_at)
select b.user_id,
      coalesce(nullif(lower(coalesce(b.isbn, '')), ''), lower(b.title || '|' || coalesce(b.author, ''))),
       b.title,
       b.author,
       nullif(btrim(coalesce(b.isbn, '')), ''),
       b.cover_url,
       b.genre,
       b.page_count,
       coalesce(b.created_at, now())
from public.books b
where b.user_id is not null and b.ownership_status = 'wishlist'
on conflict (user_id, book_key) do nothing;