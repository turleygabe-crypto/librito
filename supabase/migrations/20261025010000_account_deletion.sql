begin;

alter table public.billing_accounts
  add column deletion_pending boolean not null default false;

drop function public.billing_lock(uuid, uuid, boolean);
create function public.billing_lock(
  target_user uuid, owner uuid, target_livemode boolean default false,
  allow_deletion boolean default false
)
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
  if account.deletion_pending and not allow_deletion then
    raise exception 'Account deletion is in progress' using errcode = '55000';
  end if;
  return to_jsonb(account);
end;
$$;

create or replace function public.switch_billing_environment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.billing_accounts where locked_until > now() or deletion_pending
  ) then
    raise exception 'Billing requests or account deletions are in progress; finish them before switching environments'
      using errcode = '55P03';
  end if;
  update public.profiles set tier = tier;
  return new;
end;
$$;

-- Enforce new writes without deleting legacy orphan profiles during this upgrade.
-- This also prevents unexpired JWTs from recreating a deleted user's profile.
alter table public.profiles
  add constraint profiles_auth_user_fkey foreign key (id)
  references auth.users(id) on delete cascade not valid;

revoke all on function public.billing_lock(uuid, uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.billing_lock(uuid, uuid, boolean, boolean) to service_role;

commit;
