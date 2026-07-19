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
  isbn text,
  shelf text,
  cost numeric(10,2) default 0,
  added_on date not null default current_date,
  notes text,
  cover_url text,
  created_at timestamptz default now()
);

create table if not exists public.shelves (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  color text default '#8b5e3c',
  created_at timestamptz default now()
);

create index if not exists books_user_id_idx on public.books(user_id);
create index if not exists books_isbn_idx on public.books(isbn);
create index if not exists shelves_user_id_idx on public.shelves(user_id);

alter table public.books enable row level security;
alter table public.shelves enable row level security;

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
end
$$;
