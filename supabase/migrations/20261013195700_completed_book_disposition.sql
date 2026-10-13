alter table public.books add column if not exists disposition text;

do $$
declare
  existing_shelf record;
  renamed_shelf text;
  suffix integer;
begin
  for existing_shelf in
    select id, user_id, name
    from public.shelves
    where lower(name) = 'completed books'
  loop
    renamed_shelf := 'Completed Books (Custom)';
    suffix := 2;
    while exists (
      select 1
      from public.shelves other_shelf
      where other_shelf.id <> existing_shelf.id
        and other_shelf.user_id is not distinct from existing_shelf.user_id
        and lower(other_shelf.name) = lower(renamed_shelf)
    ) loop
      renamed_shelf := format('Completed Books (Custom %s)', suffix);
      suffix := suffix + 1;
    end loop;

    update public.books
    set shelf = renamed_shelf
    where user_id is not distinct from existing_shelf.user_id
      and shelf = existing_shelf.name;

    update public.shelves
    set name = renamed_shelf
    where id = existing_shelf.id;
  end loop;
end
$$;
