-- Lite Reader accounts can have at most 5 books in Currently Reading.
create or replace function public.enforce_reading_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_tier text;
begin
  if new.reading_status is distinct from 'reading' or new.disposition is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.reading_status is not distinct from 'reading' and old.disposition is null then
    return new;
  end if;

  select tier into user_tier from public.profiles where id = new.user_id;
  if coalesce(user_tier, 'lite_reader') <> 'lite_reader' then
    return new;
  end if;

  if (select count(*) from public.books
      where user_id = new.user_id and reading_status = 'reading' and disposition is null
        and id is distinct from new.id) >= 5 then
    raise exception 'Lite Reader accounts are limited to 5 books in Currently Reading. Upgrade to Book Lover for more.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_reading_limit() from public, anon, authenticated;

drop trigger if exists enforce_reading_limit on public.books;
create trigger enforce_reading_limit before insert or update of reading_status, disposition on public.books
for each row execute procedure public.enforce_reading_limit();
