-- Account tiers: 'lite_reader' (free, default) and 'book_lover' (premium, paid).
alter table public.profiles
  add column if not exists tier text not null default 'lite_reader';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_tier_check') then
    alter table public.profiles
      add constraint profiles_tier_check check (tier in ('lite_reader', 'book_lover'));
  end if;
end $$;

-- Users must not be able to upgrade themselves: only the service role (e.g. a payment webhook) may write tier.
revoke insert, update on public.profiles from authenticated;
grant insert (id, email, full_name, favorite_shelf) on public.profiles to authenticated;
grant update (email, full_name, favorite_shelf) on public.profiles to authenticated;
