import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { booksWithCoversFirst } from "../lib/book-ordering.js";
import { loadMarketplaceListings } from "../lib/marketplace-ui.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const discoverSource = source.slice(source.indexOf("function buildDiscoverRows("),
  source.indexOf("\nfunction showSearchPage("));
const genresSource = source.slice(source.indexOf("const allGenres ="), source.indexOf("const recommendationRotationInterval"));
const rowSource = source.slice(source.indexOf("function createCardRow("), source.indexOf("\nfunction createBookCard("));

class Element {
  children = [];
  events = {};
  attributes = {};
  dataset = {};
  scrollLeft = 0;
  isConnected = true;
  className = "";
  textContent = "";
  classList = { contains: (name) => this.className.split(" ").includes(name) };
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) { this.children = []; this.textContent = ""; this.append(...children); }
  replaceWith(child) {
    const index = this.parent.children.indexOf(this);
    this.parent.children[index] = child;
    child.parent = this.parent;
    this.isConnected = false;
  }
  contains(target) { return this === target || this.children.some((child) => child.contains?.(target)); }
  querySelector(selector) {
    return this.children.find((child) => child.className?.split(" ").includes(selector.slice(1)))
      || this.children.map((child) => child.querySelector?.(selector)).find(Boolean);
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, action) { this.events[name] = action; }
  focus() { this.focused = true; }
}

function setup({ library = [], recommendations = [], client = null, user = null, load = async () => ({ listings: [] }) } = {}) {
  const page = new Element();
  const feed = new Element();
  feed.sections = new Map();
  feed.listings = [];
  page.discoverFeed = feed;
  const calls = [];
  const errors = [];
  const registry = new Map();
  const context = {
    state: { view: "search", searchQuery: "", supabase: client, session: user ? { user } : null,
      catalogError: "", catalogLoading: false, loading: false },
    genreCatalogPending: 0,
    genreCoverCache: new Map(),
    booksWithCoversFirst,
    getRecommendationKey: (book) => `${book.title}|${book.author}`,
    bookMatchesGenre: (book, genre) => book.genre === genre,
    getGenreBooks: (genre) => library.filter((book) => book.genre === genre),
    getLibraryBooks: () => library,
    getBookRecommendations: () => recommendations,
    navigateTo: (...args) => calls.push(args),
    document: { createElement: () => new Element(), getElementById: () => page, activeElement: null },
    window: { addEventListener() {}, removeEventListener() {}, requestAnimationFrame() {}, setTimeout() {} },
    createRowCard: (card) => Object.assign(new Element(), { card }),
    createBookCover: (book) => Object.assign(new Element(), { book }),
    createBookLoader: () => new Element(),
    createPageHeader: (...args) => Object.assign(new Element(), { header: args }),
    ensureHomeRecommendations() {},
    ensureGenreCatalogs() {},
    loadMarketplaceListings: load,
    cardRowRegistry: registry,
    console: { error: (...args) => errors.push(args) },
    Intl,
  };
  const functions = runInNewContext(`${genresSource}\n${rowSource}\n${discoverSource}\n({
    buildDiscoverRows, refreshDiscoverFeed, createDiscoverPage, createDiscoverListingCard,
    loadDiscoverMarketplaceRows, createCardRow, allGenres,
  })`, context);
  return { ...functions, context, page, feed, calls, errors, registry };
}

const book = (title, genre, pages = 300) => ({ title, author: "A Reader", genre, page_count: pages, cover_i: 42 });

test("Discover has over 30 collections with every genre and genuine short-read constraints", () => {
  const ui = setup();
  const recommendations = [
    book("Short", "Essays", 199), book("Boundary", "Fiction", 200), book("Unknown", "Fantasy", null),
    book("Negative", "Poetry", -1), book("Long", "Mystery", 400),
  ].map((book) => ({ book }));
  const rows = ui.buildDiscoverRows([], recommendations);
  assert.ok(rows.filter((row) => !row.hidden).length > 30);
  assert.deepEqual(Array.from(rows.filter((row) => row.genre), (row) => row.genre), Array.from(ui.allGenres));
  assert.deepEqual(Array.from(rows.find((row) => row.title === "Books under 200 pages").cards, ({ book }) => book.title), ["Short"]);
  assert.equal(rows.at(-1).title, "Explore all genres");
  assert.equal(rows.at(-1).cards.length, 28);
});

test("personalization never claims an arbitrary library book was loved", () => {
  const seed = book("My book", "Fantasy");
  const ui = setup();
  const recommendations = [book("Another", "Fantasy"), { ...book("Different", "Science"), author: "Another author" }]
    .map((book) => ({ book }));
  assert.ok(ui.buildDiscoverRows([seed], recommendations).some((row) => row.title === "More like My book"));
  const favorite = ui.buildDiscoverRows([{ ...seed, is_favorite: true }], recommendations)
    .find((row) => row.title === "Because you loved My book");
  assert.equal(favorite.cards.length, 1);
});

