begin;

create table public.billing_environment (
  id boolean primary key default true check (id),
  livemode boolean not null default false
);
insert into public.billing_environment(id) values (true);
alter table public.billing_environment enable row level security;
revoke all on public.billing_environment from public, anon, authenticated;
grant select on public.billing_environment to service_role;

alter table public.billing_accounts
  add column livemode boolean not null default false,
  drop constraint billing_accounts_pkey,
  add primary key (user_id, livemode);
alter table public.billing_events
  add column livemode boolean not null default false,
  drop constraint billing_events_pkey,
  add primary key (event_id, livemode);

create function public.billing_assert_mode(target_livemode boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.billing_environment
    where id and livemode = target_livemode for share;
  if not found then
    raise exception 'Stripe mode does not match the database billing environment' using errcode = '22023';
  end if;
end;
$$;

create function public.guard_billing_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.billing_assert_mode(new.livemode);
  if tg_op = 'UPDATE' and new.livemode <> old.livemode then
    raise exception 'Billing records cannot change Stripe mode' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger billing_accounts_guard_mode before insert or update on public.billing_accounts
for each row execute function public.guard_billing_mode();
create trigger billing_events_guard_mode before insert or update on public.billing_events
for each row execute function public.guard_billing_mode();

create or replace function public.derive_profile_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.tier := case when new.complimentary_book_lover or exists (
    select 1 from public.billing_accounts b
    join public.billing_environment e on e.id and e.livemode = b.livemode
    where b.user_id = new.id and b.has_access
  ) then 'book_lover' else 'lite_reader' end;
  return new;
end;
$$;

create function public.switch_billing_environment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.billing_accounts where locked_until > now()) then
    raise exception 'Billing requests are in progress; retry the environment switch later' using errcode = '55P03';
  end if;
  update public.profiles set tier = tier;
  return new;
end;
$$;
create trigger billing_environment_sync after update of livemode on public.billing_environment
for each row when (old.livemode is distinct from new.livemode)
execute function public.switch_billing_environment();

drop function public.billing_lock(uuid, uuid);
create function public.billing_lock(target_user uuid, owner uuid, target_livemode boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  account public.billing_accounts;
begin
  perform public.billing_assert_mode(target_livemode);
  insert into public.billing_accounts(user_id, livemode) values (target_user, target_livemode)
    on conflict do nothing;
  update public.billing_accounts
    set lock_owner = owner, locked_until = now() + interval '2 minutes'
    where user_id = target_user and livemode = target_livemode
      and (locked_until is null or locked_until < now())
    returning * into account;
  if not found then
    raise exception 'billing is busy' using errcode = '55P03';
  end if;
  return to_jsonb(account);
end;
$$;

revoke all on function public.billing_assert_mode(boolean),
  public.billing_lock(uuid, uuid, boolean), public.guard_billing_mode(),
  public.switch_billing_environment() from public, anon, authenticated;
grant execute on function public.billing_assert_mode(boolean),
  public.billing_lock(uuid, uuid, boolean) to service_role;

commit;
