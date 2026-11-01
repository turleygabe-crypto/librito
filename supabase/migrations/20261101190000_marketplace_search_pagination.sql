begin;

create index marketplace_listings_available_order_idx
  on public.marketplace_listings (created_at desc, id desc)
  where status = 'active' and quantity > 0;

create or replace function public.marketplace_search_listings(
  search_text text default null,
  page_offset integer default 0,
  page_size integer default 24
)
returns setof public.marketplace_listings
language sql
stable
set search_path = public
as $$
  select listing.*
  from public.marketplace_listings listing
  where listing.status = 'active'
    and listing.quantity > 0
    and (
      nullif(btrim(search_text), '') is null
      or listing.title ilike '%' || btrim(search_text) || '%'
      or listing.author ilike '%' || btrim(search_text) || '%'
      or coalesce(listing.isbn, '') ilike '%' || btrim(search_text) || '%'
    )
  order by listing.created_at desc, listing.id desc
  limit least(greatest(coalesce(page_size, 24), 1), 50)
  offset greatest(coalesce(page_offset, 0), 0);
$$;
revoke all on function public.marketplace_search_listings(text, integer, integer) from public;
grant execute on function public.marketplace_search_listings(text, integer, integer) to anon, authenticated;

commit;
