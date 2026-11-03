import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const spellingSource = source.slice(source.indexOf("function editDistance("), source.indexOf("async function fetchBookProfileVolumes("));
const normalizationSource = source.slice(source.indexOf("function normalizeBookText("), source.indexOf("async function fetchOpenLibraryBookDetails("));
const searchSource = source.slice(source.indexOf("function parseNaturalSearch("), source.indexOf("function showStatsPage("));
const lookupSource = source.slice(source.indexOf("async function lookupBooksByTitleOrAuthor("), source.indexOf("// Book barcodes"));
const editionSource = source.slice(source.indexOf("function getEmbeddedOpenLibraryEdition("), source.indexOf("async function getMatchingOpenLibraryEdition("));
const catalogMapSource = source.slice(source.indexOf("async function mapCatalogItems("), source.indexOf("\nfunction normalizeCatalogText("));
const catalogGroupSource = source.slice(source.indexOf("function groupCatalogSearchBooks("), source.indexOf("\nfunction showSearchPage("));
const coelho = {
  key: "/works/OL796465W",
  title: "O Alquimista",
  author_name: ["Paulo Coelho"],
  number_of_pages_median: 180,
  editions: { docs: [{ title: "The Alchemist", language: ["eng"], isbn: ["9780061122415"], publish_date: ["1988"] }] },
};

function createContext(overrides = {}) {
  const context = {
    URLSearchParams,
    console,
    state: { searchQuery: "", searchResults: [], view: "search" },
    globalSearchLanguage: { value: "all" },
    discoveryBooks: [],
    allGenres: [],
    getLibraryBooks: () => [],
    getBookKey: (book) => `${book.title}|${book.author}`,
    isSameBookWork: (a, b) => a.title === b.title && a.author === b.author,
    syncGlobalSearchLanguageMenu() {},
    resolveSearchLanguage: (language) => language === "all" ? "" : language,
    getOpenLibraryLanguageName: (language) => language,
    OPEN_LIBRARY_EDITION_FIELDS: "editions",
    showSearchPage(query) { context.state.view = "search"; context.state.searchQuery = query; },
    getOpenLibrarySearchBook: async (work, language) => {
      const edition = context.getEmbeddedOpenLibraryEdition(work, language);
      return edition ? {
        ...work, ...edition, work_keys: [work.key], languages: edition.language, edition_count: 1,
      } : null;
    },
    fetchGoogleCatalogBooks: async () => { throw new Error("Unexpected Google fallback"); },
    ...overrides,
  };
  runInNewContext(`${spellingSource}\n${normalizationSource}\n${editionSource}\n${catalogMapSource}\n${catalogGroupSource}\n${searchSource}`, context);
  return context;
}

test("spelling matching handles omissions, insertions, substitutions, transpositions, and accents", () => {
  const context = createContext();
  for (const query of ["paulo celoho", "paulo coelo", "paulo coellho", "paulo coelgo", "paulo coehlo"]) {
    assert.equal(context.matchesBookSpelling(query, coelho), true, query);
  }
  assert.equal(context.editDistance("celoho", "coelho"), 2);
  assert.equal(context.editDistance("king", "knig"), 1);
  assert.equal(context.editDistance("", "king"), 4);
  assert.equal(context.editDistance("king", ""), 4);
  assert.equal(context.matchesBookSpelling("gabriel garcia", { author: "Gabriel García Márquez" }), true);
  assert.equal(context.matchesBookSpelling("stephen knig", { author: "Stephen King" }), true);
  assert.equal(context.matchesBookSpelling("alchemis", { title: "The Alchemist" }), true);
  assert.equal(context.matchesBookSpelling("paulo celoho", { author: "Paulo Freire" }), false);
  assert.equal(context.matchesBookSpelling("cat", { title: "Cut" }), false);
  assert.equal(context.matchesBookSpelling("zzzzzzz", coelho), false);
});

test("exact catalog results take priority without additional requests", async () => {
  let requests = 0;
  const exact = { docs: [coelho], numFound: 1 };
  const context = createContext({ fetchOpenLibrarySearch: async () => { requests += 1; return exact; } });
  assert.equal(await context.fetchSpellingTolerantSearch(new URLSearchParams({ q: "paulo coelho" }), "paulo coelho"), exact);
  assert.equal(requests, 1);
});

