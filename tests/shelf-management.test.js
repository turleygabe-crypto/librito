import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const operations = source.slice(source.indexOf("async function renameShelf("), source.indexOf("\nfunction formatCurrency("));
const shelfNames = source.slice(source.indexOf("function getBookShelfNames("), source.indexOf("\nfunction setLibraryDrawerOpen("));

function harness({ signedIn = false, failure = false } = {}) {
  const shelf = { id: "custom", name: "Cozy Reads" };
  const state = {
    shelves: [shelf, { id: "other", name: "Favorites" }, { id: "wishlist", name: "Wishlist", is_wishlist: true }],
    books: [
      { id: "legacy", shelf: shelf.name },
      { id: "multi", shelf: shelf.name, shelves: [shelf.name, "Favorites"] },
      { id: "other", shelf: "Favorites", shelves: ["Favorites"] },
    ],
    shelfItems: [{ shelf_id: "custom" }, { shelf_id: "other" }],
    view: "shelf", currentShelf: shelf.name,
    session: signedIn ? { user: { id: "reader" } } : null,
  };
  const storage = new Map();
  const calls = [];
  const notices = [];
  if (signedIn) {
    state.supabase = { from(table) {
      calls.push(["from", table]);
      const query = {};
      for (const method of ["update", "delete", "eq", "select"]) {
        query[method] = (...args) => { calls.push([method, ...args]); return query; };
      }
      query.single = async () => ({ error: failure ? new Error("Database rejected mutation") : null });
      return query;
    } };
  }
  const context = {
    state, localStorage: { setItem: (key, value) => storage.set(key, JSON.parse(value)) },
    storageKey: "books", shelvesStorageKey: "shelves",
    saveShelfItemsLocally: () => { if (!state.session) storage.set("items", state.shelfItems); },
    navigateTo: (view, values = {}) => { state.view = view; state.currentShelf = values.name; },
    render() {}, showToast: (message) => notices.push(message), console: { error() {} },
  };
  runInNewContext(`${shelfNames}\n${operations}\nthis.rename = renameShelf; this.remove = deleteShelf;`, context);
  return { context, state, shelf, storage, calls, notices };
}

test("local rename persists legacy and multi-shelf assignments without losing saved items", async () => {
  const { context, state, shelf, storage } = harness();
  await context.rename(shelf, "  Weekend Reads  ");
  assert.equal(shelf.name, "Weekend Reads");
  assert.equal(state.currentShelf, "Weekend Reads");
  assert.equal(state.books[0].shelf, "Weekend Reads");
  assert.deepEqual([...state.books[0].shelves], ["Weekend Reads"]);
  assert.deepEqual([...state.books[1].shelves], ["Weekend Reads", "Favorites"]);
  assert.equal(storage.get("shelves")[0].name, "Weekend Reads");
  assert.equal(storage.get("books")[0].shelf, "Weekend Reads");
  assert.equal(state.shelfItems.length, 2);
});

test("local delete keeps books and other memberships and persists removal", async () => {
  const { context, state, shelf, storage } = harness();
  await context.remove(shelf);
  assert.equal(state.books.length, 3);
  assert.equal(state.books[0].shelf, "");
  assert.equal(state.books[0].shelves.length, 0);
  assert.equal(state.books[1].shelf, "Favorites");
  assert.deepEqual([...state.books[1].shelves], ["Favorites"]);
  assert.equal(storage.get("shelves").some((item) => item.id === shelf.id), false);
  assert.deepEqual(storage.get("items"), [{ shelf_id: "other" }]);
  assert.equal(state.view, "home");
});

test("invalid names and built-in Wishlist mutations leave data unchanged", async () => {
  const { context, state, shelf } = harness();
  for (const name of ["", "  ", "favorites", "Currently Reading", "Completed Books", "Wishlist"]) {
    await assert.rejects(context.rename(shelf, name), /unique shelf name/);
    assert.equal(shelf.name, "Cozy Reads");
  }
  await assert.rejects(context.rename(state.shelves[2], "Custom"), /unique shelf name/);
  await assert.rejects(context.remove(state.shelves[2]), /cannot be deleted/);
});

test("signed-in mutations target the owned shelf, require a returned row, and do not write demo storage", async () => {
  for (const action of ["rename", "remove"]) {
    const { context, shelf, calls, storage } = harness({ signedIn: true });
    await context[action](shelf, "New name");
    assert.deepEqual(calls[0], ["from", "shelves"]);
    assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "user_id" && call[2] === "reader"));
    assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "id" && call[2] === "custom"));
    assert.ok(calls.some((call) => call[0] === "select" && call[1] === "id"));
    assert.equal(storage.size, 0);
  }
});