test("two marketplace rows are interleaved, non-duplicating, bounded and hidden when empty", () => {
  const ui = setup();
  for (const count of [0, 1, 12, 13, 24, 30]) {
    const listings = Array.from({ length: count }, (_, id) => ({ id }));
    const rows = ui.buildDiscoverRows([], [], listings);
    const marketplace = rows.filter((row) => /marketplace/i.test(row.title));
    assert.equal(marketplace.length, 2);
    assert.equal(rows.indexOf(marketplace[0]), 4);
    assert.ok(rows.indexOf(marketplace[1]) > 7);
    assert.equal(marketplace[0].hidden, count === 0);
    assert.equal(marketplace[1].hidden, count <= 12);
    const ids = marketplace.flatMap((row) => Array.from(row.cards, ({ listing }) => listing.id));
    assert.equal(ids.length, Math.min(count, 24));
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("Discover previews 24 covers but See all retains every collection book and Discover origin", () => {
  const ui = setup();
  const cards = Array.from({ length: 60 }, (_, index) => ({ type: "book", book: book(`Book ${index}`, "Fiction") }));
  const section = ui.createCardRow("Collection", cards, { origin: "discover", previewLimit: 24 });
  assert.equal(section.querySelector(".card-row").children.length, 24);
  section.querySelector(".show-all-btn").events.click();
  assert.equal(ui.registry.get("collection").cards.length, 60);
  assert.equal(ui.registry.get("collection").origin, "discover");
  assert.equal(ui.calls[0][0], "list");
});

test("small Discover collections still have See all while homepage behavior is preserved", () => {
  const ui = setup();
  const cards = [{ type: "book", book: book("One", "Fiction") }];
  assert.equal(ui.createCardRow("Small", cards, { origin: "discover" }).querySelector(".show-all-btn").hidden, false);
  assert.equal(ui.createCardRow("Small", cards).querySelector(".show-all-btn").hidden, true);
  assert.equal(ui.createCardRow("Empty", [], { origin: "discover" }).querySelector(".show-all-btn").hidden, true);
  const genre = ui.createCardRow("Fantasy", cards, { seeAllAction: () => ui.calls.push("genre") });
  genre.querySelector(".show-all-btn").events.click();
  assert.equal(ui.calls.at(-1), "genre");
});

test("expanded Discover collections return to Discover rather than Home", () => {
  const ui = setup();
  const listSource = source.slice(source.indexOf("function showCardListPage("), source.indexOf("\nfunction createCardRow("));
  ui.registry.set("collection", { title: "Collection", cards: [], origin: "discover" });
  ui.context.showPage = () => ui.page;
  ui.context.updateActiveNavigation = (label) => ui.calls.push(label);
  runInNewContext(`${listSource}\nshowCardListPage("collection");`, ui.context);
  assert.equal(ui.calls[0], "Discover");
  assert.deepEqual(Array.from(ui.page.children[0].header), ["Discover", "Collection", "", "search"]);
});

test("catalog refreshes preserve horizontal scroll, avoid duplicate rows, and leave text search untouched", () => {
  const recommendations = [{ book: book("One", "Fiction") }];
  const ui = setup({ recommendations });
  ui.refreshDiscoverFeed();
  const count = ui.feed.children.length;
  const first = ui.feed.sections.get("Picked for your library").section;
  first.querySelector(".card-row").scrollLeft = 150;
  recommendations.push({ book: book("Two", "Fantasy") });
  ui.refreshDiscoverFeed();
  assert.equal(ui.feed.children.length, count);
  assert.equal(ui.feed.sections.get("Picked for your library").section.querySelector(".card-row").scrollLeft, 150);
  const current = ui.feed.children[0];
  ui.context.state.searchQuery = "search text";
  recommendations.push({ book: book("Three", "Fantasy") });
  ui.refreshDiscoverFeed();
  assert.equal(ui.feed.children[0], current);
});

test("genre failures are shown with explicit retry, not successful empty inventory", () => {
  const ui = setup();
  ui.context.genreCoverCache.set("fantasy", { error: new Error("Offline") });
  ui.refreshDiscoverFeed();
  const row = ui.feed.sections.get("Fantasy bookshelf").section.querySelector(".card-row");
  assert.match(row.children[0].textContent, /Could not load Fantasy books/);
  row.children[1].events.click();
  assert.equal(ui.context.genreCoverCache.has("fantasy"), false);
});

test("featured collection and listing cards navigate to real genre and marketplace details", () => {
  const ui = setup();
  ui.createDiscoverPage(ui.page);
  assert.ok(ui.page.children.some((child) => child.className === "discover-hero"));
  ui.page.children.find((child) => child.className === "discover-hero").children.at(-1).events.click();
  assert.equal(ui.calls.at(-1)[0], "genre");
  assert.equal(ui.calls.at(-1)[1].name, "Fantasy");
  const card = ui.createDiscoverListingCard({
    id: "listing", title: "Copy", author: "Seller author", condition: "very_good",
    price_cents: 1250, shipping_cents: 300, photoUrls: ["seller-photo.jpg"],
  });
  const open = card.children[0];
  assert.equal(open.children[0].book.cover_url, "seller-photo.jpg");
  assert.equal(open.children[3].textContent, "$12.50");
  assert.match(open.children[4].textContent, /very good.*\$3.00/);
  open.events.click();
  assert.equal(ui.calls.at(-1)[0], "marketplace-listing");
  assert.equal(ui.calls.at(-1)[1].id, "listing");
});

test("Discover never fetches marketplace inventory for guests or non-admins", async () => {
  for (const admin of [null, false]) {
    const ui = setup({
      client: admin === null ? null : { rpc: async () => ({ data: admin, error: null }) },
      user: admin === null ? null : { id: "reader" },
      load: assert.fail,
    });
    await ui.loadDiscoverMarketplaceRows(ui.feed, new Element());
    assert.equal(ui.errors.length, 0);
    assert.equal(ui.feed.listings.length, 0);
  }
});

test("admin listing requests reveal only populated rows and errors can be retried", async () => {
  let fail = true;
  const ui = setup({
    client: { rpc: async () => ({ data: true, error: null }) }, user: { id: "reader" },
    load: async () => {
      if (fail) throw new Error("Offline");
      return { listings: [{ id: "one" }] };
    },
  });
  const status = new Element();
  await ui.loadDiscoverMarketplaceRows(ui.feed, status);
  assert.equal(ui.errors.length, 1);
  assert.match(status.textContent, /could not be loaded/);
  fail = false;
  await status.children[0].events.click();
  assert.equal(status.textContent, "");
  assert.equal(ui.feed.sections.get("Recently listed in the marketplace").section.hidden, false);
  assert.equal(ui.feed.sections.get("More from the Librito marketplace").section.hidden, true);
});

test("navigation and sign-out during marketplace loading discard stale responses", async () => {
  for (const change of [(ui) => { ui.context.state.session = null; }, (ui) => { ui.context.state.searchQuery = "new search"; }]) {
    let finish;
    let started;
    const loading = new Promise((resolve) => { started = resolve; });
    const ui = setup({
      client: { rpc: async () => ({ data: true, error: null }) }, user: { id: "reader" },
      load: () => new Promise((resolve) => { finish = resolve; started(); }),
    });
    const pending = ui.loadDiscoverMarketplaceRows(ui.feed, new Element());
    await loading;
    change(ui);
    finish({ listings: [{ id: "stale" }] });
    await pending;
    assert.equal(ui.feed.listings.length, 0);
  }
});

test("shared listing loader keeps database pagination, ordered photos and seller metadata", async () => {
  const requests = [];
  const rows = Array.from({ length: 25 }, (_, id) => ({ id, seller_id: "seller" }));
  const client = {
    rpc: async (name, params) => { requests.push({ name, params }); return { data: rows }; },
    from(table) {
      const query = {
        select() { return query; },
        in() { return query; },
        order() { return query; },
        then(resolve) {
          resolve({ data: table === "seller_profiles" ? [{ user_id: "seller", display_name: "Shop" }]
            : [{ listing_id: 0, storage_path: "front", position: 0 }] });
        },
      };
      return query;
    },
    storage: { from: () => ({ createSignedUrl: async (path) => ({ data: { signedUrl: `https://example.test/${path}` } }) }) },
  };
  const result = await loadMarketplaceListings(client, " book ", 2);
  assert.deepEqual(requests[0], { name: "marketplace_search_listings",
    params: { search_text: "book", page_offset: 48, page_size: 25 } });
  assert.equal(result.listings.length, 24);
  assert.equal(result.hasNext, true);
  assert.equal(result.listings[0].seller.display_name, "Shop");
  assert.deepEqual(result.listings[0].photoUrls, ["https://example.test/front"]);
  await assert.rejects(loadMarketplaceListings({ rpc: async () => ({ error: new Error("Unavailable") }) }), /Unavailable/);
});

test("shared listing loader propagates seller and photo errors and skips metadata queries for empty inventory", async () => {
  const empty = await loadMarketplaceListings({
    rpc: async () => ({ data: [] }),
    from: assert.fail,
  });
  assert.equal(empty.listings.length, 0);
  assert.equal(empty.hasNext, false);
  for (const failedTable of ["seller_profiles", "marketplace_listing_photos"]) {
    const client = {
      rpc: async () => ({ data: [{ id: "copy", seller_id: "seller" }] }),
      from(table) {
        const query = {
          select() { return query; }, in() { return query; }, order() { return query; },
          then(resolve) { resolve(table === failedTable ? { error: new Error(`${table} unavailable`) } : { data: [] }); },
        };
        return query;
      },
    };
    await assert.rejects(loadMarketplaceListings(client), new RegExp(failedTable));
  }
});
