create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  email text unique,
  full_name text,
  favorite_shelf text,
  created_at timestamptz default now()
);

create table if not exists public.books (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  author text,
  genre text,
  isbn text,
  shelf text,
  reading_status text,
  disposition text,
  current_page integer not null default 0,
  edition_progress jsonb not null default '{}'::jsonb,
  bookmarked_at timestamptz,
  page_count integer,
  cost numeric(10,2) default 0,
  added_on date not null default current_date,
  notes text,
  cover_url text,
  created_at timestamptz default now()
);

alter table public.books add column if not exists genre text;
alter table public.books add column if not exists reading_status text;
alter table public.books add column if not exists disposition text;
alter table public.books add column if not exists current_page integer not null default 0;
alter table public.books add column if not exists edition_progress jsonb not null default '{}'::jsonb;
alter table public.books add column if not exists bookmarked_at timestamptz;
alter table public.books add column if not exists page_count integer;

create table if not exists public.shelves (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  color text default '#8b5e3c',
  created_at timestamptz default now()
);

create table if not exists public.book_shelves (
  book_id uuid not null references public.books(id) on delete cascade,
  shelf_id uuid not null references public.shelves(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  position integer not null default 0,
  primary key (book_id, shelf_id)
);

create table if not exists public.liked_books (
  user_id uuid not null references public.profiles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

create index if not exists books_user_id_idx on public.books(user_id);
create index if not exists books_isbn_idx on public.books(isbn);
create index if not exists shelves_user_id_idx on public.shelves(user_id);
create index if not exists book_shelves_user_id_idx on public.book_shelves(user_id);
create index if not exists liked_books_user_id_idx on public.liked_books(user_id);

alter table public.books enable row level security;
alter table public.shelves enable row level security;
alter table public.book_shelves enable row level security;
alter table public.liked_books enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'books' and policyname = 'books_select_own'
  ) then
    create policy books_select_own on public.books
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'books' and policyname = 'books_insert_own'
  ) then
    create policy books_insert_own on public.books
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'books' and policyname = 'books_update_own'
  ) then
    create policy books_update_own on public.books
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'books' and policyname = 'books_delete_own'
  ) then
    create policy books_delete_own on public.books
      for delete using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shelves' and policyname = 'shelves_select_own'
  ) then
    create policy shelves_select_own on public.shelves
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shelves' and policyname = 'shelves_insert_own'
  ) then
    create policy shelves_insert_own on public.shelves
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shelves' and policyname = 'shelves_update_own'
  ) then
    create policy shelves_update_own on public.shelves
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'shelves' and policyname = 'shelves_delete_own'
  ) then
    create policy shelves_delete_own on public.shelves
      for delete using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'book_shelves' and policyname = 'book_shelves_select_own'
  ) then
    create policy book_shelves_select_own on public.book_shelves
      for select using (
        auth.uid() = user_id
        and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
        and exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'book_shelves' and policyname = 'book_shelves_insert_own'
  ) then
    create policy book_shelves_insert_own on public.book_shelves
      for insert with check (
        auth.uid() = user_id
        and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
        and exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'book_shelves' and policyname = 'book_shelves_delete_own'
  ) then
    create policy book_shelves_delete_own on public.book_shelves
      for delete using (
        auth.uid() = user_id
        and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
        and exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'liked_books' and policyname = 'liked_books_select_own'
  ) then
    create policy liked_books_select_own on public.liked_books
      for select using (
        auth.uid() = user_id
        and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'liked_books' and policyname = 'liked_books_insert_own'
  ) then
    create policy liked_books_insert_own on public.liked_books
      for insert with check (
        auth.uid() = user_id
        and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'liked_books' and policyname = 'liked_books_delete_own'
  ) then
    create policy liked_books_delete_own on public.liked_books
      for delete using (
        auth.uid() = user_id
        and exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid())
      );
  end if;
end
$$;

insert into public.book_shelves (book_id, shelf_id, user_id)
select books.id, shelves.id, books.user_id
from public.books
join public.shelves
  on shelves.user_id = books.user_id
 and shelves.name = books.shelf
where books.shelf is not null
  and books.user_id is not null
on conflict (book_id, shelf_id) do nothing;

alter table public.profiles enable row level security;
-- See migrations/20261023140000_profiles_rls.sql for profiles policies.

-- Shelf items: books saved to a shelf without being in the library (wishlists, shopping lists).
-- See migrations/20261024180000_shelf_items.sql.
