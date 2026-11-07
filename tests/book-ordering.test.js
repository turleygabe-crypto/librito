import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { booksWithCoversFirst, hasBookCover } from "../lib/book-ordering.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const controlsSource = source.slice(source.indexOf("const browseFilterGroups ="), source.indexOf("\nconst browseUi ="));
const books = Object.freeze([
  Object.freeze({ title: "A", cover_i: -1, first_publish_year: 2024, ratings_average: 5, pages: 100, added: "2024", cost: 9 }),
  Object.freeze({ title: "B", cover_i: 12, first_publish_year: 2019, ratings_average: 3, pages: 300, added: "2019", cost: 7 }),
  Object.freeze({ title: "C", isbn: "9780000000001", first_publish_year: 2018, ratings_average: 4, pages: 100, added: "2018", cost: 8 }),
  Object.freeze({ title: "D", cover_url: "https://example.test/cover.jpg", first_publish_year: 2020, ratings_average: 2, pages: 300, added: "2020", cost: 6 }),
]);

function controlsContext(extra = {}) {
  const context = { booksWithCoversFirst, console: { log() {} }, ...extra };
  runInNewContext(controlsSource, context);
  return context;
}

test("only known cover IDs and nonempty image URLs count as cover art, not ISBN guesses", () => {
  for (const book of [{ cover_i: 1 }, { cover_i: "12" }, { cover_url: "/cover.jpg" }]) {
    assert.equal(hasBookCover(book), true);
  }
  for (const book of [{}, { isbn: "9780000000001" }, { cover_i: -1 }, { cover_i: 0 },
    { cover_i: "bad" }, { cover_i: 1.5 }, { cover_url: "  " }, { cover_url: null }]) {
    assert.equal(hasBookCover(book), false);
  }
});

test("cover-first partition is stable, retains every book, and never mutates the input", () => {
  const result = booksWithCoversFirst(books);
  assert.deepEqual(result.map((book) => book.title), ["B", "D", "A", "C"]);
  assert.deepEqual(books.map((book) => book.title), ["A", "B", "C", "D"]);
  assert.equal(result[0], books[1]);
  const cards = books.map((book) => Object.freeze({ book }));
  assert.deepEqual(booksWithCoversFirst(cards, ({ book }) => book).map((card) => card.book), result);
  assert.deepEqual(booksWithCoversFirst([]), []);
  assert.deepEqual(booksWithCoversFirst([books[0], books[2]]), [books[0], books[2]]);
});

test("browse controls keep relevance and chosen sorts within cover groups and retain filters", () => {
  const context = controlsContext();
  const expected = {
    "": ["B", "D", "A", "C"],
    title: ["B", "D", "A", "C"],
    new: ["D", "B", "A", "C"],
    old: ["B", "D", "C", "A"],
    rating: ["B", "D", "A", "C"],
    added: ["D", "B", "A", "C"],
    value: ["B", "D", "A", "C"],
  };
  for (const [sort, titles] of Object.entries(expected)) {
    assert.deepEqual(context.applyBrowseControls(books, sort, {}).map((book) => book.title), titles, sort);
  }
  assert.deepEqual(context.applyBrowseControls(books, "", { len: "short" }).map((book) => book.title), ["A", "C"]);
  assert.deepEqual(context.applyBrowseControls(books, "", { rating: "3" }).map((book) => book.title), ["B", "A", "C"]);
});

class Element {
  children = [];
  events = {};
  classList = { toggle() {} };
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(name, callback) { this.events[name] = callback; }
  scrollIntoView() {}
}

function gridTitles(element) {
  if (element.className === "card-row expanded genre-browse-grid") {
    return element.children.map(({ book }) => book.title);
  }
  for (const child of element.children || []) {
    const titles = gridTitles(child);
    if (titles) return titles;
  }
}

test("search orders the entire result set before slicing pages", () => {
  let page;
  const context = controlsContext({
    state: { searchResults: books, searchSort: "", searchFilters: {}, searchPage: 1, shelves: [] },
    document: { createElement: () => new Element() },
    updateActiveNavigation() {},
    showPage: () => (page = new Element()),
    createSearchHeader: () => new Element(),
    createBrowseControls: () => new Element(),
    normalizeSearchText: (query) => query,
    getStoredSearchPageSize: () => 2,
    getLibraryBooks: () => [],
    createPagingBar: () => new Element(),
    createBookCard: (book) => ({ book }),
  });
  const searchSource = source.slice(source.indexOf("function showSearchPage("), source.indexOf("\nfunction parseNaturalSearch("));
  runInNewContext(`${searchSource}\nthis.show = showSearchPage;`, context);
  context.show("books");
  assert.deepEqual(gridTitles(page), ["B", "D"]);
  context.state.searchPage = 2;
  context.show("books");
  assert.deepEqual(gridTitles(page), ["A", "C"]);
});

