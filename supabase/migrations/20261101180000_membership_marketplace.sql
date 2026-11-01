begin;

alter table public.profiles
  add column if not exists complimentary_bookshop_pro boolean not null default false;

alter table public.profiles drop constraint if exists profiles_tier_check;
update public.profiles set tier = 'free' where tier = 'lite_reader';
alter table public.profiles add constraint profiles_tier_check
  check (tier in ('free', 'lite_reader', 'book_lover', 'bookshop_pro'));

alter table public.billing_accounts
  add column if not exists subscription_plan text;
update public.billing_accounts
set subscription_plan = 'book_lover'
where has_access and subscription_plan is null;

create or replace function public.derive_profile_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  billing_plan text;
begin
  if new.complimentary_bookshop_pro then
    new.tier := 'bookshop_pro';
    return new;
  end if;
  select b.subscription_plan into billing_plan
  from public.billing_accounts b
  join public.billing_environment e on e.id and e.livemode = b.livemode
  where b.user_id = new.id and b.has_access
  order by b.livemode desc
  limit 1;
  new.tier := case
    when billing_plan in ('book_lover', 'bookshop_pro') then billing_plan
    when new.complimentary_book_lover then 'book_lover'
    else 'free'
  end;
  return new;
end;
$$;

drop trigger if exists billing_sync_tier on public.billing_accounts;
create trigger billing_sync_tier after insert or update of has_access, subscription_plan on public.billing_accounts
for each row execute function public.sync_billing_tier();

drop trigger if exists profiles_derive_tier on public.profiles;
create trigger profiles_derive_tier before insert or update on public.profiles
for each row execute function public.derive_profile_tier();

create or replace function public.sync_billing_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set tier = tier where id = new.user_id;
  return new;
end;
$$;

create or replace function public.admin_set_tier(target_user uuid, new_tier text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  effective_tier text;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if new_tier is null or new_tier not in ('free', 'lite_reader', 'book_lover', 'bookshop_pro') then
    raise exception 'invalid tier' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  insert into public.profiles (id, email, full_name, complimentary_book_lover, complimentary_bookshop_pro)
  select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email),
    new_tier = 'book_lover', new_tier = 'bookshop_pro'
  from auth.users u where u.id = target_user
  on conflict (id) do update set
    complimentary_book_lover = excluded.complimentary_book_lover,
    complimentary_bookshop_pro = excluded.complimentary_bookshop_pro
  returning tier into effective_tier;
  return effective_tier;
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
        coalesce(p.tier, 'free') as tier,
        coalesce(p.complimentary_book_lover, false) as complimentary_book_lover,
        coalesce(p.complimentary_bookshop_pro, false) as complimentary_bookshop_pro
      from auth.users u left join public.profiles p on p.id = u.id
      order by u.created_at desc limit 2000
    ) x
  );
end;
$$;

alter table public.profiles
  add constraint profiles_complimentary_plan_guard
  check (not (complimentary_book_lover and complimentary_bookshop_pro));

revoke insert, update on public.profiles from authenticated;
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('tier', 'complimentary_book_lover', 'complimentary_bookshop_pro');
  execute format('grant insert (%s) on public.profiles to authenticated', cols);
  execute format('grant update (%s) on public.profiles to authenticated', cols);
end;
$$;

create table public.marketplace_settings (
  id boolean primary key default true check (id),
  commission_basis_points integer not null default 500 check (commission_basis_points between 0 and 10000),
  processing_estimate_basis_points integer not null default 290 check (processing_estimate_basis_points between 0 and 10000),
  processing_estimate_flat_cents integer not null default 30 check (processing_estimate_flat_cents >= 0),
  deployment_environment text not null default 'unconfigured'
    check (deployment_environment in ('unconfigured', 'development', 'test', 'production')),
  mock_payments_enabled boolean not null default false,
  live_payments_enabled boolean not null default false check (not live_payments_enabled),
  tax_calculation_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.marketplace_settings (id) values (true);
alter table public.marketplace_settings enable row level security;
revoke all on public.marketplace_settings from public, anon, authenticated;
grant select, update on public.marketplace_settings to service_role;

create table public.seller_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seller_type text not null default 'personal' check (seller_type in ('personal', 'bookshop')),
  display_name text not null,
  contact_email text,
  location text,
  business_description text,
  payment_onboarding_status text not null default 'not_started'
    check (payment_onboarding_status in ('not_started', 'incomplete', 'pending_review', 'restricted', 'ready')),
  connected_account_id text unique,
  payouts_enabled boolean not null default false,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.seller_profiles enable row level security;
create policy seller_profiles_owner_select on public.seller_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy seller_profiles_owner_insert on public.seller_profiles
  for insert to authenticated with check (
    auth.uid() = user_id and connected_account_id is null and not payouts_enabled
    and payment_onboarding_status = 'not_started'
  );
create policy seller_profiles_owner_update on public.seller_profiles
  for update to authenticated using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and connected_account_id is null and not payouts_enabled
    and payment_onboarding_status in ('not_started', 'incomplete')
  );
