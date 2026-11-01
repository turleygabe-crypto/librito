begin;

do $$
declare
  target_table text;
begin
  for target_table in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and rowsecurity
      and (tablename like 'marketplace_%' or tablename in ('seller_profiles', 'seller_storefronts', 'shop_staff'))
  loop
    execute format('drop policy if exists marketplace_admin_access on public.%I', target_table);
    execute format(
      'create policy marketplace_admin_access on public.%I as permissive for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      target_table
    );
    execute format('drop policy if exists marketplace_admin_only_gate on public.%I', target_table);
    execute format(
      'create policy marketplace_admin_only_gate on public.%I as restrictive for all to anon, authenticated using (public.is_admin()) with check (public.is_admin())',
      target_table
    );
  end loop;
end;
$$;

drop policy if exists marketplace_listing_photo_admin_access on storage.objects;
create policy marketplace_listing_photo_admin_access on storage.objects
for all to authenticated using (
  bucket_id = 'marketplace-listing-photos' and public.is_admin()
)
with check (
  bucket_id = 'marketplace-listing-photos' and public.is_admin()
);

drop policy if exists marketplace_listing_photo_admin_gate on storage.objects;
create policy marketplace_listing_photo_admin_gate on storage.objects
as restrictive for all to anon, authenticated
using (
  bucket_id <> 'marketplace-listing-photos' or public.is_admin()
)
with check (
  bucket_id <> 'marketplace-listing-photos' or public.is_admin()
);

create or replace function public.marketplace_admin_quote(target_listing uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Marketplace is coming soon.' using errcode = '42501';
  end if;
  return public.marketplace_quote(target_listing);
end;
$$;

create or replace function public.marketplace_admin_create_mock_order(
  target_listing uuid,
  request_key uuid,
  recipient_name text,
  address_line_1 text,
  address_line_2 text,
  city text,
  region text,
  postal_code text,
  country_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Marketplace is coming soon.' using errcode = '42501';
  end if;
  return public.marketplace_create_mock_order(
    target_listing, request_key, recipient_name, address_line_1, address_line_2,
    city, region, postal_code, country_code
  );
end;
$$;

revoke all on function public.marketplace_admin_quote(uuid) from public, anon;
grant execute on function public.marketplace_admin_quote(uuid) to authenticated;
revoke all on function public.marketplace_admin_create_mock_order(uuid, uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.marketplace_admin_create_mock_order(uuid, uuid, text, text, text, text, text, text, text)
  to authenticated;
revoke all on function public.marketplace_quote(uuid) from public, anon, authenticated;
revoke all on function public.marketplace_create_mock_order(uuid, uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;

commit;
