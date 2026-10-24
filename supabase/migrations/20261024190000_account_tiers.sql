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
-- Column grants use whatever columns exist, so this works on older profiles tables too.
revoke insert, update on public.profiles from authenticated;

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name <> 'tier';
  execute format('grant insert (%s) on public.profiles to authenticated', cols);
  execute format('grant update (%s) on public.profiles to authenticated', cols);
end $$;