revoke all on public.seller_profiles from anon;
revoke select on public.seller_profiles from authenticated;
grant select (user_id, display_name, location, seller_type)
  on public.seller_profiles to anon, authenticated;
grant insert, update on public.seller_profiles to authenticated;

create or replace function public.guard_seller_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_name text;
begin
  select tier into plan_name from public.profiles where id = new.user_id;
  if new.seller_type = 'bookshop' and coalesce(plan_name, 'free') <> 'bookshop_pro' then
    raise exception 'A current Bookshop Pro plan is required for business seller onboarding.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    new.connected_account_id is distinct from old.connected_account_id
    or new.payment_onboarding_status is distinct from old.payment_onboarding_status
    or new.payouts_enabled is distinct from old.payouts_enabled
    or new.suspended_at is distinct from old.suspended_at
  ) and not public.is_admin() then
    raise exception 'Payment onboarding and seller status are managed by Librito.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger seller_profile_guard before insert or update on public.seller_profiles
for each row execute function public.guard_seller_profile();
revoke all on function public.guard_seller_profile() from public, anon, authenticated;

create table public.seller_storefronts (
  seller_id uuid primary key references public.seller_profiles(user_id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  store_name text not null,
  description text not null default '',
  location text not null default '',
  logo_path text,
  policies text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.seller_storefronts enable row level security;
create policy seller_storefronts_public_select on public.seller_storefronts
  for select to anon, authenticated using (published or auth.uid() = seller_id);
create policy seller_storefronts_owner_insert on public.seller_storefronts
  for insert to authenticated with check (auth.uid() = seller_id and not published);
create policy seller_storefronts_owner_update on public.seller_storefronts
  for update to authenticated using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);
grant select on public.seller_storefronts to anon, authenticated;
grant insert, update on public.seller_storefronts to authenticated;

create or replace function public.guard_seller_storefront()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_name text;
  seller_type text;
begin
  select p.tier, s.seller_type into plan_name, seller_type
  from public.profiles p join public.seller_profiles s on s.user_id = p.id
  where p.id = new.seller_id and s.suspended_at is null;
  if not found or seller_type <> 'bookshop' or plan_name <> 'bookshop_pro' then
    raise exception 'A current Bookshop Pro plan is required for a business storefront.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger seller_storefront_guard before insert or update on public.seller_storefronts
for each row execute function public.guard_seller_storefront();
revoke all on function public.guard_seller_storefront() from public, anon, authenticated;

create table public.shop_staff (
  shop_owner_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (shop_owner_id, member_user_id)
);
alter table public.shop_staff enable row level security;
create policy shop_staff_owner_select on public.shop_staff
  for select to authenticated using (auth.uid() = shop_owner_id or auth.uid() = member_user_id);
revoke all on public.shop_staff from anon;
grant select on public.shop_staff to authenticated;

create table public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete restrict,
  personal_book_id uuid references public.books(id) on delete set null,
  catalog_book_id text,
  edition_id text,
  isbn text,
  title text not null,
  normalized_title text generated always as (lower(regexp_replace(btrim(title), '\s+', ' ', 'g'))) stored,
  author text not null default '',
  normalized_author text generated always as (lower(regexp_replace(btrim(author), '\s+', ' ', 'g'))) stored,
  genre text,
  book_format text,
  condition text not null check (condition in ('like_new', 'very_good', 'good', 'acceptable')),
  description text not null default '',
  price_cents integer not null check (price_cents > 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  quantity integer not null default 1 check (quantity >= 0),
  copy_key uuid not null default gen_random_uuid(),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'sold', 'removed', 'suspended')),
  view_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sold_at timestamptz,
  check (personal_book_id is null or seller_id is not null)
);
create policy seller_profiles_public_select on public.seller_profiles
  for select to anon, authenticated using (
    exists (select 1 from public.marketplace_listings l
      where l.seller_id = user_id and l.status = 'active')
    or exists (select 1 from public.seller_storefronts storefront
      where storefront.seller_id = user_id and storefront.published)
  );
create index marketplace_listings_public_idx
  on public.marketplace_listings (created_at desc) where status = 'active';
create index marketplace_listings_isbn_idx on public.marketplace_listings (isbn) where status = 'active';
create index marketplace_listings_edition_idx on public.marketplace_listings (edition_id) where status = 'active';
create index marketplace_listings_book_idx on public.marketplace_listings (catalog_book_id) where status = 'active';
create index marketplace_listings_search_idx
  on public.marketplace_listings (normalized_title, normalized_author) where status = 'active';
create unique index marketplace_personal_copy_active_unique
  on public.marketplace_listings (seller_id, copy_key)
  where status in ('draft', 'active', 'paused') and quantity > 0;
