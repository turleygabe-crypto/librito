import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

async function createDatabase() {
  const db = new PGlite();
  // Stand-ins for the Supabase-managed auth schema and roles.
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
  `);
  const schema = (await read("../supabase/schema.sql"))
    .replace('create extension if not exists "uuid-ossp";', "")
    .replaceAll("uuid_generate_v4()", "gen_random_uuid()");
  await db.exec(schema);
  for (const file of [
    "20261024180000_shelf_items.sql",
    "20261024200000_lite_reader_limits.sql",
    "20261024210000_lite_reader_reading_limit.sql",
    "20261024240000_builtin_wishlist_shelf.sql",
    "20261025040000_shelf_management.sql",
  ]) {
    await db.exec(await read(`../supabase/migrations/${file}`));
  }
  return db;
}

const user = "00000000-0000-0000-0000-000000000001";
const ids = {
  completed: "00000000-0000-0000-0000-00000000000a",
  reading: "00000000-0000-0000-0000-00000000000b",
  blank: "00000000-0000-0000-0000-00000000000c",
  sold: "00000000-0000-0000-0000-00000000000d",
  liked: "00000000-0000-0000-0000-00000000000e",
  bogus: "00000000-0000-0000-0000-00000000000f",
  topShelf: "00000000-0000-0000-0000-000000000010",
};

async function seedLegacyData(db) {
  // The wishlist-era enforce_tier_limits() errors on books inserts (it reads
  // new.is_wishlist); seed data predates the migration, so bypass it here.
  await db.exec("alter table public.books disable trigger enforce_book_limit;");
  await db.exec(`
    insert into public.profiles (id, email, full_name, tier)
    values ('${user}', 'reader@example.com', 'Reader', 'book_lover');
    insert into public.shelves (id, user_id, name) values ('${ids.topShelf}', '${user}', 'Top Shelf');
    insert into public.books (id, user_id, title, author, isbn, reading_status, disposition, edition_progress) values
      ('${ids.completed}', '${user}', 'Finished Book', 'Author A', '1111111111', 'completed', null,
        '{"isbn:1111111111": {"current_page": 300, "page_count": 300, "reading_status": "completed"}}'),
      ('${ids.reading}', '${user}', 'Open Book', 'Author B', '', 'reading', null, '{}'),
      ('${ids.blank}', '${user}', 'Quiet Book', 'Author C', '2222222222', '', null, '{}'),
      ('${ids.sold}', '${user}', 'Sold Book', 'Author D', '3333333333', 'completed', 'sold', '{}'),
      ('${ids.liked}', '${user}', 'Loved Book', 'Author E', '4444444444', null, null, '{}'),
      ('${ids.bogus}', '${user}', 'Odd Book', 'Author F', '5555555555', 'paused', null, '{}');
    insert into public.liked_books (user_id, book_id) values ('${user}', '${ids.liked}');
  `);
  const { rows: [wishlist] } = await db.query(
    `select id from public.shelves where user_id = '${user}' and is_wishlist`
  );
  await db.exec(`
    insert into public.book_shelves (book_id, shelf_id, user_id) values
      ('${ids.sold}', '${wishlist.id}', '${user}'),
      ('${ids.liked}', '${wishlist.id}', '${user}');
    insert into public.shelf_items (user_id, shelf_id, book_key, title, author, isbn) values
      ('${user}', '${wishlist.id}', 'new book|author new', 'New Book', 'Author New', null),
      ('${user}', '${wishlist.id}', '2222222222', 'Quiet Book', 'Author C', '2222222222'),
      ('${user}', '${ids.topShelf}', 'shelved book|author shelved', 'Shelved Book', 'Author Shelved', null),
      ('${user}', '${ids.topShelf}', 'open book|author b', 'Open Book', 'Author B', '');
  `);
  await db.exec("alter table public.books enable trigger enforce_book_limit;");
  return wishlist.id;
}

const book = async (db, id) =>
  (await db.query(`select * from public.books where id = '${id}'`)).rows[0];

test("status dimensions migration maps legacy data, is idempotent, and rolls back", async () => {
  const db = await createDatabase();
  await seedLegacyData(db);
  const migration = await read("../supabase/migrations/20261029150000_status_dimensions.sql");
  await db.exec(migration);
  await db.exec(migration); // idempotent: the backfill marker prevents double-mapping

  // Reading statuses use the new keys.
  assert.equal((await book(db, ids.completed)).reading_status, "read");
  assert.equal((await book(db, ids.reading)).reading_status, "reading");
  assert.equal((await book(db, ids.blank)).reading_status, null);
  assert.equal((await book(db, ids.bogus)).reading_status, null);
  assert.equal(
    (await book(db, ids.completed)).edition_progress["isbn:1111111111"].reading_status,
    "read"
  );

  // Favorites, dispositions and the Wishlist shelf became status fields.
  assert.equal((await book(db, ids.liked)).is_favorite, true);
  assert.equal((await book(db, ids.liked)).ownership_status, "wishlist");
  assert.equal((await book(db, ids.sold)).ownership_status, "sold");
  assert.equal((await book(db, ids.blank)).ownership_status, "wishlist");

  // Conflicts and unknown values are logged.
  const { rows: logs } = await db.query(
    "select step, count(*)::int as count from public.status_migration_log group by step"
  );
  const logCounts = Object.fromEntries(logs.map((row) => [row.step, row.count]));
  assert.equal(logCounts.unknown_reading_status, 1);
  assert.equal(logCounts.wishlist_ownership_conflict, 1); // sold book stays sold
  assert.equal(logCounts.created_book_from_shelf_item, 2); // New Book + Shelved Book
  assert.equal(logCounts.added_book_shelf_from_shelf_item, 2); // Shelved Book + Open Book
  assert.equal(logCounts.backfill_complete, 1);

  // shelf_items became real books with join rows; the Wishlist shelf is gone.
  const { rows: [{ count: bookCount }] } = await db.query(
    "select count(*)::int as count from public.books"
  );
  assert.equal(bookCount, 8);
  const { rows: [created] } = await db.query(
    "select ownership_status from public.books where title = 'New Book'"
  );
  assert.equal(created.ownership_status, "wishlist");
  const { rows: topShelfBooks } = await db.query(`
    select b.title from public.book_shelves bs
    join public.books b on b.id = bs.book_id
    where bs.shelf_id = '${ids.topShelf}' order by b.title
  `);
  assert.deepEqual(topShelfBooks.map((row) => row.title), ["Open Book", "Shelved Book"]);
  assert.equal((await db.query("select count(*)::int as count from public.shelf_items")).rows[0].count, 0);
  assert.equal(
    (await db.query("select count(*)::int as count from public.shelves where is_wishlist")).rows[0].count,
    0
  );
  assert.equal(
    (await db.query("select count(*)::int as count from public.shelves")).rows[0].count,
    1
  );

  // Only stable keys are accepted.
  await assert.rejects(
    db.exec(`update public.books set reading_status = 'Read' where id = '${ids.completed}'`),
    /books_reading_status_check/
  );
  await assert.rejects(
    db.exec(`update public.books set ownership_status = 'kept' where id = '${ids.completed}'`),
    /books_ownership_status_check/
  );
  await assert.rejects(
    db.exec(`update public.books set owned_format = 'vinyl' where id = '${ids.completed}'`),
    /books_owned_format_check/
  );

  // A fresh profile no longer gets a built-in Wishlist shelf.
  await db.exec(
    "insert into public.profiles (id, email) values ('00000000-0000-0000-0000-000000000002', 'new@example.com')"
  );
  assert.equal(
    (await db.query(
      "select count(*)::int as count from public.shelves where user_id = '00000000-0000-0000-0000-000000000002'"
    )).rows[0].count,
    0
  );

  // Roll back and verify the previous model is restored.
  await db.exec(await read("../supabase/rollbacks/20261029150000_status_dimensions_down.sql"));
  assert.equal(
    (await db.query(
      "select count(*)::int as count from information_schema.columns where table_schema = 'public' and table_name = 'books' and column_name in ('ownership_status', 'is_favorite', 'owned_format')"
    )).rows[0].count,
    0
  );
  assert.equal((await book(db, ids.completed)).reading_status, "completed");
  assert.equal(
    (await book(db, ids.completed)).edition_progress["isbn:1111111111"].reading_status,
    "completed"
  );
  assert.equal((await book(db, ids.sold)).disposition, "sold");
  assert.equal(
    (await db.query(`select count(*)::int as count from public.liked_books where book_id = '${ids.liked}'`)).rows[0].count,
    1
  );
  assert.equal(
    (await db.query("select count(*)::int as count from public.books")).rows[0].count,
    6
  );
  assert.equal(
    (await db.query("select count(*)::int as count from public.shelf_items")).rows[0].count,
    4
  );
  assert.equal(
    (await db.query(`select count(*)::int as count from public.shelves where user_id = '${user}' and is_wishlist`)).rows[0].count,
    1
  );
  assert.equal(
    (await db.query(`select count(*)::int as count from public.book_shelves where shelf_id = '${ids.topShelf}'`)).rows[0].count,
    0
  );
  await db.close();
});