test("empty searches retrieve candidates, reject unrelated authors, and preserve language and fields", async () => {
  const requests = [];
  const context = createContext({
    fetchOpenLibrarySearch: async (params) => {
      requests.push(new URLSearchParams(params));
      return { docs: requests.length === 1 ? [] : [coelho, { title: "Pedagogy", author_name: ["Paulo Freire"] }] };
    },
  });
  const params = new URLSearchParams({ q: "paulo celoho language:eng", lang: "eng", fields: "key,title,author_name,editions", limit: "10", offset: "20" });
  const result = await context.fetchSpellingTolerantSearch(params, "paulo celoho");
  assert.equal(result.docs.length, 1);
  assert.equal(result.docs[0], coelho);
  assert.equal(result.spellingFallback, true);
  assert.equal(result.numFound, 1);
  assert.equal(requests.length, 2);
  assert.match(requests[1].get("q"), /^\(title:"paulo" OR author:"paulo" OR title:"celoho" OR author:"celoho"\) AND language:eng$/);
  assert.equal(requests[1].get("fields"), params.get("fields"));
  assert.equal(requests[1].get("lang"), "eng");
  assert.equal(requests[1].get("limit"), "100");
  assert.equal(requests[1].get("offset"), "0");
  assert.equal(params.get("offset"), "20");
});

test("single misspelled names use a bounded prefix retry and preserve the requested result limit", async () => {
  const requests = [];
  const context = createContext({
    fetchOpenLibrarySearch: async (params) => {
      requests.push(new URLSearchParams(params));
      return { docs: requests.length < 3 ? [] : Array.from({ length: 15 }, () => coelho) };
    },
  });
  const result = await context.fetchSpellingTolerantSearch(new URLSearchParams({ q: "coehlo", limit: "10" }), "coehlo");
  assert.equal(requests.length, 3);
  assert.equal(requests[2].get("q"), "(title:co* OR author:co*)");
  assert.equal(result.docs.length, 10);
});

test("unrelated queries remain empty and short, ISBN, and structured searches are not broadened", async () => {
  const requests = [];
  const context = createContext({
    fetchOpenLibrarySearch: async (params) => { requests.push(params); return { docs: [] }; },
  });
  const result = await context.fetchSpellingTolerantSearch(new URLSearchParams({ q: "zzzzzzz" }), "zzzzzzz");
  assert.equal(result.docs.length, 0);
  assert.equal(result.spellingFallback, false);
  assert.equal(requests.length, 3);
  for (const query of ["cat", "9780061122415", 'author:"paulo"', "a b"]) {
    requests.length = 0;
    await context.fetchSpellingTolerantSearch(new URLSearchParams({ q: query }), query);
    assert.equal(requests.length, 1, query);
  }
});

test("catalog failures propagate to the caller rather than looking like empty successful searches", async () => {
  const context = createContext({ fetchOpenLibrarySearch: async () => { throw new Error("Catalog unavailable"); } });
  await assert.rejects(context.fetchSpellingTolerantSearch(new URLSearchParams({ q: "paulo celoho" }), "paulo celoho"), /Catalog unavailable/);
  let requests = 0;
  context.fetchOpenLibrarySearch = async () => {
    if (++requests === 1) return { docs: [] };
    throw new Error("Candidate search unavailable");
  };
  await assert.rejects(context.fetchSpellingTolerantSearch(new URLSearchParams({ q: "paulo celoho" }), "paulo celoho"), /Candidate search unavailable/);
});

test("local fuzzy results retain genre, mood, and page limits and exact results come first", () => {
  const books = [
    { title: "A Mystery", author: "Paulo Coelho", genre: "Mystery", mood: "cozy", pages: 180 },
    { title: "Long Mystery", author: "Paulo Coelho", genre: "Mystery", mood: "cozy", pages: 300 },
    { title: "Unknown Pages", author: "Paulo Coelho", genre: "Mystery", mood: "cozy" },
    { title: "Wrong Genre", author: "Paulo Coelho", genre: "Romance", mood: "cozy", pages: 180 },
    { title: "Wrong Mood", author: "Paulo Coelho", genre: "Mystery", mood: "dark", pages: 180 },
  ];
  const context = createContext({ getLibraryBooks: () => books });
  const results = context.findLocalSearchMatches("cozy mystery paulo celoho under 200 pages");
  assert.equal(results.length, 1);
  assert.equal(results[0], books[0]);
  books.push({ title: "An Exact Match", author: "Paulo Celoho" });
  assert.equal(context.findLocalSearchMatches("paulo celoho").length, 1);
  assert.equal(context.findLocalSearchMatches("paulo celoho")[0], books.at(-1));
});