alter table public.marketplace_listings enable row level security;
create policy marketplace_listings_public_select on public.marketplace_listings
  for select to anon, authenticated using (status = 'active' or auth.uid() = seller_id);
create policy marketplace_listings_owner_insert on public.marketplace_listings
  for insert to authenticated with check (auth.uid() = seller_id and status = 'draft' and quantity > 0);
create policy marketplace_listings_owner_update on public.marketplace_listings
  for update to authenticated using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id and status in ('draft', 'active', 'paused', 'removed'));
create policy marketplace_listings_owner_delete on public.marketplace_listings
  for delete to authenticated using (auth.uid() = seller_id and status = 'draft');
grant select on public.marketplace_listings to anon, authenticated;
grant insert, update, delete on public.marketplace_listings to authenticated;

create or replace function public.guard_marketplace_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_type text;
  plan_name text;
  photos integer;
begin
  select sp.seller_type, p.tier into seller_type, plan_name
  from public.seller_profiles sp join public.profiles p on p.id = sp.user_id
  where sp.user_id = new.seller_id and sp.suspended_at is null;
  if not found then
    raise exception 'Complete seller onboarding before listing a book.' using errcode = '42501';
  end if;
  if seller_type = 'bookshop' and coalesce(plan_name, 'free') <> 'bookshop_pro'
     and not public.is_admin()
     and not (
       tg_op = 'UPDATE' and old.status = 'active' and new.status = 'paused'
       and new.id = old.id and new.seller_id = old.seller_id
       and new.personal_book_id is not distinct from old.personal_book_id
       and new.catalog_book_id is not distinct from old.catalog_book_id
       and new.edition_id is not distinct from old.edition_id
       and new.isbn is not distinct from old.isbn
       and new.title = old.title and new.author = old.author
       and new.genre is not distinct from old.genre
       and new.book_format is not distinct from old.book_format
       and new.condition = old.condition and new.description = old.description
       and new.price_cents = old.price_cents and new.shipping_cents = old.shipping_cents
       and new.quantity = old.quantity and new.copy_key = old.copy_key
       and new.view_count = old.view_count and new.sold_at is not distinct from old.sold_at
       and new.created_at = old.created_at
     ) then
    raise exception 'A current Bookshop Pro plan is required for business inventory.' using errcode = '42501';
  end if;
  if seller_type = 'personal' and (
    new.quantity > 1 or (new.quantity = 0 and new.status <> 'sold')
  ) then
    raise exception 'Personal listings must represent one physical copy.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and new.status = 'active' and old.status <> 'active' then
    select count(*) into photos from public.marketplace_listing_photos
    where listing_id = new.id;
    if photos < 1 then
      raise exception 'Upload at least one real photo of this physical copy before publishing.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.status in ('active', 'paused') and new.status = 'active'
     and seller_type = 'bookshop' and coalesce(plan_name, 'free') <> 'bookshop_pro' then
    raise exception 'Renew Bookshop Pro before resuming business listings.' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger marketplace_listing_guard before insert or update on public.marketplace_listings
for each row execute function public.guard_marketplace_listing();
revoke all on function public.guard_marketplace_listing() from public, anon, authenticated;

create or replace function public.pause_expired_bookshop_listings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.tier = 'bookshop_pro' and new.tier <> 'bookshop_pro' then
    update public.marketplace_listings
    set status = 'paused', updated_at = now()
    where seller_id = new.id and status = 'active'
      and exists (select 1 from public.seller_profiles s
        where s.user_id = new.id and s.seller_type = 'bookshop');
  end if;
  return new;
end;
$$;
create trigger profiles_pause_bookshop_listings after update on public.profiles
for each row execute function public.pause_expired_bookshop_listings();
revoke all on function public.pause_expired_bookshop_listings() from public, anon, authenticated;

create table public.marketplace_listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  storage_path text not null unique,
  position smallint not null default 0 check (position between 0 and 20),
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);
alter table public.marketplace_listing_photos enable row level security;
create policy listing_photos_active_select on public.marketplace_listing_photos
  for select to anon, authenticated using (
    exists (select 1 from public.marketplace_listings l where l.id = listing_id and l.status = 'active')
    or auth.uid() = seller_id
  );
create policy listing_photos_owner_insert on public.marketplace_listing_photos
  for insert to authenticated with check (
    auth.uid() = seller_id and exists (
      select 1 from public.marketplace_listings l
      where l.id = listing_id and l.seller_id = auth.uid() and l.status = 'draft'
    )
  );
create policy listing_photos_owner_delete on public.marketplace_listing_photos
  for delete to authenticated using (auth.uid() = seller_id);
grant select on public.marketplace_listing_photos to anon, authenticated;
grant insert, delete on public.marketplace_listing_photos to authenticated;

create table public.marketplace_saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);
alter table public.marketplace_saved_listings enable row level security;
create policy marketplace_saved_own on public.marketplace_saved_listings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, delete on public.marketplace_saved_listings to authenticated;

