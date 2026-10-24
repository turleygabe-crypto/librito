-- Admin dashboard: show each user's tier and let admins grant/revoke Book Lover.
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
        exists (select 1 from public.admins a where a.user_id = u.id) as is_admin,
        coalesce((select p.tier from public.profiles p where p.id = u.id), 'lite_reader') as tier
      from auth.users u
      order by u.created_at desc
      limit 2000
    ) x);
end;
$$;

create or replace function public.admin_set_tier(target_user uuid, new_tier text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_tier not in ('lite_reader', 'book_lover') then
    raise exception 'invalid tier' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  -- Older accounts may not have a profile row yet.
  insert into public.profiles (id, email, full_name, tier)
  select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email), new_tier
  from auth.users u where u.id = target_user
  on conflict (id) do update set tier = excluded.tier;

  return new_tier;
end;
$$;

revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_set_tier(uuid, text) from public, anon;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_set_tier(uuid, text) to authenticated;