test("Discover returns editions for the screenshot typo in all-language and language-specific searches", async () => {
  for (const language of ["all", "eng"]) {
    let requests = 0;
    const context = createContext({
      fetchOpenLibrarySearch: async () => ({ docs: ++requests === 1 ? [] : [coelho] }),
    });
    await context.runNaturalSearch("paulo celoho", { updateHistory: false, language });
    assert.equal(context.state.searchResults.length, 1);
    assert.equal(context.state.searchResults[0].author, "Paulo Coelho");
    assert.equal(context.state.searchResults[0].title, "The Alchemist");
    assert.equal(context.state.searchResults[0].language, "eng");
    assert.equal(context.state.searchQuery, "paulo celoho");
    assert.equal(context.state.searchMessage, "Showing closest spelling matches.");
    assert.equal(context.state.searchLoading, false);
  }
});

test("a slower previous search cannot overwrite a newer search's results or loading state", async () => {
  let resolveOld;
  const context = createContext({
    fetchOpenLibrarySearch: async (params) => {
      if (params.get("q") === "old query") return new Promise((resolve) => { resolveOld = resolve; });
      return { docs: [coelho] };
    },
  });
  const old = context.runNaturalSearch("old query", { updateHistory: false });
  await context.runNaturalSearch("paulo coelho", { updateHistory: false });
  const results = context.state.searchResults;
  resolveOld({ docs: [coelho] });
  await old;
  assert.equal(context.state.searchQuery, "paulo coelho");
  assert.equal(context.state.searchResults, results);
  assert.equal(context.state.searchLoading, false);
});

test("Discover retains page limits and excludes editions from the wrong language after typo recovery", async () => {
  for (const work of [
    { ...coelho, number_of_pages_median: 300 },
    { ...coelho, editions: { docs: [{ title: "O Alquimista", language: ["por"] }] } },
  ]) {
    let requests = 0;
    const context = createContext({
      fetchOpenLibrarySearch: async () => ({ docs: ++requests === 1 ? [] : [work] }),
      fetchGoogleCatalogBooks: async () => ({ books: [] }),
    });
    await context.runNaturalSearch("paulo celoho under 200 pages", { updateHistory: false, language: "eng" });
    assert.equal(context.state.searchResults.length, 0);
  }
});

test("genre searches keep their existing catalog queries instead of spelling retries", async () => {
  const requests = [];
  const context = createContext({
    fetchOpenLibrarySearch: async (params) => { requests.push(params.get("q")); return { docs: [] }; },
    fetchGoogleCatalogBooks: async () => ({ books: [] }),
    shuffleBooks: (books) => books,
  });
  await context.runNaturalSearch("mystery", { updateHistory: false, language: "eng" });
  assert.ok(requests.length > 0);
  assert.ok(requests.every((query) => query === 'subject:"mystery" language:eng'));
});

test("add-book author lookup uses the same correction and identifies closest spelling editions", async () => {
  let requests = 0;
  const context = createContext({
    lookupTitleInput: { value: "" },
    lookupAuthorInput: { value: "paulo celoho" },
    lookupLanguage: { value: "eng" },
    scanStatus: { textContent: "" },
    titleSearchResults: [],
    titleLookupResults: { replaceChildren() {} },
    renderSelectedBookConfirmation() {},
    renderTitleSearchResults() {},
    fetchOpenLibrarySearch: async () => ({ docs: ++requests === 1 ? [] : [coelho] }),
  });
  runInNewContext(lookupSource, context);
  await context.lookupBooksByTitleOrAuthor();
  assert.equal(context.titleSearchResults.length, 1);
  assert.equal(context.titleSearchResults[0].author_name[0], "Paulo Coelho");
  assert.match(context.scanStatus.textContent, /closest spelling matches/);
});

