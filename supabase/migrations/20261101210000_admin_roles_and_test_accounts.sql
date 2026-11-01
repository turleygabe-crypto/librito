-- Role changes use the same database-enforced admin access as the dashboard.
create or replace function public.admin_set_role(target_user uuid, new_role text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Serialize grants/revocations and recheck access after waiting for the lock.
  lock table public.admins in share row exclusive mode;
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_role is null or new_role not in ('reader', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if target_user = auth.uid() and new_role = 'reader' then
    raise exception 'You cannot remove your own admin access. Ask another admin.'
      using errcode = '42501';
  end if;
  if new_role = 'admin' then
    insert into public.admins (user_id) values (target_user) on conflict (user_id) do nothing;
  else
    delete from public.admins where user_id = target_user;
  end if;
  return new_role;
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
  return (
    select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select u.id, u.email, u.created_at, u.last_sign_in_at,
        (select count(*) from public.books b where b.user_id = u.id) as books,
        (select count(*) from public.shelves s where s.user_id = u.id) as shelves,
        (select count(*) from public.liked_books l where l.user_id = u.id) as likes,
        exists (select 1 from public.admins a where a.user_id = u.id) as is_admin,
        coalesce(u.raw_app_meta_data->>'is_test_account', 'false') = 'true' as is_test_account,
        coalesce(p.tier, 'free') as tier,
        coalesce(p.complimentary_book_lover, false) as complimentary_book_lover,
        coalesce(p.complimentary_bookshop_pro, false) as complimentary_bookshop_pro
      from auth.users u left join public.profiles p on p.id = u.id
      order by u.created_at desc limit 2000
    ) x
  );
end;
$$;

revoke all on function public.admin_set_role(uuid, text) from public, anon;
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_users() to authenticated;
