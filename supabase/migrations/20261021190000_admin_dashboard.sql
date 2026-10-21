-- Admin dashboard: access is enforced in the database, not the client.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS on with no policies: the table is unreadable through the API.
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.admin_stats(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  d integer := greatest(1, least(coalesce(days, 30), 365));
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'range_days', d,
    'generated_at', now(),
    'users', jsonb_build_object(
      'total', (select count(*) from auth.users),
      'new', (select count(*) from auth.users where created_at >= now() - make_interval(days => d)),
      'active_24h', (select count(*) from auth.users where last_sign_in_at >= now() - interval '1 day'),
      'active_7d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
      'active_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days')
    ),
    'books', jsonb_build_object(
      'total', (select count(*) from public.books),
      'new', (select count(*) from public.books where created_at >= now() - make_interval(days => d)),
      'avg_per_user', (select coalesce(round(count(*)::numeric / nullif(count(distinct user_id), 0), 1), 0) from public.books),
      'by_status', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb)
        from (select coalesce(nullif(reading_status, ''), 'unset') as s, count(*) as c from public.books group by 1) x),
      'top_genres', (select coalesce(jsonb_agg(jsonb_build_object('name', g, 'count', c)), '[]'::jsonb)
        from (select genre as g, count(*) as c from public.books where coalesce(genre, '') <> '' group by 1 order by 2 desc limit 8) x)
    ),
    'shelves', jsonb_build_object(
      'total', (select count(*) from public.shelves),
      'new', (select count(*) from public.shelves where created_at >= now() - make_interval(days => d))
    ),
    'likes', (select count(*) from public.liked_books),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day), '[]'::jsonb)
      from (select created_at::date as day, count(*) as c from auth.users
            where created_at >= now() - make_interval(days => d) group by 1) x),
    'books_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day), '[]'::jsonb)
      from (select created_at::date as day, count(*) as c from public.books
            where created_at >= now() - make_interval(days => d) group by 1) x)
  ) into result;

  return result;
end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_stats(integer) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_stats(integer) to authenticated;

-- Grant yourself access (run manually in the SQL editor):
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
