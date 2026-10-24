-- Shelves can hold any book (wishlists, etc.) without it being in the user's library.
create table if not exists public.shelf_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shelf_id uuid not null references public.shelves(id) on delete cascade,
  book_key text not null,
  title text not null,
  author text,
  isbn text,
  cover_url text,
  genre text,
  page_count integer,
  added_at timestamptz not null default now(),
  unique (shelf_id, book_key)
);

create index if not exists shelf_items_user_id_idx on public.shelf_items(user_id);

alter table public.shelf_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shelf_items' and policyname = 'shelf_items_select_own') then
    create policy shelf_items_select_own on public.shelf_items
      for select to authenticated using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shelf_items' and policyname = 'shelf_items_insert_own') then
    create policy shelf_items_insert_own on public.shelf_items
      for insert to authenticated with check (
        auth.uid() = user_id
        and exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = auth.uid())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shelf_items' and policyname = 'shelf_items_delete_own') then
    create policy shelf_items_delete_own on public.shelf_items
      for delete to authenticated using (auth.uid() = user_id);
  end if;
end
$$;

revoke all on public.shelf_items from anon;
