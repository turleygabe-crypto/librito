import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const editionSource = source.slice(source.indexOf("async function getOpenLibraryWorkEditions("), source.indexOf("\nfunction showSearchPage("));
const normalizationSource = source.slice(source.indexOf("function normalizeBookText("), source.indexOf("\nasync function fetchOpenLibraryBookDetails("));
const author = "Don Miguel Ruiz";
const works = [
  { key: "/works/OL8353315W", title: "Los cuatro acuerdos", author_name: [author] },
  { key: "/works/OL27203W", title: "The Four Agreements", author_name: [author] },
  { key: "/works/OL28606017W", title: "I quattro accordi", author_name: [author] },
];
const edition = (title, language, cover, extra = {}) => ({
  title, languages: [{ key: `/languages/${language}` }], covers: [cover],
  isbn_13: [`978000000000${cover}`], ...extra,
});
const records = {
  "/works/OL8353315W": [edition(works[0].title, "spa", 1, { identifiers: { librarything: ["3221"] } })],
  "/works/OL27203W": [edition(works[1].title, "eng", 2, { identifiers: { librarything: ["3221"] } })],
  "/works/OL28606017W": [edition(works[2].title, "ita", 3, { translation_of: "The Four Agreements" })],
};

function createContext({ seed = works[0], search, fetchJson } = {}) {
  const requests = [];
  const context = {
    URLSearchParams,
    normalizeBookIsbn: (isbn) => String(isbn || "").replace(/[^0-9X]/g, ""),
    getDefaultBookLanguage: () => "eng",
    fetchOpenLibrarySearch: async (params) => {
      requests.push(params);
      if (search) return search(params);
      return { docs: params.has("title")
        ? works.filter((work) => work.title.toLowerCase() === params.get("title").toLowerCase())
        : works };
    },
    fetchJsonCached: async (url) => {
      if (fetchJson) return fetchJson(url);
      if (url.includes("/api/books?")) return { "ISBN:9780000000001": { key: "/books/OL1M" } };
      if (url.endsWith("/books/OL1M.json")) return { works: [{ key: seed.key }] };
      const key = new URL(url).pathname.replace("/editions.json", "");
      assert.ok(records[key], `Unexpected edition request: ${url}`);
      return { entries: records[key], size: records[key].length };
    },
  };
  runInNewContext(`${normalizationSource}\n${editionSource}`, context);
  return { context, requests };
}

test("Spanish and English starting editions find the same linked translations", async () => {
  for (const seed of works.slice(0, 2)) {
    const { context, requests } = createContext({ seed });
    const result = await context.getOpenLibraryEditionsForBook({
      title: seed.title, author, isbn: "9780000000001",
    }, "all");
    assert.deepEqual(Array.from(result, (item) => item.language).sort(), ["eng", "ita", "spa"]);
    assert.ok(requests.some((params) => params.get("q") === "id_librarything:3221"));
    assert.ok(requests.every((params) => !String(params).includes("language")));
  }
});

test("Italian original-title metadata resolves English and language filtering happens afterwards", async () => {
  const { context } = createContext({ seed: works[2] });
  const book = { title: works[2].title, author, isbn: "9780000000001" };
  const all = await context.getOpenLibraryEditionsForBook(book, "all");
  assert.deepEqual(Array.from(all, (item) => item.language).sort(), ["eng", "ita", "spa"]);
  const english = await context.getOpenLibraryEditionsForBook(book, "eng");
  assert.deepEqual(Array.from(english, (item) => item.title), ["The Four Agreements"]);
});

test("bilingual catalog titles connect a coverless translation to its separate illustrated record", async () => {
  const bilingualKey = "/works/OL15221159W";
  const bilingual = { key: bilingualKey, title: "I Quattro Accordi / The Four Agreements", author_name: [author] };
  const { context } = createContext({
    search: (params) => ({ docs: params.has("title")
      ? works.filter((work) => work.title.toLowerCase() === params.get("title").toLowerCase())
      : [works[0], works[1], bilingual] }),
    fetchJson: (url) => {
      const key = new URL(url).pathname.replace("/editions.json", "");
      const entries = key === bilingualKey
        ? [{ title: bilingual.title, identifiers: { librarything: ["3221"] } }]
        : records[key];
      assert.ok(entries, `Unexpected edition request: ${url}`);
      return { entries, size: entries.length };
    },
  });
  const result = await context.getOpenLibraryEditionsForBook({ title: works[0].title, author }, "ita");
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "I quattro accordi");
});

