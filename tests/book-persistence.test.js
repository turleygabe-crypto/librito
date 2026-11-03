import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const saveFunction = source.slice(
  source.indexOf("async function saveBookToSupabase("),
  source.indexOf("\nglobalSearchForm.addEventListener(")
);
const wishlistHelpers = [
  source.slice(source.indexOf("function getLibraryBooks("), source.indexOf("\nfunction saveBooks(")),
  source.slice(source.indexOf("function normalizeBookRecord("), source.indexOf("\nfunction bookIdentityKey(")),
  source.slice(source.indexOf("function getBookKey("), source.indexOf("\nfunction buildSuggestedShelves(")),
  source.slice(source.indexOf("async function toggleBookWishlist("), source.indexOf("\nfunction getMissingBooksColumn(")),
].join("\n");

test("manual book saves write status fields to books and custom memberships to book_shelves", async () => {
  const writes = [];
  const book = {
    id: "book-id",
    title: "A Saved Book",
    author: "A Reader",
    reading_status: "reading",
    ownership_status: "owned",
    is_favorite: true,
    owned_format: "print",
    shelves: ["Top Shelf", "Currently Reading"],
    added: "2026-10-29",
  };
  const state = {
    session: { user: { id: "reader-id" } },
    supabase: {
      from(table) {
        return {
          insert(payload) {
            writes.push({ table, payload });
            return {
              select() { return this; },
              single: async () => ({ data: { id: book.id }, error: null }),
            };
          },
        };
      },
    },
  };
  const context = {
    state,
    checkBookLimit: () => true,
    checkReadingLimit: () => true,
    getCustomShelves: () => [{ id: "shelf-id", name: "Top Shelf" }],
    runBookSchemaRetry: async (operation, payload) => operation(payload),
    getSchemaUpgradeMessage: () => "",
    loadFromSupabase: async () => {
      state.books = [book];
      return true;
    },
    showToast() {},
    console: { error() {} },
  };
  runInNewContext(`${saveFunction}\nthis.save = saveBookToSupabase;`, context);

  assert.equal(await context.save(book), true);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].table, "books");
  assert.equal(writes[0].payload.is_favorite, true);
  assert.equal(writes[0].payload.reading_status, "reading");
  assert.equal("shelf" in writes[0].payload, false);
  assert.equal("disposition" in writes[0].payload, false);
  assert.deepEqual(JSON.parse(JSON.stringify(writes[1])), {
    table: "book_shelves",
    payload: [{ book_id: "book-id", shelf_id: "shelf-id", user_id: "reader-id" }],
  });
});

test("owned scan choice saves the scanned book with Owned status", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="scanOwnedBookOptionBtn"[^>]*>[\s\S]*?<strong>Scan owned Book<\/strong>/);
  assert.match(source, /scanOwnedBookOptionBtn\.addEventListener\("click", \(\) => \{\s*scanAsOwned = true;\s*startBookLookup\("scan"\);\s*\}\)/);
  assert.match(source, /function showEntryChoice\(\) \{\s*bookEntryMode = "";\s*scanAsOwned = false;/);
  assert.match(source, /ownership_status: scanAsOwned \? "owned" : null/);
});

test("wishlist-only records stay separate from library books and persist independently", async () => {
  const saved = new Map();
  const state = {
    books: [
      { title: "Library Book", author: "Reader", isbn: "111" },
      { title: "Older Wish", author: "Reader", isbn: "222", ownership_status: "wishlist" },
    ],
    wishlistBooks: [{ title: "Older Wish", author: "Reader", isbn: "222", book_key: "222" }],
  };
  const context = {
    state,
    wishlistStorageKey: "librito-wishlist-v1",
    localStorage: {
      getItem: (key) => saved.get(key) || null,
      setItem: (key, value) => saved.set(key, value),
    },
    readBookMeta: () => ({}),
    applyBookMeta() {},
    updateBookFields: async () => true,
    render() {},
    showToast() {},
    console: { error() {}, warn() {} },
  };
  runInNewContext(`${wishlistHelpers}\nthis.getLibraryBooks = getLibraryBooks; this.getWishlistBooks = getWishlistBooks; this.toggleBookWishlist = toggleBookWishlist;`, context);

  assert.deepEqual(JSON.parse(JSON.stringify(context.getLibraryBooks().map((book) => book.title))), ["Library Book"]);
  assert.deepEqual(JSON.parse(JSON.stringify(context.getWishlistBooks().map((book) => book.title))), ["Older Wish"]);
  const book = { title: "Future Purchase", author: "Reader", isbn: "333", cover_url: "/cover.jpg" };
  await context.toggleBookWishlist(book);
  assert.deepEqual(JSON.parse(JSON.stringify(state.wishlistBooks.map((item) => item.title))), ["Future Purchase", "Older Wish"]);
  assert.deepEqual(JSON.parse(JSON.stringify(context.getLibraryBooks().map((item) => item.title))), ["Library Book"]);
  assert.equal(JSON.parse(saved.get("librito-wishlist-v1")).length, 2);
  assert.equal(saved.has("librito-library-v1"), false);

  await context.toggleBookWishlist(book);
  assert.deepEqual(JSON.parse(JSON.stringify(state.wishlistBooks.map((item) => item.title))), ["Older Wish"]);
  assert.deepEqual(JSON.parse(JSON.stringify(context.getLibraryBooks().map((item) => item.title))), ["Library Book"]);
});
