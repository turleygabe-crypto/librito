-- Wishlist is a built-in shelf every user always has. It is created automatically,
-- can't be renamed or deleted by the user, and never counts toward the Lite Reader shelf limit.
alter table public.shelves add column if not exists is_wishlist boolean not null default false;

-- Existing user-made shelves named "Wishlist" become the built-in one (keeping their items);
-- any extra look-alikes are renamed so the name is reserved.
alter table public.shelves disable trigger enforce_shelf_limit;

with ranked as (
  select id, row_number() over (partition by user_id order by created_at, id) as rn
  from public.shelves
  where lower(btrim(name)) = 'wishlist'
)
update public.shelves s
set is_wishlist = (ranked.rn = 1),
    name = case when ranked.rn = 1 then 'Wishlist' else 'Wishlist (' || ranked.rn || ')' end
from ranked
where s.id = ranked.id;

alter table public.shelves enable trigger enforce_shelf_limit;

create unique index if not exists shelves_one_wishlist_per_user
  on public.shelves(user_id) where is_wishlist;

-- Users can neither create nor edit/delete the built-in shelf, nor flag their own shelf as it.
drop policy if exists shelves_insert_own on public.shelves;
create policy shelves_insert_own on public.shelves
  for insert to authenticated with check (auth.uid() = user_id and not is_wishlist);

drop policy if exists shelves_update_own on public.shelves;
create policy shelves_update_own on public.shelves
  for update to authenticated using (auth.uid() = user_id and not is_wishlist)
  with check (auth.uid() = user_id and not is_wishlist);

drop policy if exists shelves_delete_own on public.shelves;
create policy shelves_delete_own on public.shelves
  for delete to authenticated using (auth.uid() = user_id and not is_wishlist);

-- The name "Wishlist" is reserved for the built-in shelf.
create or replace function public.reserve_wishlist_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not new.is_wishlist and lower(btrim(new.name)) = 'wishlist' then
    raise exception '“Wishlist” is a built-in shelf. Choose another name.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists reserve_wishlist_name on public.shelves;
create trigger reserve_wishlist_name before insert or update of name on public.shelves
for each row execute procedure public.reserve_wishlist_name();

-- The built-in shelf doesn't count toward the Lite Reader shelf limit.
create or replace function public.enforce_tier_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_tier text;
begin
  if tg_table_name = 'shelves' and new.is_wishlist then
    return new;
  end if;

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
    if (select count(*) from public.shelves
        where user_id = new.user_id and not is_wishlist and id is distinct from new.id) >= 5 then
      raise exception 'Lite Reader accounts are limited to 5 shelves. Upgrade to Book Lover for more.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_tier_limits() from public, anon, authenticated;

-- Every profile gets its Wishlist automatically.
create or replace function public.create_wishlist_shelf()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shelves (user_id, name, color, is_wishlist)
  values (new.id, 'Wishlist', '#b64d2c', true)
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.create_wishlist_shelf() from public, anon, authenticated;

drop trigger if exists create_wishlist_shelf on public.profiles;
create trigger create_wishlist_shelf after insert on public.profiles
for each row execute procedure public.create_wishlist_shelf();

-- Backfill existing users.
insert into public.shelves (user_id, name, color, is_wishlist)
select p.id, 'Wishlist', '#b64d2c', true
from public.profiles p
where not exists (select 1 from public.shelves s where s.user_id = p.id and s.is_wishlist)
on conflict do nothing;