test("title-only resolution includes separate exact-title works but not companions or other authors", async () => {
  const duplicate = { ...works[0], key: works[1].key };
  const { context } = createContext({
    search: (params) => ({ docs: params.has("title") ? [
      works[0], duplicate,
      { key: "/works/OL99W", title: "Los cuatro acuerdos companion", author_name: [author] },
      { key: "/works/OL98W", title: works[0].title, author_name: ["Another Author"] },
      { key: "/books/OL97M", title: works[0].title, author_name: [author] },
    ] : [] }),
  });
  const result = await context.getOpenLibraryEditionsForBook({ title: works[0].title, author }, "all");
  assert.deepEqual(Array.from(result, (item) => item.language).sort(), ["eng", "spa"]);
});

test("related identifier results reject other authors and deduplicate works, ISBNs, and covers", async () => {
  const { context } = createContext({
    search: (params) => ({ docs: params.has("title") ? [works[0]] : [
      works[0], works[1], works[1],
      { key: "/works/OL99W", title: "Unrelated", author_name: ["Another Author"] },
    ] }),
  });
  const result = await context.getOpenLibraryEditionsForBook({ title: works[0].title, author }, "all");
  assert.equal(result.length, 2);
});

test("edition pagination includes requested languages beyond the first 100 entries", async () => {
  const offsets = [];
  const { context } = createContext({
    search: () => ({ docs: [works[0]] }),
    fetchJson: (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      offsets.push(offset);
      return { size: 101, entries: offset === 0
        ? Array.from({ length: 100 }, () => edition("Spanish", "spa", 1))
        : [edition("English", "eng", 2)] };
    },
  });
  const result = await context.getOpenLibraryEditionsForBook({ title: works[0].title, author }, "eng");
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(result.length, 1);
  assert.equal(result[0].language, "eng");
});

test("empty matches return no editions rather than selecting an unrelated first search result", async () => {
  const { context } = createContext({
    search: () => ({ docs: [{ ...works[1], title: "A different book" }] }),
    fetchJson: () => { throw new Error("Unrelated work must not be fetched"); },
  });
  const result = await context.getOpenLibraryEditionsForBook({ title: "Missing book", author }, "all");
  assert.equal(result.length, 0);
});

test("catalog failures propagate to the Edition Finder error handler", async () => {
  const { context } = createContext({
    search: () => { throw new Error("Catalog unavailable"); },
  });
  await assert.rejects(context.getOpenLibraryEditionsForBook({ title: works[0].title, author }), /Catalog unavailable/);
});

test("incomplete edition pagination is an error rather than a successful truncated result", async () => {
  const { context } = createContext({
    search: () => ({ docs: [works[0]] }),
    fetchJson: (url) => ({ size: 101, entries: new URL(url).searchParams.get("offset") === "0"
      ? Array.from({ length: 100 }, () => edition("Spanish", "spa", 1))
      : [] }),
  });
  await assert.rejects(context.getOpenLibraryEditionsForBook({ title: works[0].title, author }, "all"), /Incomplete edition response/);
});

