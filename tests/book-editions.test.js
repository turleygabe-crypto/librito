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
