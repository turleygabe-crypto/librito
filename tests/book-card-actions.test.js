import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { translate } from "../translations.js";

class Element {
  children = [];
  attributes = {};
  events = {};
  classes = new Set();
  classList = {
    add: (name) => this.classes.add(name),
    remove: (name) => this.classes.delete(name),
  };
  constructor(tagName = "div") { this.tagName = tagName; }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() {
    this.open = false;
    this.events.close();
  }
  remove() {
    this.parent.children = this.parent.children.filter((child) => child !== this);
  }
}

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const cardFunction = source.slice(source.indexOf("function createBookCard("), source.indexOf("\nfunction normalizeBookRecord("));
const menuFunction = source.slice(source.indexOf("function createBookCardMenu("), source.indexOf("\nfunction removeOrphanPopovers("));
const statusFunctions = source.slice(source.indexOf("function createReadingStatusMenu("), source.indexOf("\nfunction createBookMoreMenu("));

function createCard(book, { ownedBooks = [], shelfNames = [], currentShelf = "", view = "browse" } = {}) {
  const state = {
    books: ownedBooks,
    shelves: [
      { id: "wishlist", name: "Wishlist", is_wishlist: true },
      { id: "favorites", name: "Favorites" },
    ],
    view,
    currentShelf,
  };
  const calls = [];
  const body = new Element();
  const context = {
    document: { body, createElement: (tagName) => new Element(tagName) },
    state,
    t: translate,
    READING_STATUS_LABELS: { next_read: "Want to Read", reading: "Currently Reading", read: "Read" },
    OWNERSHIP_STATUS_LABELS: { owned: "Owned", sold: "Sold" },
    getReadingStatusLabel: (status) => context.READING_STATUS_LABELS[status] || "",
    getOwnershipStatusLabel: (status) => context.OWNERSHIP_STATUS_LABELS[status] || "",
    getLibraryBooks: () => ownedBooks,
    getBookKey: (entry) => entry.key,
    getAnyShelfNames: () => shelfNames,
    getCustomShelves: () => state.shelves.filter((shelf) => !shelf.is_wishlist),
    createBookCover: () => new Element(),
    wireCardPopover: () => assert.fail("Sheet statuses must not become detached popovers"),
  };
  for (const name of [
    "navigateTo", "promptAddToShelf", "toggleBookFavorite", "removeAnyBookFromShelf",
    "openBookProfile", "removeBookFromLibrary", "shareBook", "setReadingStatus", "setOwnershipStatus",
  ]) {
    context[name] = (...args) => {
      assert.equal(body.children.length, 0, "Close sheet before dispatching an action");
      assert.equal(body.classes.has("book-actions-open"), false);
      calls.push([name, ...args]);
    };
  }
  const createBookCard = runInNewContext(
    `${cardFunction}\n${menuFunction}\n${statusFunctions}\ncreateBookCard`, context,
  );
  const card = createBookCard(book);
  const trigger = card.children.find((child) => child.className === "card-menu");
  const open = () => {
    trigger.events.click();
    const sheet = body.children[0];
    return { sheet, content: sheet.children[0], actions: sheet.children[0].children[2].children };
  };
  return { card, trigger, open, body, calls, state };
}

const actionLabel = (action) => action.children[1]?.textContent;
const findAction = (actions, label) => actions.find((action) => actionLabel(action) === label);

test("book cards have only one top-right action trigger, opening a sheet with book details and every applicable action", () => {
  const book = { key: "book-1", title: "A Book", author: "An Author" };
  const { card, trigger, open, body, calls } = createCard(book);
  assert.deepEqual(card.children.map((child) => child.className), ["card-open-button", "card-menu"]);
  assert.equal(trigger.tagName, "button");
  assert.equal(trigger.attributes["aria-haspopup"], "dialog");
  assert.match(trigger.attributes["aria-label"], /A Book/);
  const { sheet, content, actions } = open();
  assert.equal(sheet.tagName, "dialog");
  assert.equal(sheet.open, true);
  assert.equal(body.classes.has("book-actions-open"), true);
  const header = content.children[1];
  assert.equal(header.children[1].children[0].textContent, book.title);
  assert.equal(header.children[1].children[1].textContent, book.author);
  assert.equal(sheet.attributes["aria-labelledby"], header.children[1].children[0].id);
  assert.deepEqual(actions.filter((action) => action.tagName === "button").map(actionLabel),
    ["Add Favorite", "Add to a shelf", "Share", "Open book", "Purchase"]);
  assert.equal(actions.filter((action) => action.tagName === "details").length, 2);
  const favorite = findAction(actions, "Add Favorite");
  assert.equal(favorite.attributes["aria-pressed"], "false");
  favorite.events.click();
  assert.deepEqual(calls, [["toggleBookFavorite", book]]);
});

