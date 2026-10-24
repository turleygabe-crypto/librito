import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

class Element {
  children = [];
  attributes = {};
  events = {};
  isConnected = true;
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, handler) { this.events[name] = handler; }
}

test("the sidebar logo is included in the Vercel static deployment", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(config.builds.some((build) => build.src === "assets/**" && build.use === "@vercel/static"));
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const logoPath = html.match(/class="brand-mark" src="([^"]+)"/)[1];
  await access(new URL(`..${decodeURIComponent(logoPath)}`, import.meta.url));
  const logo = await readFile(new URL(`..${decodeURIComponent(logoPath)}`, import.meta.url));
  assert.equal(logo.subarray(1, 4).toString(), "PNG");
  assert.equal(logo[25], 6, "the displayed logo must be an RGBA PNG");
});

test("sidebar branding stacks a larger transparent logo above the text at all breakpoints", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const brandRules = [...css.matchAll(/\.sidebar \.brand\s*\{([^}]+)\}/g)];
  assert.match(brandRules.at(-2)[1], /flex-direction: column/);
  assert.match(brandRules.at(-2)[1], /text-align: center/);
  const logoRules = [...css.matchAll(/\.sidebar \.brand-mark\s*\{([^}]+)\}/g)];
  const logoStyles = logoRules.at(-1)[1];
  assert.match(logoStyles, /width: min\(9rem, 100%\)/);
  assert.match(logoStyles, /height: auto/);
  assert.match(logoStyles, /background: transparent/);
  assert.match(css, /\.sidebar \.brand \.mobile-sidebar-close\s*\{[^}]*position: absolute/);
});

test("startup keeps the library pending until account initialization", () => {
  const startup = source.slice(source.lastIndexOf("\ninitializeBookLanguageOptions();"));
  assert.doesNotMatch(startup, /state\.loading\s*=\s*false/);
  assert.doesNotMatch(startup, /state\.books\s*=\s*loadBooks/);
  assert.match(startup, /restoreRouteFromLocation\(\);[\s\S]*initializeSupabase\(\)/);
  assert.match(source, /loading: true/);
});

test("an empty account stays pending during the session and library requests", async () => {
  let resolveSession;
  let resolveLibrary;
  const sessionRequest = new Promise((resolve) => { resolveSession = resolve; });
  const libraryRequest = new Promise((resolve) => { resolveLibrary = resolve; });
  const context = {
    state: { loading: true, books: [], shelves: [] },
    createSupabaseClient: () => ({
      auth: { getSession: () => sessionRequest, onAuthStateChange() {} },
    }),
    updateAuthButton() {},
    render() {},
    loadFromSupabase: async () => {
      await libraryRequest;
      context.state.loading = false;
    },
    handleLibraryLoadFailure: assert.fail,
    console,
  };
  const functionSource = source.slice(source.indexOf("async function initializeSupabaseOnce()"),
    source.indexOf("\nfunction handleLibraryLoadFailure("));
  runInNewContext(`${functionSource}\nthis.initialize = initializeSupabaseOnce;`, context);
  const initialization = context.initialize();
  assert.equal(context.state.loading, true);
  resolveSession({ data: { session: { user: { id: "new-user" } } } });
  await initialization;
  assert.equal(context.state.loading, true);
  resolveLibrary();
  await libraryRequest;
  assert.equal(context.state.loading, false);
  assert.equal(context.state.books.length, 0);
});

test("card rows show a book loader only while an empty row is pending", () => {
  const context = {
    document: { createElement: () => new Element() },
    window: { addEventListener() {}, requestAnimationFrame() {}, setTimeout() {} },
    createBookLoader: (options) => ({ loader: true, ...options }),
  };
  const functionSource = source.slice(source.indexOf("function createCardRow("),
    source.indexOf("\nfunction ", source.indexOf("function createCardRow(") + 1));
  runInNewContext(`${functionSource}\nthis.createRow = createCardRow;`, context);
  const pending = context.createRow("Recently added", [], { loading: true });
  const pendingRow = pending.children[1].children[0];
  assert.equal(pendingRow.children[0].loader, true);
  assert.equal(pendingRow.children[0].compact, true);
  const empty = context.createRow("Recently added", [], {
    emptyMessage: "Add your first book.",
  });
  const emptyRow = empty.children[1].children[0];
  assert.equal(emptyRow.children[0].textContent, "Add your first book.");
  assert.equal(emptyRow.children[0].loader, undefined);
});

