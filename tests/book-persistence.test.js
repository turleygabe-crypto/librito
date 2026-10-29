import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const saveFunction = source.slice(
  source.indexOf("async function saveBookToSupabase("),
  source.indexOf("\nglobalSearchForm.addEventListener(")
);

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