test("saved book cards show current favorite/status values and dispatch all existing actions", () => {
  const book = {
    key: "book-2", title: "Saved Book", author: "An Author", is_favorite: true,
    reading_status: "reading", ownership_status: "owned",
  };
  const harness = createCard(book, { ownedBooks: [book] });
  const { sheet, actions } = harness.open();
  assert.deepEqual(actions.filter((action) => action.tagName === "button").map(actionLabel),
    ["Remove Favorite", "Add to a shelf", "Share", "Open book", "Remove from library"]);
  assert.equal(findAction(actions, "Remove Favorite").attributes["aria-pressed"], "true");
  const statuses = actions.filter((action) => action.tagName === "details");
  assert.equal(statuses[0].children[0].textContent, "Currently Reading");
  assert.equal(statuses[1].children[0].textContent, "Owned");
  sheet.close();
  for (const [label, name] of [
    ["Remove Favorite", "toggleBookFavorite"],
    ["Add to a shelf", "promptAddToShelf"],
    ["Share", "shareBook"],
    ["Open book", "openBookProfile"],
    ["Remove from library", "removeBookFromLibrary"],
  ]) {
    findAction(harness.open().actions, label).events.click();
    assert.deepEqual(harness.calls.at(-1), [name, book]);
  }
});

test("reading and ownership choices, including clearing statuses, close the sheet and use existing persistence actions", () => {
  const book = { key: "book-status", reading_status: "reading", ownership_status: "owned" };
  const harness = createCard(book, { ownedBooks: [book] });
  for (const [index, label, name, value] of [
    [0, "Want to Read", "setReadingStatus", "next_read"],
    [0, "Mark as read", "setReadingStatus", "read"],
    [0, "Remove status", "setReadingStatus", null],
    [1, "Sold", "setOwnershipStatus", "sold"],
    [1, "Remove ownership status", "setOwnershipStatus", null],
  ]) {
    const statuses = harness.open().actions.filter((action) => action.tagName === "details");
    const option = statuses[index].children[1].children.find((child) => child.textContent === label);
    assert.ok(option, label);
    option.events.click();
    assert.deepEqual(harness.calls.at(-1), [name, book, value]);
  }
});

test("Remove from shelf appears only for books on the current custom shelf", () => {
  const book = { key: "book-3", title: "Shelved Book", author: "An Author" };
  const onShelf = createCard(book, { shelfNames: ["Favorites"], currentShelf: "Favorites", view: "shelf" });
  const remove = findAction(onShelf.open().actions, "Remove from shelf");
  assert.ok(remove);
  remove.events.click();
  assert.deepEqual(onShelf.calls, [["removeAnyBookFromShelf", book, "Favorites"]]);
  for (const options of [
    { shelfNames: ["Favorites"], currentShelf: "Wishlist", view: "shelf" },
    {},
  ]) {
    assert.equal(findAction(createCard(book, options).open().actions, "Remove from shelf"), undefined);
  }
});

test("sheet dismisses through its close button, backdrop, and native close event without triggering book actions", () => {
  for (const method of ["button", "backdrop", "native"]) {
    const harness = createCard({ key: "dismiss", title: "A Book" });
    const { sheet, content } = harness.open();
    sheet.events.click({ target: content });
    assert.equal(sheet.open, true);
    if (method === "button") content.children[1].children[2].events.click();
    if (method === "backdrop") sheet.events.click({ target: sheet });
    if (method === "native") sheet.close();
    assert.equal(harness.body.children.length, 0);
    assert.equal(harness.body.classes.has("book-actions-open"), false);
    assert.deepEqual(harness.calls, []);
  }
});

test("sheet refreshes saved state when reopened and purchase keeps the edition information", () => {
  const book = { key: "fresh", title: "A Book", author: "An Author", isbn: ["123"], cover_url: "cover.jpg" };
  const books = [];
  const harness = createCard(book, { ownedBooks: books });
  findAction(harness.open().actions, "Purchase").events.click();
  assert.equal(harness.calls[0][0], "navigateTo");
  assert.equal(harness.calls[0][1], "purchase");
  assert.deepEqual({ ...harness.calls[0][2] }, { title: "A Book", author: "An Author", isbn: "123", cover: "cover.jpg" });
  books.push({ ...book, is_favorite: true });
  const { actions } = harness.open();
  assert.ok(findAction(actions, "Remove Favorite"));
  assert.equal(findAction(actions, "Purchase"), undefined);
});

test("a delayed native close event does not unlock a newly opened sheet", () => {
  const harness = createCard({ key: "reopen", title: "A Book" });
  const { sheet, content } = harness.open();
  sheet.close = () => { sheet.open = false; };
  content.children[1].children[2].events.click();
  const reopened = harness.open().sheet;
  sheet.events.close();
  assert.equal(reopened.open, true);
  assert.equal(harness.body.classes.has("book-actions-open"), true);
  assert.deepEqual(harness.body.children, [reopened]);
});