function createMultilingualSearchContext() {
  const works = [
    { key: "/works/OL1W", title: "Los cuatro acuerdos", author_name: ["Don Miguel Ruiz"] },
    { key: "/works/OL2W", title: "The Four Agreements", author_name: ["Don Miguel Ruiz"] },
    { key: "/works/OL3W", title: "四つの約束", author_name: ["Don Miguel Ruiz"] },
  ];
  const requests = [];
  const context = createContext({
    lookupTitleInput: { value: works[0].title },
    lookupAuthorInput: { value: "" },
    lookupLanguage: { value: "default" },
    getDefaultBookLanguage: () => "eng",
    normalizeBookIsbn: (value) => value || "",
    scanStatus: { textContent: "" },
    titleSearchResults: [],
    titleLookupResults: { replaceChildren() {} },
    renderSelectedBookConfirmation() {},
    renderTitleSearchResults() {},
    fetchOpenLibrarySearch: async (params) => {
      requests.push(params);
      if (params.has("title")) return { docs: works.filter((work) => work.title === params.get("title")) };
      return { docs: params.get("q")?.startsWith("id_librarything:") ? works : works.slice(0, 2) };
    },
    fetchJsonCached: async (url) => {
      const index = works.findIndex((work) => url.includes(`${work.key}/`));
      assert.ok(index >= 0, `Unexpected catalog request: ${url}`);
      return { size: 1, entries: [{
        key: `/books/OL${index + 1}M`, title: works[index].title,
        languages: [{ key: `/languages/${["spa", "eng", "jpn"][index]}` }],
        identifiers: { librarything: ["3221"] },
        isbn_13: [`978000000000${index + 1}`],
      }] };
    },
  });
  const resolverSource = source.slice(source.indexOf("async function getOpenLibraryWorkEditions("), source.indexOf("\nfunction showSearchPage("));
  runInNewContext(`${resolverSource}\n${lookupSource}`, context);
  return { context, requests };
}

test("Discover resolves a Spanish query to English before filtering and groups translated work records", async () => {
  const { context, requests } = createMultilingualSearchContext();
  await context.runNaturalSearch("Los cuatro acuerdos", { updateHistory: false, language: "eng" });
  assert.equal(context.state.searchResults.length, 1);
  assert.equal(context.state.searchResults[0].title, "The Four Agreements");
  assert.equal(context.state.searchResults[0].edition_count, 3);
  assert.deepEqual(Array.from(context.state.searchResults[0].languages).sort(), ["eng", "jpn", "spa"]);
  assert.ok(requests.every((params) => !params.get("q")?.includes("language:")));
});

test("Discover all-language search presents one book with all editions instead of one card per language", async () => {
  const { context } = createMultilingualSearchContext();
  await context.runNaturalSearch("Los cuatro acuerdos", { updateHistory: false, language: "all" });
  assert.equal(context.state.searchResults.length, 1);
  assert.equal(context.state.searchResults[0].edition_count, 3);
  assert.equal(context.state.searchResults[0].languages.length, 3);
});

test("add-book lookup keeps the browser-language default but resolves translated queries first", async () => {
  const { context, requests } = createMultilingualSearchContext();
  await context.lookupBooksByTitleOrAuthor();
  assert.equal(context.titleSearchResults.length, 1);
  assert.equal(context.titleSearchResults[0].title, "The Four Agreements");
  assert.equal(context.titleSearchResults[0].edition_count, 3);
  assert.ok(requests.every((params) => !params.get("q")?.includes("language:")));
  assert.match(context.scanStatus.textContent, /1 matching books/);
});

test("Discover resolves matching editions for works beyond the previous eight-work cap", async () => {
  const context = createContext({
    fetchOpenLibrarySearch: async () => ({ docs: Array.from({ length: 12 }, (_, index) => ({
      ...coelho, key: `/works/OL${index}W`, title: `Book ${index}`,
      editions: { docs: [{ title: `Book ${index}`, language: ["eng"], isbn: [`isbn${index}`] }] },
    })) }),
  });
  await context.runNaturalSearch("paulo coelho", { updateHistory: false, language: "all" });
  assert.equal(context.state.searchResults.length, 12);
});
