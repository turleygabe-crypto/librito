export function hasBookCover(book) {
  const coverId = Number(book.cover_i);
  return (Number.isInteger(coverId) && coverId > 0)
    || (typeof book.cover_url === "string" && book.cover_url.trim().length > 0);
}

export function booksWithCoversFirst(items, getBook = (book) => book) {
  const covered = [];
  const coverless = [];
  for (const item of items) {
    (hasBookCover(getBook(item)) ? covered : coverless).push(item);
  }
  return [...covered, ...coverless];
}
