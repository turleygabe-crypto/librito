import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { translate } from "../translations.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

class Element {
  static activeElement = null;
  children = [];
  parent = null;
  isConnected = true;
  attributes = {};
  events = {};
  dataset = {};
  classList = {
    add() {},
    toggle() {},
  };
  append(...children) {
    for (const child of children) {
      child.parent?.removeChild(child);
      child.parent = this;
      this.children.push(child);
    }
  }
  removeChild(child) {
    if (child.contains(Element.activeElement)) Element.activeElement = null;
    this.children = this.children.filter((item) => item !== child);
    child.parent = null;
  }
  contains(child) {
    return child === this || this.children.some((item) => item.contains(child));
  }
  replaceChildren(...children) {
    [...this.children].forEach((child) => this.removeChild(child));
    this.append(...children);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.events[name] = handler; }
  focus() { Element.activeElement = this; }
}

test("library filter counts and custom shelf filtering exclude system collections", () => {
  const helperSource = source.slice(
    source.indexOf("function getCustomShelves("),
    source.indexOf("\nfunction setLibraryDrawerOpen(")
  );
  const context = {
    getReadingStatusLabel: (status) => translate(`status.${status}`),
    getOwnershipStatusLabel: (status) => translate(`ownership.${status}`),
    t: translate,
    isLegacySystemShelf: (shelf) => Boolean(shelf.is_wishlist)
      || ["liked", "liked books", "wishlist", "currently reading", "completed books", "read", "reading"]
        .includes(String(shelf.name || "").trim().toLowerCase()),
    state: {
      shelves: [
        { name: "Top Shelf" },
        { name: "Wishlist", is_wishlist: true },
        { name: "Liked Books" },
        { name: "Currently Reading" },
        { name: "Completed Books" },
        { name: "Favorites" },
      ],
    },
  };
  runInNewContext(`${helperSource}\nthis.filters = getLibraryFilterOptions; this.custom = getCustomShelves;`, context);

  const books = [
    { reading_status: "next_read", is_favorite: true, ownership_status: "owned" },
    { reading_status: "reading", is_favorite: false, ownership_status: null },
    { reading_status: "read", is_favorite: true, ownership_status: "sold" },
    { reading_status: "dnf", is_favorite: false, ownership_status: null },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.filters(books).map(({ key, count }) => [key, count]))),
    [["", 4], ["next_read", 1], ["reading", 1], ["read", 1], ["dnf", 1], ["favorites", 2], ["owned", 1]]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.custom().map(({ name }) => name))),
    ["Top Shelf", "Favorites"]
  );
});

function createLibraryPage() {
  const helperSource = source.slice(
    source.indexOf("function getLibraryFilterOptions("),
    source.indexOf("\nfunction setLibraryDrawerOpen(")
  );
  const pageSource = source.slice(
    source.indexOf("function showLibraryPage("),
    source.indexOf("\nfunction createBookTable(")
  );
  const books = [
    { title: "Next", reading_status: "next_read" },
    { title: "Reading", reading_status: "reading" },
    { title: "Read", reading_status: "read" },
    { title: "Favorite", is_favorite: true },
    { title: "Owned", ownership_status: "owned" },
  ];
  const page = new Element();
  const browserCalls = [];
  const routes = [];
  const timers = new Map();
  let nextTimer = 0;
  const context = {
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    getReadingStatusLabel: (status) => translate(`status.${status}`),
    getOwnershipStatusLabel: (status) => translate(`ownership.${status}`),
    t: translate,
    state: { view: "library", library: { query: "", filter: "" }, statusShelfKeys: [] },
    statusShelfFilters: ["next_read", "reading", "read", "dnf", "owned"],
    document: { createElement: () => new Element() },
    window: { matchMedia: () => ({ matches: false }) },
    getLibraryBooks: () => books,
    createPageHeader: () => new Element(),
    showPage: () => page,
    updateActiveNavigation() {},
    createBrowseControls: () => new Element(),
    createShelfBrowser: (filteredBooks, scope, leading) => {
      browserCalls.push({ titles: filteredBooks.map((book) => book.title), scope });
      const browser = new Element();
      if (leading) browser.append(leading);
      return browser;
    },
    navigateTo: (...args) => routes.push(args),
    toggleStatusShelf() {},
    stateFilter: "",
    shelfBrowse: { page: 1 },
    applyBrowseControls: (libraryBooks) => libraryBooks,
    getStoredSearchPageSize: () => 20,
    createPagingBar: () => new Element(),
    enrichLibraryBooks: async () => false,
    readBookMeta: () => ({}),
    applyBookMeta() {},
  };
  runInNewContext(`${helperSource}\n${pageSource}\nthis.show = showLibraryPage;`, context);
  const flush = () => {
    for (const [id, timer] of timers) {
      timers.delete(id);
      timer.callback();
    }
  };
  return { context, page, browserCalls, routes, timers, flush };
}