test("shared discovery resolves Cyrillic, Arabic, and Japanese titles before language filtering", async () => {
  const multilingualWorks = [
    { key: "/works/OL1W", title: "Маленький принц", author_name: ["Antoine de Saint-Exupéry"], author_key: ["OL1A"] },
    { key: "/works/OL2W", title: "الأمير الصغير", author_name: ["Антуан де Сент-Экзюпери"], author_key: ["OL1A"] },
    { key: "/works/OL3W", title: "星の王子さま", author_name: ["サン＝テグジュペリ"], author_key: ["OL1A"] },
    { key: "/works/OL4W", title: "Le Petit Prince", author_name: ["Antoine de Saint-Exupéry"], author_key: ["OL1A"] },
  ];
  const languages = ["rus", "ara", "jpn", "fre"];
  const { context, requests } = createContext({
    search: (params) => ({ docs: params.has("title")
      ? multilingualWorks.filter((work) => work.title === params.get("title"))
      : multilingualWorks }),
    fetchJson: (url) => {
      const index = multilingualWorks.findIndex((work) => url.includes(`${work.key}/`));
      assert.ok(index >= 0, `Unexpected work: ${url}`);
      return { size: 1, entries: [edition(multilingualWorks[index].title, languages[index], index + 1, {
        key: `/books/OL${index + 1}M`,
        identifiers: { librarything: ["1234"] },
        authors: [{ key: "/authors/OL1A" }],
      })] };
    },
  });
  for (const seed of multilingualWorks) {
    const result = await context.getOpenLibrarySearchBook(seed, "jpn");
    assert.equal(result.title, "星の王子さま");
    assert.equal(result.edition_count, 4);
    assert.deepEqual(Array.from(result.languages).sort(), languages.slice().sort());
    assert.equal(result.work_keys.length, 4);
  }
  assert.ok(requests.every((params) => !params.get("q")?.includes("language:")));
});

test("coverless and ISBN-less editions keep separate catalog identities", async () => {
  const { context } = createContext({
    search: () => ({ docs: [works[0]] }),
    fetchJson: () => ({ size: 3, entries: [
      { key: "/books/OL1M", title: works[0].title, languages: [{ key: "/languages/spa" }] },
      { key: "/books/OL2M", title: works[0].title, languages: [{ key: "/languages/spa" }] },
      { key: "/books/OL3M", title: works[0].title, isbn_13: ["9780000000001"], languages: [{ key: "/languages/spa" }] },
    ] }),
  });

  test("original-title lookups use author identities instead of requiring the same author spelling", async () => {
    const translated = {
      key: "/works/OL1W", title: "星の王子さま", author_name: ["サン＝テグジュペリ"], author_key: ["OL1A"],
    };
    const original = {
      key: "/works/OL2W", title: "Le Petit Prince", author_name: ["Antoine de Saint-Exupéry"], author_key: ["OL1A"],
    };
    const { context } = createContext({
      search: (params) => {
        assert.equal(params.get("q"), "author_key:(OL1A)");
        assert.equal(params.has("author"), false);
        return { docs: params.get("title") === original.title ? [original] : [translated] };
      },
      fetchJson: (url) => ({ size: 1, entries: [{
        title: url.includes("/OL1W/") ? translated.title : original.title,
        translation_of: url.includes("/OL1W/") ? original.title : undefined,
        languages: [{ key: url.includes("/OL1W/") ? "/languages/jpn" : "/languages/fre" }],
        authors: [{ key: "/authors/OL1A" }],
      }] }),
    });
    const result = await context.getOpenLibrarySearchBook(translated, "fre");
    assert.equal(result.title, original.title);
    assert.equal(result.edition_count, 2);
  });
  const result = await context.getOpenLibraryEditionsForBook({ title: works[0].title, author }, "spa");
  assert.equal(result.length, 3);
  assert.ok(result.every((item) => item.coverUrl === ""));
  assert.deepEqual(Array.from(result, (item) => item.key), ["/books/OL1M", "/books/OL2M", "/books/OL3M"]);
  const book = await context.getOpenLibrarySearchBook({ ...works[0], cover_i: 999 }, "spa");
  assert.equal(book.edition_count, 3);
  assert.equal(book.cover_i, undefined);
});

test("related work searches paginate past 100 work records", async () => {
  const offsets = [];
  const { context } = createContext({
    search: (params) => {
      if (params.has("title")) return { docs: [works[0]] };
      const offset = Number(params.get("offset"));
      offsets.push(offset);
      return { numFound: 101, docs: offset === 0
        ? Array.from({ length: 100 }, () => works[0])
        : [works[1]] };
    },
  });
  const result = await context.getOpenLibraryEditionsForBook({ title: works[0].title, author }, "eng");
  assert.equal(result.length, 1);
  assert.deepEqual(offsets, [0, 100]);
});

