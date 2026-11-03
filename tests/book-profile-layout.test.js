import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { translate } from "../translations.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const renderSource = source.slice(source.indexOf("function renderBookPage("), source.indexOf("\nfunction createPrivateBookPhotoGallery("));
const genreSource = source.slice(source.indexOf("function renderBookGenreTags("), source.indexOf("\nfunction getShelfSummaryLabel("));

class Element {
  children = [];
  attributes = {};
  events = {};
  classList = {
    add: (name) => { this.className = `${this.className} ${name}`.trim(); },
    remove: (name) => { this.className = this.className.split(/\s+/).filter((item) => item !== name).join(" "); },
    toggle() {},
  };
  constructor(className = "") { this.className = className; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  get childElementCount() { return this.children.length; }
}

function renderProfile(ownedBook, signedIn = false) {
  const page = new Element();
  const calls = [];
  const context = {
    state: signedIn ? { session: { user: { id: "reader" } }, supabase: {} } : {},
    document: { createElement: () => new Element() },
    t: translate,
    showPage: () => page,
    updateActiveNavigation() {},
    createBookCover: () => new Element("book-detail-cover"),
    getBookProfileDescription: () => "A book description",
    formatCatalogDate: () => "2012",
    renderBookGenreTags() {},
    findOwnedBook: () => ownedBook,
    createBookMoreMenu: () => new Element("book-more-menu"),
    createReadingStatusMenu: () => new Element("book-status-menu"),
    createOwnershipStatusMenu: () => new Element("ownership-status-menu"),
    createBookShelfMenu: () => new Element("book-shelf-menu"),
    createBookReadingProgress: () => new Element("book-reading-progress"),
    setBookBookmark: (book) => calls.push(["bookmark", book]),
    toggleBookFavorite: (book) => calls.push(["favorite", book]),
    isBookWishlisted: () => false,
    toggleBookWishlist: (book) => calls.push(["wishlist", book]),
    navigateTo() {},
    createBookEditionPicker: () => new Element("edition-picker"),
    createPrivateBookPhotoGallery: () => new Element("book-cover-gallery"),
    createBookAudiobookPanel: () => new Element("book-audiobook-panel"),
    createProfileRecommendationSection: () => ({ section: new Element("book-profile-recommendation") }),
    createBookPurchaseSection: () => ({ section: new Element("book-profile-recommendation book-purchase-section") }),
    loadBookPurchaseOptions() {},
    loadBookProfileCatalog() {},
    loadBookProfileAudiobook() {},
    loadBookProfileRecommendations() {},
  };
  const render = runInNewContext(`${renderSource}\nrenderBookPage`, context);
  const book = { title: "Free will", author: "Sam Harris", page_count: 83 };
  render(book);
  return { page, calls, book };
}

test("profile places actions above metadata and statuses without the duplicate shelf banner", () => {
  const { page, calls, book } = renderProfile(null);
  const layout = page.children[1];
  assert.equal(layout.className, "book-detail-layout");
  assert.deepEqual(layout.children.map((child) => child.className),
    ["book-detail-cover", "book-profile-intro", "book-detail-content"]);
  const [actions, metadata, statuses] = layout.children[2].children;
  assert.equal(actions.className, "page-actions book-profile-actions");
  assert.equal(metadata.className, "book-detail-metadata");
  assert.equal(statuses.className, "book-state-controls");
  assert.equal(metadata.children.length, 4);
  assert.equal(statuses.children.length, 2);
  assert.deepEqual(actions.children.map((child) => child.className),
    ["secondary-btn", "secondary-btn", "book-shelf-menu", "book-more-menu"]);
  actions.children[0].events.click();
  actions.children[1].events.click();
  assert.deepEqual(calls, [["favorite", book], ["wishlist", book]]);
  assert.deepEqual(page.children[2].children.map((child) => child.className),
    ["edition-picker", "book-profile-recommendation book-purchase-section", "book-audiobook-panel", "book-profile-recommendations"]);
});

test("private gallery appears only for signed-in readers with the book in their own library", () => {
  const owned = { id: "book", title: "Free will" };
  for (const [book, signedIn, visible] of [
    [owned, true, true], [owned, false, false], [null, true, false], [null, false, false],
  ]) {
    const { page } = renderProfile(book, signedIn);
    assert.equal(page.children[1].children[0].className, visible ? "book-cover-gallery" : "book-detail-cover");
    assert.equal(page.children.length, 3);
  }
});

test("profile keeps bookmark progress and editing available for currently reading books", () => {
  const owned = { reading_status: "reading", page_count: 83, current_page: 15 };
  const { page, calls } = renderProfile(owned);
  const readingActions = page.children[1].children[2].children[3];
  assert.equal(readingActions.className, "reading-actions");
  assert.equal(readingActions.children[0].className, "book-reading-progress");
  assert.equal(readingActions.children[1].textContent, "Move bookmark");
  readingActions.children[1].events.click();
  assert.deepEqual(calls, [["bookmark", owned]]);
});

test("profile uses a compact warm hero, top-right actions, and responsive horizontal edition cards", () => {
  assert.match(css, /\.book-detail-layout\s*\{[^}]*min-height: 0;[^}]*radial-gradient\(circle at 10% 50%/);
  assert.match(css, /\.book-profile-intro\s*\{[^}]*align-self: start;[^}]*justify-content: flex-start/);
  assert.match(css, /\.book-profile-actions\s*\{[^}]*justify-content: flex-end/);
  assert.match(css, /\.book-detail-content \.book-profile-actions > \.secondary-btn,[^{]+\{[^}]*background: #f9ecde/);
  assert.match(css, /\.edition-cover-choices\s*\{[^}]*repeat\(auto-fill, minmax\(min\(100%, 26rem\), 1fr\)\)/);
  assert.match(css, /\.edition-cover-choice\s*\{[^}]*grid-template-columns: 4\.5rem minmax\(0, 1fr\);[^}]*align-items: center/);
  assert.match(css, /@media \(max-width: 680px\)\s*\{\s*\.book-detail-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
});

test("genre bubbles wrap as a group without wrapping text inside each bubble", () => {
  const context = { document: { createElement: () => new Element() } };
  const renderGenres = runInNewContext(`${genreSource}\nrenderBookGenreTags`, context);
  const value = new Element("book-detail-value");
  renderGenres(value, ["Free will and determinism bestseller", "New York Times bestseller"]);
  assert.ok(value.className.includes("book-detail-value--genres"));
  assert.equal(value.children.length, 2);
  renderGenres(value, []);
  assert.ok(!value.className.includes("book-detail-value--genres"));
  assert.equal(value.children[0].textContent, "—");

  assert.match(css, /\.book-detail-content \.book-detail-value--genres\s*\{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*gap: 0\.3rem/);
  assert.match(css, /\.book-profile-genre\s*\{[^}]*white-space: nowrap/);
});
