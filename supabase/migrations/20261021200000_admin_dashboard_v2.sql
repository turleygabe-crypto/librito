-- Admin dashboard v2: richer reports plus a user list. All admin-only.
create or replace function public.admin_stats(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  d integer := greatest(1, least(coalesce(days, 30), 365));
  since timestamptz := now() - make_interval(days => d);
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
      'new', (select count(*) from auth.users where created_at >= since),
      'active_24h', (select count(*) from auth.users where last_sign_in_at >= now() - interval '1 day'),
      'active_7d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days'),
      'active_30d', (select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days')
    ),
    'books', jsonb_build_object(
      'total', (select count(*) from public.books),
      'new', (select count(*) from public.books where created_at >= since),
      'avg_per_user', (select coalesce(round(count(*)::numeric / nullif(count(distinct user_id), 0), 1), 0) from public.books),
      'by_status', (select coalesce(jsonb_object_agg(s, c), '{}'::jsonb)
        from (select coalesce(nullif(reading_status, ''), 'unset') as s, count(*) as c from public.books group by 1) x),
      'top_genres', (select coalesce(jsonb_agg(jsonb_build_object('name', g, 'count', c)), '[]'::jsonb)
        from (select genre as g, count(*) as c from public.books where coalesce(genre, '') <> '' group by 1 order by 2 desc limit 8) x),
      'top_authors', (select coalesce(jsonb_agg(jsonb_build_object('name', a, 'count', c)), '[]'::jsonb)
        from (select author as a, count(*) as c from public.books where coalesce(author, '') <> '' group by 1 order by 2 desc limit 8) x),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'author', author, 'created_at', created_at)), '[]'::jsonb)
        from (select title, author, created_at from public.books order by created_at desc limit 10) x)
    ),
    'shelves', jsonb_build_object(
      'total', (select count(*) from public.shelves),
      'new', (select count(*) from public.shelves where created_at >= since),
      'avg_per_user', (select coalesce(round(count(*)::numeric / nullif(count(distinct user_id), 0), 1), 0) from public.shelves),
      'popular', (select coalesce(jsonb_agg(jsonb_build_object('name', n, 'count', c)), '[]'::jsonb)
        from (select s.name as n, count(bs.book_id) as c from public.shelves s
              left join public.book_shelves bs on bs.shelf_id = s.id
              group by s.id, s.name order by 2 desc limit 8) x)
    ),
    'likes', (select count(*) from public.liked_books),
    'likes_new', (select count(*) from public.liked_books where created_at >= since),
    'signups_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day), '[]'::jsonb)
      from (select created_at::date as day, count(*) as c from auth.users where created_at >= since group by 1) x),
    'books_by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'count', c) order by day), '[]'::jsonb)
      from (select created_at::date as day, count(*) as c from public.books where created_at >= since group by 1) x),
    'books_by_weekday', (select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'count', c) order by dow), '[]'::jsonb)
      from (select extract(dow from created_at)::int as dow, count(*) as c from public.books where created_at >= since group by 1) x),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'who', who, 'at', at) order by at desc), '[]'::jsonb)
      from (
        (select 'signup' as kind, 'New reader registered' as label, email::text as who, created_at as at
           from auth.users order by created_at desc limit 8)
        union all
        (select 'book', 'Added "' || b.title || '"', u.email::text, b.created_at
           from public.books b left join auth.users u on u.id = b.user_id order by b.created_at desc limit 8)
        union all
        (select 'shelf', 'Created shelf "' || s.name || '"', u.email::text, s.created_at
           from public.shelves s left join auth.users u on u.id = s.user_id order by s.created_at desc limit 8)
      ) a
      where at is not null
      limit 12)
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return (select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select u.id, u.email, u.created_at, u.last_sign_in_at,
        (select count(*) from public.books b where b.user_id = u.id) as books,
        (select count(*) from public.shelves s where s.user_id = u.id) as shelves,
        (select count(*) from public.liked_books l where l.user_id = u.id) as likes,
        exists (select 1 from public.admins a where a.user_id = u.id) as is_admin
      from auth.users u
      order by u.created_at desc
      limit 2000
    ) x);
end;
$$;

revoke all on function public.admin_stats(integer) from public, anon;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_stats(integer) to authenticated;
grant execute on function public.admin_users() to authenticated;