test("library, wishlist, and shelf pagination put all covered books on earlier pages", () => {
  for (const scope of ["library:", "wishlist", "shelf:Top Shelf"]) {
    let paging;
    const context = controlsContext({
      document: { createElement: () => new Element() },
      state: { currentShelf: "Top Shelf" },
      shelfBrowse: { scope: "", page: 1 },
      shelfSortOptions: [],
      getStoredSearchPageSize: () => 2,
      createBrowseControls: () => new Element(),
      createPagingBar: (options) => { paging = options; return new Element(); },
      createBookCard: (book) => ({ book }),
      enrichLibraryBooks: async () => false,
    });
    const browserSource = source.slice(source.indexOf("function createShelfBrowser("), source.indexOf("\nfunction createCompletedBooksList("));
    runInNewContext(`${browserSource}\nthis.create = createShelfBrowser;`, context);
    const section = context.create(books, scope);
    assert.deepEqual(gridTitles(section), ["D", "B"], scope);
    assert.equal(paging.totalPages, 2);
    paging.onGo(2);
    assert.deepEqual(gridTitles(section), ["A", "C"], scope);
  }
});

test("add-book lookup displays covers first and selects the clicked result after reordering", () => {
  const results = books.map((book) => ({ ...book }));
  const list = new Element();
  const context = {
    booksWithCoversFirst,
    titleSearchResults: results,
    selectedTitleResult: null,
    titleLookupResults: list,
    document: { createElement: () => new Element() },
    createBookCover: (book) => ({ book }),
    getBookDescription: () => "",
    renderSelectedBookConfirmation() {},
    scanStatus: {},
    selectedBookConfirmation: new Element(),
  };
  const lookupSource = source.slice(source.indexOf("function renderTitleSearchResults("), source.indexOf("\nfunction renderSelectedBookConfirmation("));
  runInNewContext(`${lookupSource}\nthis.render = renderTitleSearchResults;`, context);
  context.render();
  assert.deepEqual(list.children.map((button) => button.children[0].book.title), ["B", "D", "A", "C"]);
  list.children[1].events.click();
  assert.equal(context.selectedTitleResult, results[3]);
  assert.deepEqual(results.map((book) => book.title), ["A", "B", "C", "D"]);
});

test("suggested shelves use a covered book as their first book without dropping coverless suggestions", () => {
  const context = {
    booksWithCoversFirst,
    getLibraryBooks: () => [],
    allGenres: [],
  };
  const shelfSource = source.slice(source.indexOf("function buildSuggestedShelves("), source.indexOf("\nconst cardRowRegistry"));
  runInNewContext(`${shelfSource}\nthis.build = buildSuggestedShelves;`, context);
  const recommendations = books.map((book) => ({ book }));
  const [shelf] = context.build([], recommendations, recommendations);
  assert.equal(shelf.book, books[1]);
  assert.deepEqual(shelf.books.map((book) => book.title), ["B", "D", "A", "C"]);
  assert.equal(shelf.count, 4);
});

test("profile recommendations prioritize covers before the eight-book limit", async () => {
  const selected = { title: "Selected", author: "Author", genre: "Fiction" };
  const candidates = Array.from({ length: 10 }, (_, index) => ({
    title: `Book ${index}`, author: "Author", categories: ["Fiction"],
    cover_url: index >= 8 ? `https://example.test/${index}.jpg` : "",
  }));
  const rendered = [];
  const context = {
    booksWithCoversFirst,
    state: { view: "book", currentBook: selected },
    fetchGoogleBookVolumes: async () => candidates,
    getGoogleBookDetails: (book) => book,
    getRecommendationKey: (book) => book.title,
    isSameBookWork: () => false,
    normalizeBookText: (text) => text.toLowerCase(),
    renderProfileRecommendationResults: (_target, results) => rendered.push(results),
  };
  const recommendationSource = source.slice(source.indexOf("function mapGoogleVolumeToBook("), source.indexOf("\nfunction renderProfileRecommendationResults("));
  runInNewContext(`${recommendationSource}\nthis.load = loadBookProfileRecommendations;`, context);
  await context.load(selected, {}, {});
  assert.equal(rendered.length, 2);
  for (const results of rendered) {
    assert.deepEqual(results.map((book) => book.title),
      ["Book 8", "Book 9", "Book 0", "Book 1", "Book 2", "Book 3", "Book 4", "Book 5"]);
  }
});