test("title aliases handle translated subtitles and accent differences without admitting companion books", async () => {
  const { context } = createContext({
    search: (params) => ({ docs: [
      { ...works[0], title: "Ácuerdos", author_name: ["Dón Miguel Ruiz"] },
      { key: "/works/OL99W", title: "Acuerdos companion", author_name: [author] },
    ].filter((work) => params.has("title") && params.get("title") === "Acuerdos") }),
  });
  const result = await context.getOpenLibraryEditionsForBook({ title: "Acuerdos: Una guía", author }, "spa");
  assert.equal(result.length, 1);
});

test("transitively overlapping work groups collapse to one book without losing languages", () => {
  const { context } = createContext();
  const result = context.groupCatalogSearchBooks([
    { title: "Russian", work_keys: ["/works/OL1W"], languages: ["rus"], edition_count: 2 },
    { title: "Japanese", work_keys: ["/works/OL2W"], languages: ["jpn"], edition_count: 3 },
    { title: "Arabic", work_keys: ["/works/OL1W", "/works/OL2W"], languages: ["ara"], edition_count: 5 },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(Array.from(result[0].languages).sort(), ["ara", "jpn", "rus"]);
  assert.equal(result[0].edition_count, 5);
});

test("search representatives include editions on later pages instead of stopping at eight works", async () => {
  const { context } = createContext({
    search: () => ({ docs: [] }),
    fetchJson: (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      return { size: 101, entries: offset === 0
        ? Array.from({ length: 100 }, (_, index) => edition("Spanish", "spa", 1, { key: `/books/OL${index}M` }))
        : [edition("Japanese", "jpn", 2, { key: "/books/OL101M" })] };
    },
  });
  const result = await context.getOpenLibrarySearchBook(works[0], "jpn");
  assert.equal(result.title, "Japanese");
  assert.equal(result.edition_count, 101);
});

test("catalog requests are processed with bounded concurrency and preserve ordering", async () => {
  const { context } = createContext();
  let active = 0;
  let maximum = 0;
  const result = await context.mapCatalogItems(Array.from({ length: 12 }, (_, index) => index), async (index) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return index;
  });
  assert.equal(maximum, 4);
  assert.deepEqual(Array.from(result), Array.from({ length: 12 }, (_, index) => index));
});

test("Edition Finder renders more than eight editions per language, including coverless ISBN-less records", () => {
  class Element {
    children = [];
    dataset = {};
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    addEventListener() {}
  }
  const status = new Element();
  const choices = new Element();
  const section = {
    dataset: {},
    querySelector: (selector) => selector === ".edition-picker-status" ? status : choices,
  };
  const { context } = createContext();
  const covers = [];
  Object.assign(context, {
    document: { createElement: () => new Element() },
    formatCatalogDate: (date) => date,
    getBookEditionProgressKey: (details) => details.isbn,
    isCurrentBookEdition: () => false,
    createBookCover: (book) => { covers.push(book); return new Element(); },
    groupByLanguage: (items, getCode) => {
      const grouped = new Map();
      items.forEach((item) => {
        const code = getCode(item);
        grouped.set(code, [...(grouped.get(code) || []), item]);
      });
      return [...grouped.entries()];
    },
  });
  const detailsSource = source.slice(source.indexOf("function getGoogleBookDetails("), source.indexOf("\nfunction getEditionLanguageName("));
  const coverSource = source.slice(source.indexOf("function getBookEditionCoverUrl("), source.indexOf("\nfunction renderBookRating("));
  const renderSource = source.slice(source.indexOf("function renderBookProfileEditions("), source.indexOf("\nfunction ensureEditionDialog("));
  runInNewContext(`${detailsSource}\n${coverSource}\n${renderSource}`, context);
  const volumes = Array.from({ length: 12 }, (_, index) => ({
    id: `ol:${index}`,
    volumeInfo: { edition_key: `/books/OL${index}M`, title: `Edition ${index}`, language: "jpn" },
  }));
  for (const grouped of [false, true]) {
    context.renderBookProfileEditions({ title: "Selected book", cover_url: "selected-cover.jpg" }, section, volumes, { groupByLanguage: grouped });
    assert.equal(choices.children.filter((child) => child.className === "edition-cover-choice").length, 12);
    assert.equal(section.dataset.status, "loaded");
    assert.match(status.textContent, /12/);
  }
  assert.ok(covers.every((book) => !book.cover_url), "Coverless editions must not borrow the selected edition's cover");
});

test("late print-format enrichment cannot overwrite a newer language selection", async () => {
  let finish;
  let renders = 0;
  const book = { title: works[0].title, author };
  const section = { languageRequestId: 1, isConnected: true };
  const context = {
    state: { view: "book", currentBook: book },
    getOpenLibraryEditionsForBook: () => new Promise((resolve) => { finish = resolve; }),
    renderBookProfileEditions: () => { renders += 1; },
    console,
  };
  const enrichmentSource = source.slice(source.indexOf("async function loadBookProfilePrintFormats("), source.indexOf("\nasync function loadBookProfileAudiobook("));
  runInNewContext(enrichmentSource, context);
  const pending = context.loadBookProfilePrintFormats(book, section, []);
  section.languageRequestId = 2;
  finish([{ key: "/books/OL1M", title: works[0].title }]);
  await pending;
  assert.equal(renders, 0);
});

test("default edition loading filters Google editions to the browser language and enriches them", async () => {
  const book = { title: works[0].title };
  const section = {
    isConnected: true, dataset: {},
    querySelector: () => ({}),
  };
  let rendered;
  let enriched;
  const context = {
    state: { view: "book", currentBook: book },
    getDefaultBookLanguage: () => "eng",
    browserLanguageCodes: { en: "eng", es: "spa" },
    setBookProfileLoadingStatus() {},
    renderBookProfileEditions: (_book, _section, volumes) => { rendered = volumes; },
    loadBookProfilePrintFormats: (_book, _section, volumes) => { enriched = volumes; },
    console,
  };
  const loadingSource = source.slice(source.indexOf("async function loadBookProfileEditions("), source.indexOf("\nconst editionLanguageResults"));
  runInNewContext(loadingSource, context);
  await context.loadBookProfileEditions(book, section, [
    { id: "Spanish", volumeInfo: { language: "es" } },
    { id: "English", volumeInfo: { language: "en" } },
  ]);
  assert.deepEqual(Array.from(rendered, (volume) => volume.id), ["English"]);
  assert.equal(enriched, rendered);
});

test("successful profile catalog loading invokes shared edition discovery unless the language already changed", async () => {
  for (const languageChanged of [false, true]) {
    let finish;
    let editionLoads = 0;
    const editions = { languageRequestId: 0 };
    const page = { querySelector: () => null, querySelectorAll: () => [] };
    const context = {
      fetchBookProfileVolumes: () => new Promise((resolve) => { finish = resolve; }),
      bookProfileIsActive: () => true,
      getBestGoogleBookVolume: (_book, volumes) => volumes[0],
      getGoogleBookDetails: () => ({ title: "The Four Agreements", categories: [], publish_date: "", page_count: null, description: "" }),
      renderBookRating() {},
      getBookProfileDescription: () => "",
      renderBookProfileDescription() {},
      updateBookReadingProgress() {},
      loadBookProfileEditions: async () => { editionLoads += 1; },
      console,
    };
    const catalogSource = source.slice(source.indexOf("async function loadBookProfileCatalog("), source.indexOf("\nasync function loadBookProfilePrintFormats("));
    runInNewContext(catalogSource, context);
    const pending = context.loadBookProfileCatalog({ title: works[0].title }, { page, editions });
    if (languageChanged) editions.languageRequestId = 1;
    finish([{ volumeInfo: { title: "The Four Agreements" } }]);
    await pending;
    assert.equal(editionLoads, languageChanged ? 0 : 1);
  }
});
