import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { translate } from "../translations.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

class Element {
  children = [];
  attributes = {};
  events = {};
  dataset = {};
  classList = { toggle() {} };
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
}

test("status shelf shortcuts navigate to a Library filter and can be removed", () => {
  const navSource = source.slice(
    source.indexOf("function createStatusShelfNavigationItem("),
    source.indexOf("\nfunction loadLocalStatusShelfKeys("),
  );
  const routes = [];
  const removals = [];
  const context = {
    document: { createElement: () => new Element() },
    t: translate,
    state: { view: "library", library: { filter: "read" } },
    window: { matchMedia: () => ({ matches: false }) },
    navigateTo: (...args) => routes.push(args),
    setLibraryDrawerOpen() {},
    toggleStatusShelf: (...args) => removals.push(args),
  };
  runInNewContext(`${navSource}\nthis.create = createStatusShelfNavigationItem;`, context);

  const row = context.create({ key: "read", label: "Read", count: 3 });
  const [shortcut, remove] = row.children;
  assert.equal(shortcut.children[1].children[0].textContent, "Read");
  assert.equal(shortcut.attributes["aria-current"], "page");
  shortcut.events.click();
  remove.events.click();
  assert.deepEqual(JSON.parse(JSON.stringify(routes)), [["library", { filter: "read" }]]);
  assert.deepEqual(JSON.parse(JSON.stringify(removals)), [["read", false]]);
});

test("signed-out status shelf shortcuts persist locally for reading and ownership filters", async () => {
  const toggleSource = source.slice(
    source.indexOf("function loadLocalStatusShelfKeys("),
    source.indexOf("\nfunction renderShelfOptions("),
  );
  const stored = new Map();
  const state = { statusShelfKeys: [], supabase: null, session: null };
  const context = {
    state,
    statusShelfFilters: ["next_read", "reading", "read", "dnf", "owned"],
    localStorage: { setItem: (key, value) => stored.set(key, JSON.parse(value)) },
    statusShelvesStorageKey: "status-shelves",
    console,
    render() {},
    showToast() {},
  };
  runInNewContext(`${toggleSource}\nthis.toggle = toggleStatusShelf;`, context);

  await context.toggle("read", true);
  assert.deepEqual(JSON.parse(JSON.stringify(state.statusShelfKeys)), ["read"]);
  assert.deepEqual(stored.get("status-shelves"), ["read"]);
  await context.toggle("read", false);
  assert.deepEqual(JSON.parse(JSON.stringify(state.statusShelfKeys)), []);
  await context.toggle("owned", true);
  assert.deepEqual(JSON.parse(JSON.stringify(state.statusShelfKeys)), ["owned"]);
  await context.toggle("favorites", true);
  assert.deepEqual(JSON.parse(JSON.stringify(state.statusShelfKeys)), ["owned"]);
});

test("status shelf preference migration is user-scoped and reversible", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20261101120000_status_shelf_preferences.sql", import.meta.url),
    "utf8",
  );
  const rollback = await readFile(
    new URL("../supabase/rollbacks/20261101120000_status_shelf_preferences_down.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /primary key \(user_id, filter_key\)/i);
  assert.match(migration, /filter_key in \('next_read', 'reading', 'read', 'dnf', 'owned'\)/i);
  assert.match(migration, /auth\.uid\(\) = user_id/);
  assert.match(rollback, /drop table if exists public\.status_shelf_preferences/i);
});