test("Currently reading shows the book loader while pending, then an honest empty or error state", () => {
  const context = {
    document: { createElement: () => new Element() },
    state: { loading: true, loadError: "" },
    createBookLoader: (options) => ({ loader: true, ...options }),
    openDialog() {},
  };
  const functionSource = source.slice(source.indexOf("function createCurrentlyReadingHomeSection("),
    source.indexOf("\nfunction createFeaturedReadingCard("));
  runInNewContext(`${functionSource}\nthis.createSection = createCurrentlyReadingHomeSection;`, context);
  const pending = context.createSection([], []);
  assert.equal(pending.children[1].loader, true);
  assert.equal(pending.children[1].compact, true);
  assert.equal(pending.children.length, 2);

  context.state.loading = false;
  const empty = context.createSection([], []);
  assert.match(empty.children[1].textContent, /Choose one from your library/);
  assert.equal(empty.children[2].textContent, "＋ Add a book");
  assert.ok(empty.children.every((child) => !child.loader));

  context.state.loadError = "Your library could not be loaded.";
  const failed = context.createSection([], []);
  assert.equal(failed.children[1].textContent, context.state.loadError);
  assert.equal(failed.children.length, 2);
});

test("home rows wait for the library before reporting an empty author row", () => {
  const rows = [];
  const context = {
    document: {
      getElementById: () => new Element(),
      createElement: () => new Element(),
    },
    state: { view: "home", loading: true, catalogLoading: false, loadError: "", catalogError: "" },
    getLibraryBooks: () => [],
    ensureHomeRecommendations() {},
    ensureGenreCatalogs() {},
    getBookRecommendations: () => [],
    allGenres: [],
    homeRowBookCount: 15,
    genreCatalogPending: 0,
    createCurrentlyReadingHomeSection: () => new Element(),
    createHomeHero: () => new Element(),
    createCardRow: (title, cards, options) => {
      rows.push({ title, cards, options });
      return { dataset: {} };
    },
    buildSuggestedShelves: () => [],
    openDialog() {},
    showToast: assert.fail,
    console,
  };
  const functionSource = source.slice(source.indexOf("function renderBooks()"),
    source.indexOf("\nfunction createHomeHero()"));
  runInNewContext(`${functionSource}\nthis.renderBooks = renderBooks;`, context);
  context.renderBooks();
  assert.equal(rows.find((row) => row.title === "Recently added").options.loading, true);
  assert.equal(rows.find((row) => row.title === "More by authors you own").options.loading, true);
  context.state.loading = false;
  rows.length = 0;
  context.renderBooks();
  const authors = rows.find((row) => row.title === "More by authors you own");
  assert.equal(authors.options.loading, false);
  assert.match(authors.options.emptyMessage, /Add books to your library/);
  assert.equal(rows.find((row) => row.title === "Recently added").options.loading, false);
});

test("book loader renders immediately and rotates covers after bounce iterations", async () => {
  const classics = [{ title: "First" }, { title: "Second" }];
  const context = {
    document: { createElement: () => new Element() },
    loaderClassics: classics,
    loaderPhrases: ["Dusting shelves", "Flipping pages"],
    shuffleBooks: (books) => books.slice(),
    createBookCover: (book, className) => ({ book, className }),
  };
  const functionSource = source.slice(source.indexOf("function createBookLoader("),
    source.indexOf("\nfunction setBookProfileLoadingStatus("));
  runInNewContext(`${functionSource}\nthis.createLoader = createBookLoader;`, context);
  const loader = context.createLoader({ compact: true });
  assert.equal(loader.className, "book-loader book-loader-compact");
  assert.equal(loader.attributes.role, "status");
  const slot = loader.children[0].children[0];
  assert.equal(slot.children[0].book, classics[1]);
  slot.events.animationiteration();
  assert.equal(slot.children[0].book, classics[0]);
  assert.equal(slot.children[0].className, "book-loader-art");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /animation: book-loader-bounce 2\.7s linear infinite/);
  assert.match(css, /@keyframes book-loader-bounce\s*\{/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.book-loader-slot \{ animation: none; \}/);
});
