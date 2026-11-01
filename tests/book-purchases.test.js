import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { getBookRetailers, loadMarketplaceBookListings } from "../lib/book-purchases.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const purchaseSource = source.slice(source.indexOf("function createBookPurchaseSection("),
  source.indexOf("\nfunction updateBookPageDetails("));

class Element {
  children = [];
  events = {};
  attributes = {};
  dataset = {};
  isConnected = true;
  classList = { add: (name) => { this.className = `${this.className || ""} ${name}`.trim(); } };
  constructor(tag = "div") { this.tagName = tag; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || ""; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
}

function purchaseUi({ client = null, listings = [], load = async () => listings } = {}) {
  const book = { title: "A Book", author: "A Reader", isbn: "978-0-123456-78-9", cover_i: 42 };
  const state = { view: "book", currentBook: book, supabase: client, session: client ? { user: { id: "reader" } } : null };
  const calls = [];
  const errors = [];
  const context = {
    state, Intl,
    document: { createElement: (tag) => new Element(tag) },
    console: { error: (...args) => errors.push(args) },
    getBookRetailers, loadMarketplaceBookListings: load,
    normalizeBookIsbn: (value) => (value || "").replace(/[^0-9X]/gi, ""),
    createProfileRecommendationSection: () => ({ section: new Element("section"), status: new Element() }),
    createBookCover: (value) => { const cover = new Element(); cover.book = value; return cover; },
    createBookExternalLink: (label, url, className) => {
      const link = new Element("a");
      Object.assign(link, { textContent: label, href: url, className });
      return link;
    },
    navigateTo: (...args) => calls.push(args),
  };
  const functions = runInNewContext(`${purchaseSource}\n({createBookPurchaseSection, loadBookPurchaseOptions})`, context);
  const section = functions.createBookPurchaseSection(book);
  return { book, state, section, calls, errors, refresh: () => functions.loadBookPurchaseOptions(book, section) };
}

test("retailer links are distinct HTTPS searches and encode the complete query", () => {
  const retailers = getBookRetailers('A Book & "Author"');
  assert.equal(retailers.length, 5);
  assert.equal(new Set(retailers.map((item) => item.name)).size, 5);
  for (const retailer of retailers) {
    assert.equal(new URL(retailer.url).protocol, "https:");
    assert.ok(retailer.url.includes(encodeURIComponent('A Book & "Author"')));
  }
});

test("Librito slot precedes outside cards; visitors see coming soon, never fake prices", async () => {
  const ui = purchaseUi();
  await ui.refresh();
  const row = ui.section.section.children[1];
  assert.equal(row.children[0], ui.section.marketplace);
  assert.equal(row.children.length, 6);
  assert.equal(ui.section.marketplace.children[0].children[3].textContent, "Coming soon");
  for (const card of row.children.slice(1)) {
    assert.equal(card.children[3].textContent, "Check retailer for price");
    assert.ok(card.children.at(-1).href.includes("9780123456789"));
  }
  assert.equal(ui.section.section.dataset.status, "ready");
});

test("non-admin readers never query private marketplace listings", async () => {
  const ui = purchaseUi({
    client: { rpc: async () => ({ data: false, error: null }) },
    load: () => { throw new Error("Must not load listings"); },
  });
  await ui.refresh();
  assert.equal(ui.errors.length, 0);
  assert.equal(ui.section.marketplace.children[0].children[3].textContent, "Coming soon");
});

test("admin cards show seller price, shipping, seller photo, and correct listing navigation", async () => {
  const ui = purchaseUi({
    client: { rpc: async () => ({ data: true, error: null }) },
    listings: [{ id: "copy", title: "A Book", price_cents: 1250, shipping_cents: 300,
      sellerName: "Reader shop", condition: "very_good", book_format: "Paperback",
      photoUrls: ["https://example.test/photo", "https://example.test/photo-back"] }],
  });
  await ui.refresh();
  const card = ui.section.marketplace.children[0];
  assert.match(card.className, /is-librito/);
  assert.equal(card.children[0].book.cover_i, null);
  assert.equal(card.children[0].book.cover_url, "https://example.test/photo");
  const additionalPhotos = card.children.find((child) => child.className === "book-purchase-additional-photos");
  assert.equal(additionalPhotos.children.length, 1);
  assert.equal(additionalPhotos.children[0].src, "https://example.test/photo-back");
  assert.equal(additionalPhotos.children[0].alt, "Additional seller photograph 2 of A Book");
  assert.equal(card.children.find((child) => child.textContent === "Sold by Reader shop").textContent, "Sold by Reader shop");
  assert.ok(card.children.some((child) => child.textContent === "$12.50"));
  assert.ok(card.children.some((child) => /very good.*Paperback.*Shipping \$3.00/.test(child.textContent)));
  card.children.at(-1).events.click();
  assert.equal(ui.calls[0][0], "marketplace-listing");
  assert.equal(ui.calls[0][1].id, "copy");
});

test("empty matching inventory is explicit and retains outside cards", async () => {
  const ui = purchaseUi({ client: { rpc: async () => ({ data: true, error: null }) } });
  await ui.refresh();
  assert.equal(ui.section.marketplace.children[0].children[3].textContent, "No matching copies yet");
  assert.equal(ui.section.section.children[1].children.length, 6);
});

test("errors are logged and shown; retry can recover without duplicating cards", async () => {
  let fail = true;
  const ui = purchaseUi({
    client: { rpc: async () => ({ data: true, error: null }) },
    load: async () => { if (fail) throw new Error("Offline"); return []; },
  });
  await ui.refresh();
  assert.equal(ui.errors.length, 1);
  assert.equal(ui.section.section.dataset.status, "error");
  assert.equal(ui.section.marketplace.children[0].children[3].textContent, "Listings unavailable");
  assert.equal(ui.section.status.children.at(-1).textContent, "Retry listings");
  fail = false;
  await ui.refresh();
  assert.equal(ui.section.section.dataset.status, "ready");
  assert.equal(ui.section.status.children.length, 0);
  assert.equal(ui.section.marketplace.children.length, 1);
});

test("navigation or sign-out during a pending request does not render stale listings", async () => {
  for (const change of [(ui) => { ui.state.currentBook = {}; }, (ui) => { ui.state.session = null; }]) {
    let resolve;
    let started;
    const loading = new Promise((done) => { started = done; });
    const ui = purchaseUi({
      client: { rpc: async () => ({ data: true, error: null }) },
      load: () => new Promise((done) => { resolve = done; started(); }),
    });
    const pending = ui.refresh();
    await loading;
    change(ui);
    resolve([]);
    await pending;
    assert.equal(ui.section.marketplace.children[0].children[3].textContent, "Checking listings...");
  }
});

function listingClient(rows, { queryError = null, sellerError = null, photoRows = [] } = {}) {
  const calls = [];
  const client = {
    storage: {
      from() {
        return {
          createSignedUrl: async (path) => ({ data: { signedUrl: `https://example.test/${path}` }, error: null }),
        };
      },
    },
    from(table) {
      const filters = [];
      const query = {
        select() { return this; },
        eq(...args) { filters.push(["eq", ...args]); return this; },
        gt(...args) { filters.push(["gt", ...args]); return this; },
        in(...args) { filters.push(["in", ...args]); return this; },
        order(...args) { filters.push(["order", ...args]); return this; },
        limit(...args) { filters.push(["limit", ...args]); return this; },
        then(resolve, reject) {
          calls.push({ table, filters });
          const result = table === "marketplace_listings" ? { data: rows, error: queryError }
            : table === "seller_profiles" ? { data: [{ user_id: "seller", display_name: "Reader shop" }], error: sellerError }
              : table === "marketplace_listing_photos" ? { data: photoRows, error: null }
                : { data: [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return query;
    },
  };
  return { client, calls };
}

test("matching uses bounded active/in-stock queries, exact title/author, and ISBN variants", async () => {
  const row = { id: "copy", seller_id: "seller", created_at: "2026-11-01" };
  const { client, calls } = listingClient([row, row]);
  const listings = await loadMarketplaceBookListings(client, {
    title: " A   Book ", author: " A Reader ", isbn: "978-0-123456-78-9",
  });
  assert.equal(listings.length, 1);
  assert.equal(listings[0].sellerName, "Reader shop");
  assert.deepEqual(listings[0].photoUrls, []);
  const queries = calls.filter((call) => call.table === "marketplace_listings");
  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.ok(query.filters.some((item) => item[0] === "eq" && item[1] === "status" && item[2] === "active"));
    assert.ok(query.filters.some((item) => item[0] === "gt" && item[1] === "quantity" && item[2] === 0));
    assert.ok(query.filters.some((item) => item[0] === "limit" && item[1] === 12));
  }
  assert.deepEqual(queries[0].filters.find((item) => item[0] === "in")[2], ["978-0-123456-78-9", "9780123456789"]);
  assert.ok(queries[1].filters.some((item) => item[1] === "normalized_title" && item[2] === "a book"));
  assert.ok(queries[1].filters.some((item) => item[1] === "normalized_author" && item[2] === "a reader"));
});

test("book purchase listings include all available seller photos in position order", async () => {
  const row = { id: "copy", seller_id: "seller", created_at: "2026-11-01" };
  const photoRows = [
    { listing_id: "copy", storage_path: "seller/copy/back.jpg", position: 1 },
    { listing_id: "copy", storage_path: "seller/copy/front.jpg", position: 0 },
  ].sort((a, b) => a.position - b.position);
  const { client } = listingClient([row], { photoRows });
  const listings = await loadMarketplaceBookListings(client, { isbn: "123456789X" });
  assert.deepEqual(listings[0].photoUrls, [
    "https://example.test/seller/copy/front.jpg",
    "https://example.test/seller/copy/back.jpg",
  ]);
});

test("listing and seller errors propagate, rather than appearing as empty inventory", async () => {
  const row = { id: "copy", seller_id: "seller", created_at: "2026-11-01" };
  for (const options of [{ queryError: new Error("Listing denied") }, { sellerError: new Error("Seller denied") }]) {
    const { client } = listingClient([row], options);
    await assert.rejects(loadMarketplaceBookListings(client, { isbn: "123456789X" }), /denied/);
  }
});

test("missing identifiers never trigger an unfiltered marketplace inventory query", async () => {
  const { client, calls } = listingClient([]);
  assert.deepEqual(await loadMarketplaceBookListings(client, { title: "Unknown" }), []);
  assert.equal(calls.length, 0);
});

test("ISBN arrays are supported and merged listing output is newest-first with a 12-card cap", async () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    id: `copy-${String(index).padStart(2, "0")}`, seller_id: "seller",
    created_at: `2026-11-${String(index + 1).padStart(2, "0")}`,
  }));
  const { client, calls } = listingClient(rows);
  const listings = await loadMarketplaceBookListings(client, {
    isbn: ["9780123456789", "123456789x"], title: "A Book", author: "A Reader",
  });
  assert.equal(listings.length, 12);
  assert.equal(listings[0].id, "copy-19");
  assert.equal(listings.at(-1).id, "copy-08");
  assert.ok(calls[0].filters.find((item) => item[0] === "in")[2].includes("123456789X"));
});
