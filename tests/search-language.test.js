import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { detectSearchLanguage, rankSearchLanguages } from "../lib/search-language.js";

test("language detection handles confident multilingual queries without a network service", async () => {
  for (const [query, language] of [
    ["Los cuatro acuerdos", "spa"],
    ["cien años de soledad", "spa"],
    ["books about the history of ancient Rome", "eng"],
    ["Je cherche des livres sur la philosophie", "fre"],
    ["Ich suche Bücher über Geschichte", "ger"],
    ["本を探しています", "jpn"],
    ["中文历史书籍推荐", "chi"],
    ["한국 역사에 관한 책을 찾고 있어요", "kor"],
    ["أبحث عن كتب حول تاريخ العرب", "ara"],
    ["मैं इतिहास के बारे में किताबें खोज रहा हूँ", "hin"],
  ]) {
    assert.equal((await detectSearchLanguage(query)).language, language, query);
  }
});

test("short titles, names, ISBNs and ambiguous language signals do not impose a language filter", async () => {
  for (const query of ["", "9780061122415", "Harry Potter", "Stephen King", "paulo coelho", "mystery", "The four agreements"]) {
    assert.equal((await detectSearchLanguage(query)).language, "", query);
  }
  assert.equal((await detectSearchLanguage("The four agreements")).preferredLanguage, "");
});

test("language preference breaks relevance ties without moving unrelated titles above exact matches", () => {
  const books = [
    { title: "The Alchemist", author: "Paulo Coelho", language: "eng" },
    { title: "Other book", author: "Other author", language: "por" },
    { title: "O Alquimista", author: "Paulo Coelho", language: "por" },
  ];
  const ranked = rankSearchLanguages(books, "paulo coelho", "por");
  assert.deepEqual(ranked, [books[2], books[0], books[1]]);
  assert.equal(books[0].language, "eng");
  assert.equal(rankSearchLanguages(books, "paulo coelho", ""), books);
});

test("results expose language filters even when empty and language changes rerun the catalog search", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const showPage = source.slice(source.indexOf("function showSearchPage("), source.indexOf("\nfunction parseNaturalSearch("));
  const controls = [];
  const calls = [];
  const state = {
    searchResults: [], shelves: [], searchSort: "", searchFilters: {},
    searchMessage: "", searchLoading: false,
  };
  const element = () => ({ append() {}, classList: { toggle() {} } });
  const context = {
    state, updateActiveNavigation() {}, showPage: element, createSearchHeader: element,
    createBrowseControls: (options) => { controls.push(options); return element(); },
    normalizeSearchText: (text) => text, createRetailerFallback: element, createSearchEmptyState: element,
    runNaturalSearch: (...args) => calls.push(args),
  };
  runInNewContext(`${showPage}\nshowSearchPage("query");`, context);
  assert.equal(controls[0].languages, true);
  assert.equal(controls[0].automaticLanguage, true);
  controls[0].onChange({ sort: "rating", filters: { lang: "spa", year: "2020" } });
  assert.equal(calls[0][0], "query");
  assert.equal(calls[0][1].language, "spa");
  assert.equal(state.searchSort, "rating");
  assert.equal(state.searchFilters.year, "2020");
  controls[0].onChange({ sort: "", filters: {} });
  assert.equal(calls[1][1].language, "auto");
});

test("automatic routes do not persist a previous manual language choice and legacy defaults remain supported", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /language: params\.get\("lang"\) \|\| "auto"/);
  assert.match(source, /globalSearchForm\.addEventListener[\s\S]*?await runNaturalSearch\(query\);/);
  const worker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /"\/lib\/search-language\.js"/);
  assert.match(worker, /"\/lib\/language-detector\.js"/);
});

test("language detection cannot keep a search waiting past its timeout", async () => {
  const { detectSearchLanguage: detectFresh } = await import(`../lib/search-language.js?timeout=${Date.now()}`);
  const started = Date.now();
  const result = await detectFresh("El alquimista", { timeout: 0 }).then(() => "detected", (error) => error.message);
  assert.ok(Date.now() - started < 1000);
  assert.ok(["detected", "Language detection timed out."].includes(result));
});
