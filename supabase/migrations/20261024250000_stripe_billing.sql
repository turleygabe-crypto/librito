begin;

alter table public.profiles
  add column complimentary_book_lover boolean not null default false;
update public.profiles set complimentary_book_lover = true where tier = 'book_lover';

create table public.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text unique,
  checkout_session_id text,
  has_access boolean not null default false,
  has_subscription boolean not null default false,
  subscription_status text,
  cancel_at_period_end boolean not null default false,
  period_end timestamptz,
  lock_owner uuid,
  locked_until timestamptz
);

create table public.billing_events (
  event_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  requires_review boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.billing_accounts enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_accounts, public.billing_events from public, anon, authenticated;
grant all on public.billing_accounts, public.billing_events to service_role;

create function public.derive_profile_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tier := case when new.complimentary_book_lover or exists (
    select 1 from public.billing_accounts b where b.user_id = new.id and b.has_access
  ) then 'book_lover' else 'lite_reader' end;
  return new;
end;
$$;

create trigger profiles_derive_tier before insert or update on public.profiles
for each row execute function public.derive_profile_tier();

create function public.sync_billing_tier()
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

create trigger billing_sync_tier after insert or update of has_access on public.billing_accounts
for each row execute function public.sync_billing_tier();

create function public.billing_lock(target_user uuid, owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.billing_accounts;
begin
  insert into public.billing_accounts(user_id) values (target_user) on conflict do nothing;
  update public.billing_accounts
    set lock_owner = owner, locked_until = now() + interval '2 minutes'
    where user_id = target_user and (locked_until is null or locked_until < now())
    returning * into account;
  if not found then
    raise exception 'billing is busy' using errcode = '55P03';
  end if;
  return to_jsonb(account);
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
  if new_tier is null or new_tier not in ('lite_reader', 'book_lover') then
    raise exception 'invalid tier' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = target_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  insert into public.profiles (id, email, full_name, complimentary_book_lover)
  select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', u.email), new_tier = 'book_lover'
  from auth.users u where u.id = target_user
  on conflict (id) do update set complimentary_book_lover = excluded.complimentary_book_lover
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
  return (select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc), '[]'::jsonb)
    from (
      select u.id, u.email, u.created_at, u.last_sign_in_at,
        (select count(*) from public.books b where b.user_id = u.id) as books,
        (select count(*) from public.shelves s where s.user_id = u.id) as shelves,
        (select count(*) from public.liked_books l where l.user_id = u.id) as likes,
        exists (select 1 from public.admins a where a.user_id = u.id) as is_admin,
        coalesce(p.tier, 'lite_reader') as tier,
        coalesce(p.complimentary_book_lover, false) as complimentary_book_lover
      from auth.users u left join public.profiles p on p.id = u.id
      order by u.created_at desc limit 2000
    ) x);
end;
$$;

revoke all on function public.billing_lock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.billing_lock(uuid, uuid) to service_role;
revoke all on function public.derive_profile_tier(), public.sync_billing_tier() from public, anon, authenticated;
revoke all on function public.admin_set_tier(uuid, text), public.admin_users() from public, anon;
grant execute on function public.admin_set_tier(uuid, text), public.admin_users() to authenticated;

-- Rebuild column grants so browser clients can never write either entitlement input.
revoke insert, update on public.profiles from authenticated;
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
    and column_name not in ('tier', 'complimentary_book_lover');
  execute format('grant insert (%s) on public.profiles to authenticated', cols);
  execute format('grant update (%s) on public.profiles to authenticated', cols);
end;
$$;

commit;