test("library route filters books by status and exposes categories for sorting and filtering", () => {
  const { context, page, browserCalls, routes } = createLibraryPage();
  context.show("read");
  assert.deepEqual(browserCalls[0].titles, ["Read"]);
  assert.equal(browserCalls[0].scope, "library:read");
  const categoryFilters = page.children[1].children[0];
  assert.equal(categoryFilters.className, "library-category-filters");
  categoryFilters.children[0].events.click();
  assert.deepEqual(JSON.parse(JSON.stringify(routes[0])), ["library", { filter: "" }]);
});

test("library search waits for a typing pause and stays focused through results and empty states", () => {
  const { context, page, browserCalls, timers, flush } = createLibraryPage();
  context.show("");
  const leading = page.children[1];
  const search = leading.children[1];
  search.focus();
  const type = (value) => {
    search.value = value;
    search.events.input({ isComposing: false });
  };
  type("R");
  type("Re");
  type("Read");
  assert.equal(browserCalls.length, 1);
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 300);
  context.shelfBrowse.page = 3;
  flush();
  assert.deepEqual(browserCalls.at(-1).titles, ["Reading", "Read"]);
  assert.equal(context.shelfBrowse.page, 1);
  assert.equal(Element.activeElement, search);
  type("No match");
  flush();
  assert.equal(page.children[2].children[0].textContent, "No books match your search.");
  assert.equal(Element.activeElement, search);
  type("");
  flush();
  assert.equal(browserCalls.at(-1).titles.length, 5);
  assert.equal(Element.activeElement, search);
  assert.equal(search.parent, leading);
  assert.equal(leading.parent, page);
});

test("library Enter searches immediately and cancels the queued search", () => {
  const { context, page, browserCalls, timers, flush } = createLibraryPage();
  context.show("");
  const search = page.children[1].children[1];
  search.value = "Next";
  search.events.input({});
  let prevented = false;
  search.events.keydown({ key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(browserCalls.at(-1).titles, ["Next"]);
  assert.equal(timers.size, 0);
  flush();
  assert.equal(browserCalls.length, 2);
});

test("library search waits for composition to finish and ignores delayed work after navigation", () => {
  const { context, page, browserCalls, timers, flush } = createLibraryPage();
  context.show("");
  const search = page.children[1].children[1];
  search.value = "R";
  search.events.input({});
  search.events.compositionstart();
  assert.equal(timers.size, 0);
  search.value = "Read";
  search.events.input({ isComposing: true });
  search.events.keydown({ key: "Enter", isComposing: true });
  assert.equal(timers.size, 0);
  assert.equal(browserCalls.length, 1);
  search.events.compositionend();
  flush();
  assert.deepEqual(browserCalls.at(-1).titles, ["Reading", "Read"]);
  search.value = "Next";
  search.events.input({});
  context.state.view = "home";
  flush();
  assert.equal(browserCalls.length, 2);
  context.state.view = "library";
  search.events.input({});
  search.isConnected = false;
  flush();
  assert.equal(browserCalls.length, 2);
});

test("shelf browsers group sorting with page size and show pagination above and below books", () => {
  const browserSource = source.slice(
    source.indexOf("function createShelfBrowser("),
    source.indexOf("\nfunction createCompletedBooksList("),
  );
  const pagingBars = [];
  const extraLeading = new Element();
  extraLeading.className = "library-browse-leading";
  const controls = new Element();
  const context = {
    document: { createElement: () => new Element() },
    state: { currentShelf: "Top Shelf" },
    shelfBrowse: { scope: "", sort: "added", filters: {}, page: 1 },
    shelfSortOptions: [["added", "Recently added"]],
    applyBrowseControls: (books) => books,
    getStoredSearchPageSize: () => 2,
    createBrowseControls: () => controls,
    createPagingBar: (options) => {
      pagingBars.push(options);
      const bar = new Element();
      bar.className = "paging-bar";
      return bar;
    },
    createBookCard: (book) => ({ book }),
    enrichLibraryBooks: async () => false,
    localStorage: { setItem() {} },
    searchPageSizeKey: "page-size",
    console,
  };
  runInNewContext(`${browserSource}\nthis.create = createShelfBrowser;`, context);

  const section = context.create([{ title: "One" }, { title: "Two" }, { title: "Three" }], "library:", extraLeading);

  assert.equal(section.children[1], extraLeading);
  assert.equal(pagingBars.length, 2);
  assert.equal(pagingBars[0].leading, controls);
  assert.equal(pagingBars[0].groupControls, true);
  assert.equal(pagingBars[0].showSize, true);
  assert.equal(pagingBars[1].leading, null);
  assert.equal(pagingBars[1].showSize, false);
  assert.equal(pagingBars[1].paginationOnly, true);
  assert.equal(section.children[2].className, "paging-bar");
  assert.equal(section.children[3].className, "card-row expanded genre-browse-grid");
  assert.equal(section.children[4].className, "paging-bar");
});