create table public.marketplace_wishlist_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  isbn text,
  edition_id text,
  catalog_book_id text,
  normalized_title text not null,
  normalized_author text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index marketplace_wishlist_alert_identity
  on public.marketplace_wishlist_alerts (user_id, coalesce(isbn, ''), coalesce(edition_id, ''),
    coalesce(catalog_book_id, ''), normalized_title, normalized_author);
alter table public.marketplace_wishlist_alerts enable row level security;
create policy marketplace_wishlist_alerts_own on public.marketplace_wishlist_alerts
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.marketplace_wishlist_alerts to authenticated;

create table public.marketplace_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.marketplace_listings(id) on delete cascade,
  notification_type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index marketplace_notification_once_per_listing
  on public.marketplace_notifications (user_id, listing_id, notification_type)
  where listing_id is not null and notification_type = 'wishlist_available';
alter table public.marketplace_notifications enable row level security;
create policy marketplace_notifications_own on public.marketplace_notifications
  for select to authenticated using (auth.uid() = user_id);
grant select on public.marketplace_notifications to authenticated;
create policy marketplace_notifications_mark_own on public.marketplace_notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant update (read_at) on public.marketplace_notifications to authenticated;

create or replace function public.notify_marketplace_wishlist_matches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;
  insert into public.marketplace_notifications (user_id, listing_id, notification_type, payload)
  select a.user_id, new.id, 'wishlist_available',
    jsonb_build_object('title', new.title, 'author', new.author)
  from public.marketplace_wishlist_alerts a
  where a.enabled and a.user_id <> new.seller_id
    and (
      (a.isbn is not null and regexp_replace(upper(a.isbn), '[^0-9X]', '', 'g')
        = regexp_replace(upper(coalesce(new.isbn, '')), '[^0-9X]', '', 'g'))
      or (a.edition_id is not null and a.edition_id = new.edition_id)
      or (a.catalog_book_id is not null and a.catalog_book_id = new.catalog_book_id)
      or (a.normalized_title = new.normalized_title and
        (a.normalized_author = '' or a.normalized_author = new.normalized_author))
    )
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.notify_marketplace_wishlist_matches() from public, anon, authenticated;
create trigger marketplace_wishlist_notification after insert or update of status on public.marketplace_listings
for each row execute function public.notify_marketplace_wishlist_matches();

create table public.marketplace_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
create table public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.marketplace_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  reported_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.marketplace_user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.marketplace_conversations enable row level security;
alter table public.marketplace_messages enable row level security;
alter table public.marketplace_user_blocks enable row level security;
create policy marketplace_conversations_participant_select on public.marketplace_conversations
  for select to authenticated using (auth.uid() in (buyer_id, seller_id));
create policy marketplace_conversations_buyer_insert on public.marketplace_conversations
  for insert to authenticated with check (
    auth.uid() = buyer_id and exists (
      select 1 from public.marketplace_listings l
      where l.id = public.marketplace_conversations.listing_id
        and l.seller_id = public.marketplace_conversations.seller_id
    )
  );
create policy marketplace_messages_participant_select on public.marketplace_messages
  for select to authenticated using (
    exists (select 1 from public.marketplace_conversations c
      where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id))
  );
create policy marketplace_messages_participant_insert on public.marketplace_messages
  for insert to authenticated with check (
    auth.uid() = sender_id and exists (select 1 from public.marketplace_conversations c
      where c.id = conversation_id and auth.uid() in (c.buyer_id, c.seller_id))
    and not exists (select 1 from public.marketplace_user_blocks b
      join public.marketplace_conversations c on c.id = conversation_id
      where (b.blocker_id = c.buyer_id and b.blocked_id = c.seller_id)
         or (b.blocker_id = c.seller_id and b.blocked_id = c.buyer_id))
  );
create policy marketplace_user_blocks_own on public.marketplace_user_blocks
  for all to authenticated using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
grant select, insert on public.marketplace_conversations to authenticated;
grant select, insert on public.marketplace_messages to authenticated;
grant select, insert, delete on public.marketplace_user_blocks to authenticated;

