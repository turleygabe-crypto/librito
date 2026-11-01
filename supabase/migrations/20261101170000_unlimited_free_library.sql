-- Books and custom shelves are unlimited on every plan. Keep the separate
-- Currently Reading limit enforced by enforce_reading_limit().
drop trigger if exists enforce_book_limit on public.books;
drop trigger if exists enforce_shelf_limit on public.shelves;
drop function if exists public.enforce_tier_limits();
