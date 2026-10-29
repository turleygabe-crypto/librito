import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const migrationSource = source.slice(
  source.indexOf("function normalizeLocalBook("),
  source.indexOf("\nfunction getLibraryBooks(")
);

function harness() {
  const books = [
    {
      id: "legacy-book",
      title: "Legacy Book",
      author: "A Reader",
      isbn: "9780000000001",
      shelf: "Completed Books",
      shelves: ["Top Shelf", "Currently Reading"],
      liked: true,
      disposition: "sold",
    },
  ];
  const shelves = [
    { id: "liked", name: "Liked" },
    { id: "wishlist", name: "Wishlist", is_wishlist: true },
    { id: "reading", name: "Currently Reading" },
    { id: "completed", name: "Completed Books" },
    { id: "custom", name: "Top Shelf" },
  ];
  const saved = new Map([
    ["librito-shelves-v1", JSON.stringify(shelves)],
    ["librito-shelf-items-v1", JSON.stringify([
      { shelf_id: "custom", title: "New Custom Book", author: "Another Reader", isbn: "9780000000002" },
      { shelf_id: "reading", title: "Read Twice", author: "Another Reader", isbn: "9780000000003" },
      { shelf_id: "completed", title: "Read Twice", author: "Another Reader", isbn: "9780000000003" },
      { shelf_id: "wishlist", title: "Wishlist Book", author: "Another Reader", isbn: "9780000000004" },
      { shelf_id: "liked", title: "Liked Book", author: "Another Reader", isbn: "9780000000005" },
    ])],
  ]);
  const state = { books: books.map((book) => ({ ...book })) };
  const warnings = [];
  const context = {
    state,
    defaultBookMetadata: {},
    storageKey: "librito-library-v1",
    shelvesStorageKey: "librito-shelves-v1",
    legacyShelfItemsStorageKey: "librito-shelf-items-v1",
    localStorage: {
      getItem: (key) => saved.get(key) || null,
      setItem: (key, value) => saved.set(key, value),
      removeItem: (key) => saved.delete(key),
    },
    getBookKey: (book) => book.isbn
      ? String(book.isbn).trim().toLowerCase()
      : `${book.title}|${book.author || ""}`.toLowerCase(),
    findOwnedBook: (book) => state.books.find((item) => item.id === book.id
      || context.getBookKey(item) === context.getBookKey(book)),
    makeLibraryBook: (book) => ({
      id: `migrated-${book.isbn}`,
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      reading_status: null,
      ownership_status: null,
      is_favorite: false,
      shelves: [],
    }),
    console: { warn: (...args) => warnings.push(args) },
  };
  runInNewContext(`${migrationSource}\nthis.normalize = normalizeLocalBook; this.loadShelves = loadLocalShelves;`, context);
  state.books = books.map((book) => context.normalize(book));
  return { context, state, saved, warnings };
}

test("legacy local books and shelf items migrate to distinct Library fields and custom memberships", () => {
  const { context, state, saved, warnings } = harness();
  const shelves = context.loadShelves();
  const byTitle = new Map(state.books.map((book) => [book.title, book]));

  assert.deepEqual([...shelves.map((shelf) => shelf.name)], ["Top Shelf"]);
  assert.equal(byTitle.get("Legacy Book").reading_status, "reading");
  assert.equal(byTitle.get("Legacy Book").is_favorite, true);
  assert.equal(byTitle.get("Legacy Book").ownership_status, "sold");
  assert.deepEqual([...byTitle.get("Legacy Book").shelves], ["Top Shelf"]);
  assert.equal(byTitle.get("New Custom Book").shelves.includes("Top Shelf"), true);
  assert.equal(byTitle.get("Read Twice").reading_status, "reading");
  assert.equal(byTitle.get("Wishlist Book").ownership_status, "wishlist");
  assert.equal(byTitle.get("Liked Book").is_favorite, true);
  assert.ok(warnings.some(([message]) => message.includes("Conflicting legacy reading shelves")));

  const persistedBooks = JSON.parse(saved.get("librito-library-v1"));
  assert.equal(persistedBooks.some((book) => "liked" in book || "shelf" in book || "disposition" in book), false);
  assert.equal(saved.has("librito-shelf-items-v1"), false);
});
