import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PGlite } from "@electric-sql/pglite";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("plan UI permits unlimited free books and shelves, free Marketplace shopping, and Book Lover listings", async () => {
  const source = await read("../app.js");
  const tierSource = source.slice(source.indexOf("const ACCOUNT_TIERS ="), source.indexOf("\nconst state = {"));
  const state = {
    profile: { tier: "lite_reader" },
    books: Array.from({ length: 6 }, () => ({ reading_status: "reading" })),
  };
  const notices = [];
  const actions = {
    state,
    t: (_key, values) => `${values.tier} accounts can have up to ${values.max} books in ${values.status}`,
    getReadingStatusLabel: (status) => status,
    getCustomShelves: () => Array.from({ length: 100 }, () => ({})),
    showToast: (message) => notices.push(message),
    navigateTo: () => notices.push("navigated"),
  };
  runInNewContext(`${tierSource}\nthis.tiers = ACCOUNT_TIERS; this.canAddBook = checkBookLimit; this.canAddShelf = checkShelfLimit; this.canAddReading = checkReadingLimit;`, actions);

  assert.equal(actions.tiers.lite_reader.maxBooks, Infinity);
  assert.equal(actions.tiers.lite_reader.maxShelves, Infinity);
  assert.equal(actions.tiers.lite_reader.maxReading, 5);
  assert.equal(actions.canAddBook(), true);
  assert.equal(actions.canAddShelf("Another shelf"), true);
  assert.equal(actions.canAddReading({}), false);
  assert.match(notices[0], /up to 5 books in reading/);
  assert.equal(notices.includes("navigated"), true);

  const featureSource = source.slice(source.indexOf("const LITE_READER_FEATURES ="), source.indexOf("\nfunction createUpgradeFeatureList("));
  const features = {
    t: (_key, values = {}) => values.max ? `${values.max} books in ${values.status}` : "Feature",
    getReadingStatusLabel: (status) => status,
  };
  runInNewContext(`${featureSource}\nthis.lite = LITE_READER_FEATURES; this.bookLover = BOOK_LOVER_FEATURES;`, features);
  assert.ok(features.lite.includes("Unlimited books in your library"));
  assert.ok(features.lite.includes("Unlimited custom shelves"));
  assert.ok(features.lite.includes("Shop in the Marketplace when it launches - no paid plan required"));
  assert.ok(features.bookLover.includes("List books in the Marketplace when it launches"));
  assert.equal(features.lite.some((feature) => feature.includes("List books in the Marketplace")), false);
});

test("free library books and shelves are unlimited while Currently Reading stays capped at five", async () => {
  const db = new PGlite();
  try {
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
    for (const migration of [
      "20261024200000_lite_reader_limits.sql",
      "20261024210000_lite_reader_reading_limit.sql",
      "20261024240000_builtin_wishlist_shelf.sql",
      "20261101170000_unlimited_free_library.sql",
    ]) {
      await db.exec(await read(`../supabase/migrations/${migration}`));
    }

    const user = "00000000-0000-0000-0000-000000000001";
    await db.exec(`
      insert into public.profiles (id, email, full_name)
      values ('${user}', 'reader@example.com', 'Reader');
      insert into public.books (user_id, title)
      select '${user}', 'Book ' || n from generate_series(1, 101) as n;
      insert into public.shelves (user_id, name)
      select '${user}', 'Shelf ' || n from generate_series(1, 6) as n;
      insert into public.books (user_id, title, reading_status)
      select '${user}', 'Reading ' || n, 'reading' from generate_series(1, 5) as n;
    `);

    assert.equal(
      (await db.query("select count(*)::int as count from public.books where user_id = $1", [user])).rows[0].count,
      106
    );
    assert.equal(
      (await db.query("select count(*)::int as count from public.shelves where user_id = $1 and not is_wishlist", [user])).rows[0].count,
      6
    );
    await assert.rejects(
      db.exec(`insert into public.books (user_id, title, reading_status) values ('${user}', 'Reading 6', 'reading')`),
      /limited to 5 books in Currently Reading/
    );
  } finally {
    await db.close();
  }
});
