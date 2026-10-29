create table if not exists public.status_shelf_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  filter_key text not null check (filter_key in ('next_read', 'reading', 'read', 'dnf', 'owned')),
  created_at timestamptz not null default now(),
  primary key (user_id, filter_key)
);

alter table public.status_shelf_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'status_shelf_preferences'
      and policyname = 'status_shelf_preferences_select_own'
  ) then
    create policy status_shelf_preferences_select_own
      on public.status_shelf_preferences for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'status_shelf_preferences'
      and policyname = 'status_shelf_preferences_insert_own'
  ) then
    create policy status_shelf_preferences_insert_own
      on public.status_shelf_preferences for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'status_shelf_preferences'
      and policyname = 'status_shelf_preferences_delete_own'
  ) then
    create policy status_shelf_preferences_delete_own
      on public.status_shelf_preferences for delete
      using (auth.uid() = user_id);
  end if;
end
$$;
