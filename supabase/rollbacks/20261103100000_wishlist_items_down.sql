insert into public.books (user_id, title, author, isbn, cover_url, genre, page_count, ownership_status, added_on)
select item.user_id,
       item.title,
       item.author,
       item.isbn,
       item.cover_url,
       item.genre,
       item.page_count,
       'wishlist',
       item.added_at::date
from public.wishlist_items item
where not exists (
  select 1
  from public.books book
  where book.user_id = item.user_id
    and coalesce(nullif(lower(coalesce(book.isbn, '')), ''), lower(book.title || '|' || coalesce(book.author, ''))) = item.book_key
);

drop table public.wishlist_items;