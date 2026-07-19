insert into public.profiles (id, email, full_name)
values
  ('00000000-0000-0000-0000-000000000001', 'demo@example.com', 'Demo Reader')
on conflict (id) do nothing;
