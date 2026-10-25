-- Keep legacy book assignments in sync in the same transaction as shelf changes.
create or replace function public.sync_shelf_book_names()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.books set shelf = null
    where user_id = old.user_id and shelf = old.name;
    return old;
  end if;

  if new.name is distinct from old.name then
    update public.books set shelf = new.name
    where user_id = old.user_id and shelf = old.name;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_shelf_book_names() from public, anon, authenticated;

drop trigger if exists sync_shelf_book_names on public.shelves;
create trigger sync_shelf_book_names before update of name or delete on public.shelves
for each row execute procedure public.sync_shelf_book_names();