create table public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(user_id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'payment_pending'
    check (status in ('payment_pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'disputed', 'test_simulated')),
  currency text not null default 'usd' check (currency = 'usd'),
  book_price_cents integer not null check (book_price_cents > 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  buyer_total_cents integer not null check (buyer_total_cents = book_price_cents + shipping_cents + tax_cents),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_id, idempotency_key),
  check (buyer_id <> seller_id)
);
create index marketplace_orders_seller_idx on public.marketplace_orders (seller_id, created_at desc);
create index marketplace_orders_buyer_idx on public.marketplace_orders (buyer_id, created_at desc);
alter table public.marketplace_orders enable row level security;
create policy marketplace_orders_participant_select on public.marketplace_orders
  for select to authenticated using (auth.uid() in (buyer_id, seller_id));
grant select on public.marketplace_orders to authenticated;

create table public.marketplace_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  listing_title text not null,
  listing_author text,
  isbn text,
  edition_id text,
  condition text not null,
  quantity integer not null check (quantity > 0),
  book_price_cents integer not null check (book_price_cents > 0),
  shipping_cents integer not null check (shipping_cents >= 0),
  commission_basis_points integer not null check (commission_basis_points between 0 and 10000),
  commission_cents integer not null check (commission_cents >= 0),
  estimated_processing_fee_cents integer check (estimated_processing_fee_cents >= 0),
  actual_processing_fee_cents integer check (actual_processing_fee_cents >= 0),
  estimated_seller_proceeds_cents integer check (estimated_seller_proceeds_cents >= 0),
  actual_seller_proceeds_cents integer check (actual_seller_proceeds_cents >= 0),
  created_at timestamptz not null default now()
);
create index marketplace_order_items_listing_idx on public.marketplace_order_items (listing_id);
alter table public.marketplace_order_items enable row level security;
create policy marketplace_order_items_participant_select on public.marketplace_order_items
  for select to authenticated using (
    exists (select 1 from public.marketplace_orders o where o.id = order_id
      and auth.uid() in (o.buyer_id, o.seller_id))
  );
grant select on public.marketplace_order_items to authenticated;

create table public.marketplace_order_shipping (
  order_id uuid primary key references public.marketplace_orders(id) on delete cascade,
  recipient_name text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  region text,
  postal_code text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);
alter table public.marketplace_order_shipping enable row level security;
create policy marketplace_order_shipping_buyer_select on public.marketplace_order_shipping
  for select to authenticated using (
    exists (select 1 from public.marketplace_orders o where o.id = order_id and o.buyer_id = auth.uid())
  );
create policy marketplace_order_shipping_seller_select on public.marketplace_order_shipping
  for select to authenticated using (
    exists (select 1 from public.marketplace_orders o where o.id = order_id and o.seller_id = auth.uid())
  );
grant select on public.marketplace_order_shipping to authenticated;

create table public.marketplace_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.marketplace_orders(id) on delete restrict,
  mode text not null check (mode in ('mock', 'stripe_test', 'stripe_live')),
  provider text not null check (provider in ('none', 'stripe')),
  provider_payment_id text unique,
  status text not null check (status in ('simulation_only', 'requires_payment_method', 'processing', 'succeeded', 'failed', 'refunded', 'disputed')),
  gross_amount_cents integer not null check (gross_amount_cents >= 0),
  commission_cents integer not null check (commission_cents >= 0),
  estimated_processing_fee_cents integer check (estimated_processing_fee_cents >= 0),
  actual_processing_fee_cents integer check (actual_processing_fee_cents >= 0),
  seller_proceeds_cents integer check (seller_proceeds_cents >= 0),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((mode = 'mock' and provider = 'none' and status = 'simulation_only')
      or mode <> 'mock')
);
alter table public.marketplace_payments enable row level security;
create policy marketplace_payments_participant_select on public.marketplace_payments
  for select to authenticated using (
    exists (select 1 from public.marketplace_orders o where o.id = order_id
      and auth.uid() in (o.buyer_id, o.seller_id))
  );
grant select on public.marketplace_payments to authenticated;

create table public.marketplace_payment_events (
  provider_event_id text primary key,
  payment_id uuid not null references public.marketplace_payments(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);
alter table public.marketplace_payment_events enable row level security;
revoke all on public.marketplace_payment_events from public, anon, authenticated;
grant all on public.marketplace_payment_events to service_role;

create table public.marketplace_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  seller_id uuid not null references public.seller_profiles(user_id) on delete restrict,
  carrier text,
  tracking_number text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, seller_id)
);
alter table public.marketplace_shipments enable row level security;
create policy marketplace_shipments_participant_select on public.marketplace_shipments
  for select to authenticated using (
    auth.uid() = seller_id or exists (
      select 1 from public.marketplace_orders o where o.id = order_id and o.buyer_id = auth.uid()
    )
  );
create policy marketplace_shipments_seller_update on public.marketplace_shipments
  for update to authenticated using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);
grant select, update on public.marketplace_shipments to authenticated;