test("failed or disconnected signed-in mutations do not change local state or report success", async () => {
  for (const action of ["rename", "remove"]) {
    for (const disconnected of [false, true]) {
      const { context, state, shelf, notices, storage } = harness({ signedIn: true, failure: true });
      if (disconnected) state.supabase = null;
      const before = JSON.stringify(state);
      await assert.rejects(context[action](shelf, "New name"), /Could not|connection is unavailable/);
      assert.equal(JSON.stringify(state), before);
      assert.equal(notices.length, 0);
      assert.equal(storage.size, 0);
    }
  }
});

class Element {
  children = [];
  events = {};
  append(...children) { this.children.push(...children); }
  addEventListener(name, handler) { this.events[name] = handler; }
}

test("custom shelf controls work in local and signed-in modes using retryable dialogs; built-ins have none", async () => {
  const pageSource = source.slice(source.indexOf("function showShelfPage("), source.indexOf("\nconst shelfSortOptions"));
  for (const signedIn of [false, true]) {
    for (const name of ["Custom", "Wishlist", "Liked Books", "Currently Reading", "Completed Books"]) {
      const page = new Element();
      const shelf = { id: name, name, is_wishlist: name === "Wishlist" };
      const mutations = [];
      const state = { shelves: ["Custom", "Wishlist"].includes(name) ? [shelf] : [], books: [], session: signedIn ? {} : null };
      const context = {
        state, document: { createElement: () => new Element() }, updateActiveNavigation() {},
        showPage: () => page, getLibraryBooks: () => [], getAllBooksOnShelf: () => [],
        formatCurrency: () => "$0", createPageHeader: () => new Element(),
        createBookTable: () => new Element(), createCurrentlyReadingList: () => new Element(),
        createCompletedBooksList: () => new Element(), openDialog() {},
        showAppPrompt: async (message, options) => {
          assert.equal(options.value, "Custom");
          await options.onConfirm("Renamed");
        },
        showAppConfirm: async (message, options) => {
          assert.match(message, /Books will stay in your library and on other shelves/);
          assert.equal(options.danger, true);
          await options.onConfirm();
        },
        renameShelf: async (target, nextName) => mutations.push(["rename", target.id, nextName]),
        deleteShelf: async (target) => mutations.push(["delete", target.id]),
      };
      runInNewContext(`${pageSource}\nthis.show = showShelfPage;`, context);
      context.show(name);
      const buttons = page.children[1]?.children || [];
      const rename = buttons.find((item) => item.textContent === "Rename shelf");
      const remove = buttons.find((item) => item.textContent === "Delete shelf");
      assert.equal(Boolean(rename), name === "Custom");
      assert.equal(Boolean(remove), name === "Custom");
      if (rename) {
        await rename.events.click();
        await remove.events.click();
        assert.deepEqual(mutations, [["rename", "Custom", "Renamed"], ["delete", "Custom"]]);
      }
    }
  }
});

test("database rename/delete synchronize legacy references atomically and preserve library books", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table public.books (id int primary key, user_id int, shelf text);
      create table public.shelves (id int primary key, user_id int, name text);
      create table public.book_shelves (
        book_id int references books(id), shelf_id int references shelves(id) on delete cascade
      );
      create table public.shelf_items (shelf_id int references shelves(id) on delete cascade);
      insert into shelves values (1, 10, 'Cozy'), (2, 10, 'Other'), (3, 20, 'Cozy');
      insert into books values (1, 10, 'Cozy'), (2, 10, 'Other'), (3, 20, 'Cozy');
      insert into book_shelves values (1, 1), (1, 2), (3, 3);
      insert into shelf_items values (1), (2);
    `);
    const migration = await readFile(new URL("../supabase/migrations/20261025040000_shelf_management.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec("update shelves set name = 'Renamed' where id = 1");
    assert.deepEqual((await db.query("select shelf from books order by id")).rows, [
      { shelf: "Renamed" }, { shelf: "Other" }, { shelf: "Cozy" },
    ]);
    assert.equal((await db.query("select * from book_shelves")).rows.length, 3);
    assert.equal((await db.query("select * from shelf_items")).rows.length, 2);
    await db.exec("alter table books add constraint prevent_detach check (id <> 1 or shelf is not null)");
    await assert.rejects(db.exec("delete from shelves where id = 1"), /prevent_detach/);
    assert.equal((await db.query("select name from shelves where id = 1")).rows[0].name, "Renamed");
    assert.equal((await db.query("select shelf from books where id = 1")).rows[0].shelf, "Renamed");
    await db.exec("alter table books drop constraint prevent_detach; delete from shelves where id = 1");
    assert.equal((await db.query("select * from books")).rows.length, 3);
    assert.equal((await db.query("select shelf from books where id = 1")).rows[0].shelf, null);
    assert.deepEqual((await db.query("select shelf_id from book_shelves where book_id = 1")).rows, [{ shelf_id: 2 }]);
    assert.deepEqual((await db.query("select shelf_id from shelf_items")).rows, [{ shelf_id: 2 }]);
    assert.equal((await db.query("select shelf from books where id = 3")).rows[0].shelf, "Cozy");
  } finally {
    await db.close();
  }
});
