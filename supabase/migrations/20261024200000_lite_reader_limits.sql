-- Lite Reader limits: 100 books and 5 custom shelves (a shelf named "Wishlist" doesn't count).
-- Library and Liked Books are built-in views, not rows in public.shelves.
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
    if lower(btrim(new.name)) <> 'wishlist'
       and (select count(*) from public.shelves
            where user_id = new.user_id
              and lower(btrim(name)) <> 'wishlist'
              and id is distinct from new.id) >= 5 then
      raise exception 'Lite Reader accounts are limited to 5 shelves. Upgrade to Book Lover for more.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_tier_limits() from public, anon, authenticated;

drop trigger if exists enforce_book_limit on public.books;
create trigger enforce_book_limit before insert on public.books
for each row execute procedure public.enforce_tier_limits();

drop trigger if exists enforce_shelf_limit on public.shelves;
create trigger enforce_shelf_limit before insert or update of name on public.shelves
for each row execute procedure public.enforce_tier_limits();