create table public.marketplace_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.marketplace_payments(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'requested' check (status in ('requested', 'approved', 'succeeded', 'failed')),
  provider_refund_id text unique,
  processing_fee_returned_cents integer,
  created_at timestamptz not null default now()
);
create table public.marketplace_disputes (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.marketplace_payments(id) on delete restrict,
  provider_dispute_id text unique,
  amount_cents integer not null check (amount_cents > 0),
  status text not null default 'needs_response',
  transfer_recovery_status text not null default 'not_applicable'
    check (transfer_recovery_status in ('not_applicable', 'pending', 'recovered', 'failed', 'review_required')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.marketplace_refunds enable row level security;
alter table public.marketplace_disputes enable row level security;
revoke all on public.marketplace_refunds, public.marketplace_disputes from public, anon, authenticated;
grant select, insert on public.marketplace_refunds to authenticated;
grant select on public.marketplace_disputes to authenticated;

create table public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete restrict,
  listing_id uuid not null references public.marketplace_listings(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references public.seller_profiles(user_id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (length(body) <= 2000),
  created_at timestamptz not null default now(),
  unique (order_id, listing_id),
  check (buyer_id <> seller_id)
);
alter table public.marketplace_reviews enable row level security;
create policy marketplace_reviews_public_select on public.marketplace_reviews
  for select to anon, authenticated using (true);
grant select on public.marketplace_reviews to anon, authenticated;
revoke all on public.marketplace_reviews from authenticated;
grant insert on public.marketplace_reviews to authenticated;
create policy marketplace_reviews_verified_insert on public.marketplace_reviews
  for insert to authenticated with check (
    auth.uid() = buyer_id and exists (
      select 1 from public.marketplace_orders o
      join public.marketplace_payments p on p.order_id = o.id
      join public.marketplace_order_items i on i.order_id = o.id
      where o.id = public.marketplace_reviews.order_id
        and o.buyer_id = auth.uid()
        and o.seller_id = public.marketplace_reviews.seller_id
        and o.status = 'delivered' and p.status = 'succeeded'
        and i.listing_id = public.marketplace_reviews.listing_id
    )
  );

create table public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.marketplace_listings(id) on delete cascade,
  seller_id uuid references public.seller_profiles(user_id) on delete cascade,
  message_id uuid references public.marketplace_messages(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(listing_id, seller_id, message_id) = 1)
);
alter table public.marketplace_reports enable row level security;
create policy marketplace_reports_create_own on public.marketplace_reports
  for insert to authenticated with check (auth.uid() = reporter_id and status = 'open');
create policy marketplace_reports_own_select on public.marketplace_reports
  for select to authenticated using (auth.uid() = reporter_id or public.is_admin());
grant insert, select on public.marketplace_reports to authenticated;

create table public.marketplace_import_jobs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.seller_profiles(user_id) on delete cascade,
  status text not null default 'preview' check (status in ('preview', 'completed', 'failed', 'rolled_back')),
  row_count integer not null default 0 check (row_count >= 0),
  error_rows jsonb not null default '[]'::jsonb,
  created_listing_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.marketplace_import_jobs enable row level security;
create policy marketplace_import_jobs_owner on public.marketplace_import_jobs
  for all to authenticated using (auth.uid() = seller_id) with check (auth.uid() = seller_id);
grant select, insert, update on public.marketplace_import_jobs to authenticated;

create table public.marketplace_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  subject_type text not null,
  subject_id text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.marketplace_audit_log enable row level security;
revoke all on public.marketplace_audit_log from public, anon, authenticated;
grant select, insert on public.marketplace_audit_log to service_role;

create or replace function public.marketplace_admin_review_report(target_report uuid, decision text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.marketplace_reports;
  target_seller uuid;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if decision not in ('actioned', 'dismissed') then
    raise exception 'Choose actioned or dismissed.' using errcode = '22023';
  end if;
  select * into report from public.marketplace_reports where id = target_report for update;
  if not found then raise exception 'Report not found.' using errcode = 'P0002'; end if;
  update public.marketplace_reports
  set status = decision, reviewed_by = auth.uid(), reviewed_at = now()
  where id = target_report;
  if decision = 'actioned' then
    if report.listing_id is not null then
      update public.marketplace_listings set status = 'suspended'
      where id = report.listing_id;
    end if;
    target_seller := report.seller_id;
    if report.message_id is not null then
      update public.marketplace_messages set reported_at = now()
      where id = report.message_id;
      select c.seller_id into target_seller
      from public.marketplace_messages m
      join public.marketplace_conversations c on c.id = m.conversation_id
      where m.id = report.message_id;
    end if;
    if target_seller is not null then
      update public.seller_profiles set suspended_at = coalesce(suspended_at, now())
      where user_id = target_seller;
      update public.marketplace_listings set status = 'suspended'
      where seller_id = target_seller and status = 'active';
    end if;
  end if;
  insert into public.marketplace_audit_log (actor_id, subject_type, subject_id, action, details)
  values (auth.uid(), 'report', target_report::text, decision, jsonb_build_object('reason', report.reason));
  return decision;
end;
$$;
revoke all on function public.marketplace_admin_review_report(uuid, text) from public, anon;
grant execute on function public.marketplace_admin_review_report(uuid, text) to authenticated;

create or replace function public.marketplace_quote(target_listing uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  item public.marketplace_listings;
  settings public.marketplace_settings;
  commission integer;
  processing integer;
begin
  select * into item from public.marketplace_listings where id = target_listing and status = 'active';
  if not found then raise exception 'Listing is unavailable.' using errcode = 'P0002'; end if;
  select * into settings from public.marketplace_settings where id;
  commission := floor((item.price_cents::numeric * settings.commission_basis_points + 5000) / 10000);
  if settings.processing_estimate_basis_points is not null and settings.processing_estimate_flat_cents is not null then
    processing := floor(((item.price_cents + item.shipping_cents)::numeric
      * settings.processing_estimate_basis_points + 5000) / 10000) + settings.processing_estimate_flat_cents;
  end if;
  return jsonb_build_object(
    'listing_id', item.id,
    'book_price_cents', item.price_cents,
    'shipping_cents', item.shipping_cents,
    'tax_cents', 0,
    'tax_calculated', settings.tax_calculation_enabled,
    'buyer_total_cents', item.price_cents + item.shipping_cents,
    'commission_basis_points', settings.commission_basis_points,
    'commission_cents', commission,
    'estimated_processing_fee_cents', processing,
    'estimated_seller_proceeds_cents',
      case when processing is null then null
      else item.price_cents + item.shipping_cents - commission - processing end,
    'mock_checkout_enabled',
      settings.mock_payments_enabled and not settings.live_payments_enabled
        and settings.deployment_environment in ('development', 'test')
  );
end;
$$;
revoke all on function public.marketplace_quote(uuid) from public;
grant execute on function public.marketplace_quote(uuid) to anon, authenticated;

create or replace function public.marketplace_create_mock_order(
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
declare
  buyer uuid := auth.uid();
  item public.marketplace_listings;
  settings public.marketplace_settings;
  new_order uuid;
  commission integer;
  processing integer;
begin
  if buyer is null then raise exception 'Sign in to place an order.' using errcode = '42501'; end if;
  if request_key is null then raise exception 'A checkout request key is required.' using errcode = '22023'; end if;
  select o.id into new_order from public.marketplace_orders o
  where o.buyer_id = buyer and o.idempotency_key = request_key;
  if new_order is not null then return new_order; end if;
  select * into settings from public.marketplace_settings where id for share;
  if not settings.mock_payments_enabled or settings.live_payments_enabled
    or settings.deployment_environment not in ('development', 'test') then
    raise exception 'Marketplace mock checkout is not enabled for this environment.' using errcode = '55000';
  end if;
  select * into item from public.marketplace_listings
  where id = target_listing and status = 'active' and quantity > 0
  for update;
  if not found then raise exception 'This listing is no longer available.' using errcode = 'P0002'; end if;
  if item.seller_id = buyer then raise exception 'You cannot buy your own listing.' using errcode = '42501'; end if;
  commission := floor((item.price_cents::numeric * settings.commission_basis_points + 5000) / 10000);
  if settings.processing_estimate_basis_points is not null and settings.processing_estimate_flat_cents is not null then
    processing := floor(((item.price_cents + item.shipping_cents)::numeric
      * settings.processing_estimate_basis_points + 5000) / 10000) + settings.processing_estimate_flat_cents;
  end if;
  insert into public.marketplace_orders (
    buyer_id, seller_id, idempotency_key, status, book_price_cents, shipping_cents, tax_cents, buyer_total_cents
  ) values (
    buyer, item.seller_id, request_key, 'test_simulated', item.price_cents, item.shipping_cents, 0,
    item.price_cents + item.shipping_cents
  ) on conflict (buyer_id, idempotency_key) do nothing returning id into new_order;
  if new_order is null then
    select o.id into new_order from public.marketplace_orders o
    where o.buyer_id = buyer and o.idempotency_key = request_key;
    return new_order;
  end if;
  insert into public.marketplace_order_items (
    order_id, listing_id, listing_title, listing_author, isbn, edition_id, condition,
    quantity, book_price_cents, shipping_cents, commission_basis_points, commission_cents,
    estimated_processing_fee_cents, estimated_seller_proceeds_cents
  ) values (
    new_order, item.id, item.title, item.author, item.isbn, item.edition_id, item.condition,
    1, item.price_cents, item.shipping_cents, settings.commission_basis_points, commission,
    processing, case when processing is null then null
      else item.price_cents + item.shipping_cents - commission - processing end
  );
  insert into public.marketplace_order_shipping (
    order_id, recipient_name, address_line_1, address_line_2, city, region, postal_code, country_code
  ) values (
    new_order, recipient_name, address_line_1, nullif(address_line_2, ''), city,
    nullif(region, ''), postal_code, upper(country_code)
  );
  insert into public.marketplace_payments (
    order_id, mode, provider, status, gross_amount_cents, commission_cents,
    estimated_processing_fee_cents
  ) values (
    new_order, 'mock', 'none', 'simulation_only', item.price_cents + item.shipping_cents,
    commission, processing
  );
  if item.quantity = 1 then
    update public.marketplace_listings set quantity = 0, status = 'sold', sold_at = now()
    where id = item.id;
  else
    update public.marketplace_listings set quantity = quantity - 1 where id = item.id;
  end if;
  insert into public.marketplace_shipments (order_id, seller_id)
  values (new_order, item.seller_id);
  insert into public.marketplace_audit_log (actor_id, subject_type, subject_id, action, details)
  values (buyer, 'order', new_order::text, 'mock_checkout_created',
    jsonb_build_object('listing_id', item.id, 'gross_amount_cents', item.price_cents + item.shipping_cents));
  return new_order;
end;
$$;
revoke all on function public.marketplace_create_mock_order(uuid, uuid, text, text, text, text, text, text, text) from public;
grant execute on function public.marketplace_create_mock_order(uuid, uuid, text, text, text, text, text, text, text) to authenticated;

create or replace function public.marketplace_admin_set_commission(new_basis_points integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if new_basis_points is null or new_basis_points < 0 or new_basis_points > 10000 then
    raise exception 'Commission must be between 0 and 100 percent.' using errcode = '22023';
  end if;
  update public.marketplace_settings
  set commission_basis_points = new_basis_points, updated_at = now() where id;
  return new_basis_points;
end;
$$;
revoke all on function public.marketplace_admin_set_commission(integer) from public, anon;
grant execute on function public.marketplace_admin_set_commission(integer) to authenticated;

create or replace function public.marketplace_assert_account_deletable(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user is null then
    raise exception 'A target account is required.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.marketplace_orders o
    join public.marketplace_payments p on p.order_id = o.id
    where (o.buyer_id = target_user or o.seller_id = target_user)
      and p.mode = 'stripe_live'
  ) or exists (
    select 1
    from public.marketplace_orders o
    where (o.buyer_id = target_user or o.seller_id = target_user)
      and o.status in ('payment_pending', 'paid', 'processing', 'shipped', 'delivered', 'refunded', 'disputed')
  ) or exists (
    select 1
    from public.marketplace_refunds r
    join public.marketplace_payments p on p.id = r.payment_id
    where r.requested_by = target_user and p.mode = 'stripe_live'
  ) then
    raise exception 'Live marketplace payment records must be resolved before account deletion.'
      using errcode = '55000';
  end if;
end;
$$;
revoke all on function public.marketplace_assert_account_deletable(uuid) from public, anon, authenticated;
grant execute on function public.marketplace_assert_account_deletable(uuid) to service_role;

create or replace function public.marketplace_delete_account_data(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.marketplace_assert_account_deletable(target_user);
  delete from public.marketplace_reviews r
  where r.buyer_id = target_user or r.seller_id = target_user
    or r.order_id in (
      select o.id from public.marketplace_orders o
      where o.buyer_id = target_user or o.seller_id = target_user
    );
  delete from public.marketplace_refunds r
  where r.requested_by = target_user
    or r.payment_id in (
      select p.id from public.marketplace_payments p
      join public.marketplace_orders o on o.id = p.order_id
      where o.buyer_id = target_user or o.seller_id = target_user
    );
  delete from public.marketplace_disputes d
  where d.payment_id in (
    select p.id from public.marketplace_payments p
    join public.marketplace_orders o on o.id = p.order_id
    where o.buyer_id = target_user or o.seller_id = target_user
  );
  delete from public.marketplace_payments p
  using public.marketplace_orders o
  where p.order_id = o.id and (o.buyer_id = target_user or o.seller_id = target_user);
  delete from public.marketplace_order_items i
  using public.marketplace_orders o
  where i.order_id = o.id and (o.buyer_id = target_user or o.seller_id = target_user);
  delete from public.marketplace_orders
  where buyer_id = target_user or seller_id = target_user;
  delete from public.marketplace_listings where seller_id = target_user;
end;
$$;
revoke all on function public.marketplace_delete_account_data(uuid) from public, anon, authenticated;
grant execute on function public.marketplace_delete_account_data(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('marketplace-listing-photos', 'marketplace-listing-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists marketplace_listing_photo_select on storage.objects;
create policy marketplace_listing_photo_select on storage.objects
for select to anon, authenticated using (
  bucket_id = 'marketplace-listing-photos'
  and exists (
    select 1 from public.marketplace_listing_photos p
    join public.marketplace_listings l on l.id = p.listing_id
    where p.storage_path = name and (l.status = 'active' or l.seller_id = auth.uid())
  )
);
drop policy if exists marketplace_listing_photo_insert on storage.objects;
create policy marketplace_listing_photo_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'marketplace-listing-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'
  and exists (
    select 1 from public.marketplace_listings l
    where l.id::text = (storage.foldername(name))[2]
      and l.seller_id = auth.uid() and l.status = 'draft'
  )
);
drop policy if exists marketplace_listing_photo_delete on storage.objects;
create policy marketplace_listing_photo_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'marketplace-listing-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
