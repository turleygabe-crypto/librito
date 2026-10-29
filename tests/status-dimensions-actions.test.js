import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { translate } from "../translations.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const keyHelpers = source.slice(
  source.indexOf("function getBookKey("),
  source.indexOf("\nfunction buildSuggestedShelves(")
);
const bookHelpers = source.slice(
  source.indexOf("function normalizeBookRecord("),
  source.indexOf("\nfunction getAnyShelfNames(")
);
const actions = source.slice(
  source.indexOf("async function toggleBookFavorite("),
  source.indexOf("\nasync function saveCurrentPage(")
);

function harness(initialBooks = []) {
  const state = { books: initialBooks, session: null, supabase: null };
  const values = new Map();
  const notices = [];
  const context = {
    state,
    t: translate,
    crypto: { randomUUID: () => `new-book-${state.books.length + 1}` },
    storageKey: "books",
    localStorage: { setItem: (key, value) => values.set(key, JSON.parse(value)) },
    checkBookLimit: () => true,
    checkReadingLimit: () => true,
    getBookEditionProgressKey: () => null,
    showToast: (message) => notices.push(message),
    render() {},
    console: { error() {} },
  };
  runInNewContext(
    `${keyHelpers}\n${bookHelpers}\n${actions}\nthis.actions = { setReadingStatus, toggleBookFavorite, setOwnershipStatus, setOwnedFormat };`,
    context
  );
  return { context, state, values, notices };
}

test("setting a reading status adds a catalog book directly to the Library", async () => {
  const { context, state, values, notices } = harness();
  await context.actions.setReadingStatus({
    title: "A Quiet Book",
    author: "A Reader",
    isbn: "9780000000001",
    page_count: 320,
  }, "reading");

  assert.equal(state.books.length, 1);
  assert.equal(state.books[0].reading_status, "reading");
  assert.equal(state.books[0].ownership_status, null);
  assert.equal(state.books[0].is_favorite, false);
  assert.equal(values.get("books")[0].reading_status, "reading");
  assert.match(notices[0], /Currently Reading/);
});

test("favoriting adds a catalog book and toggles the persisted boolean", async () => {
  const { context, state, values } = harness();
  const catalogBook = { title: "The Favorite", author: "A Reader", isbn: "9780000000002" };
  await context.actions.toggleBookFavorite(catalogBook);
  assert.equal(state.books[0].is_favorite, true);
  assert.equal(values.get("books")[0].is_favorite, true);

  await context.actions.toggleBookFavorite(catalogBook);
  assert.equal(state.books[0].is_favorite, false);
  assert.equal(values.get("books")[0].is_favorite, false);
  assert.equal(state.books.length, 1);
});

test("ownership status and format remain independent from reading status", async () => {
  const { context, state } = harness();
  const catalogBook = { title: "A Keepsake", author: "A Reader" };
  await context.actions.setOwnershipStatus(catalogBook, "owned");
  const book = state.books[0];
  await context.actions.setOwnedFormat(book, "audio");
  assert.equal(book.ownership_status, "owned");
  assert.equal(book.owned_format, "audio");
  assert.equal(book.reading_status, null);

  await context.actions.setOwnershipStatus(book, "sold");
  assert.equal(book.ownership_status, "sold");
  assert.equal(book.owned_format, null);
  assert.equal(book.disposition, undefined);
  assert.equal(state.books.length, 1);
});
