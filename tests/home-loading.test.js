import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("the sidebar uses the transparent bookmark artwork and precaches it", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /url\("\/assets\/Elegant%20Brown%20Leather%20Bookmark%20with%20Tassel\.png"\)/);
  const worker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /"\/assets\/Elegant%20Brown%20Leather%20Bookmark%20with%20Tassel\.png"/);
  const image = await readFile(new URL("../assets/Elegant%20Brown%20Leather%20Bookmark%20with%20Tassel.png", import.meta.url));
  assert.equal(image.readUInt32BE(16), 819);
  assert.equal(image.readUInt32BE(20), 1920);
});

test("sidebar uses the accessible logo artwork and precaches it", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const sidebar = html.slice(html.indexOf('<aside id="sidebar"'), html.indexOf("</aside>"));
  assert.match(sidebar, /<img class="sidebar-logo"[^>]*alt="Librito Digital Home Library"/);
  assert.doesNotMatch(sidebar, /<h2>Librito<\/h2>|<p>Digital Home Library<\/p>/);
  const image = await readFile(new URL("../assets/Librito%20Digital%20Home%20Library%20Logo.png", import.meta.url));
  assert.equal(image.readUInt32BE(16), 1983);
  assert.equal(image.readUInt32BE(20), 793);
  const worker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /"\/assets\/Librito%20Digital%20Home%20Library%20Logo\.png"/);
  assert.match(sidebar, /id="closeLibraryBtn"[\s\S]*class="sidebar-content"[\s\S]*class="sidebar-nav"[\s\S]*id="shelfList"/);
});

test("sidebar content flows naturally and scrolls on short screens", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const content = css.match(/\.sidebar-content\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(content, /position: absolute|inset:/);
  assert.match(content, /min-height: 0/);
  assert.match(content, /flex: 1/);
  assert.match(content, /overflow-y: auto/);
  assert.match(content, /overscroll-behavior: contain/);
  assert.match(css, /\.sidebar \.sidebar-library\s*\{[^}]*flex: 1 0 auto/);
  assert.match(css, /\.sidebar \.sidebar-nav\s*\{[^}]*flex: 0 0 auto/);
  assert.match(css, /\.sidebar \.sidebar-content \.shelf-list\s*\{[^}]*overflow: visible/);
  assert.match(css, /\.sidebar \.mobile-sidebar-close\s*\{[^}]*position: absolute/);
  assert.match(css, /\.sidebar\.is-open\s*\{[^}]*display: flex/);
});

test("sidebar provides room for readable navigation and shelf text", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns: clamp\(13\.5rem, 15vw, 15rem\) minmax\(0, 1fr\)/);
  assert.match(css, /\.sidebar button\s*\{[^}]*font-family: inherit/);
  assert.match(css, /\.sidebar \.nav-pill,\s*\.sidebar \.shelf-item-copy strong,\s*\.sidebar \.sidebar-empty\s*\{\s*font-size: 1rem/);
  assert.match(css, /\.sidebar-library-nav \.nav-pill\s*\{[^}]*font-size: 1rem/);
  assert.match(css, /\.sidebar-shelf-heading h2\s*\{[^}]*font-size: 0\.9rem !important/);
  assert.match(css, /\.shelf-item-count\s*\{[^}]*font-size: 0\.95rem/);
  const shelfNameRules = [...css.matchAll(/\.sidebar \.shelf-item-copy strong\s*\{([^}]+)\}/g)];
  assert.doesNotMatch(shelfNameRules.at(-1)[1], /font-size:/);
});

test("slim sidebar keeps branding restrained and shelf counts within the content", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.sidebar-logo\s*\{[^}]*width: 100%[^}]*height: auto[^}]*object-fit: contain/);
  assert.match(css, /\.sidebar \.nav-pill,\s*\.sidebar \.shelf-item-copy strong,\s*\.sidebar \.sidebar-empty\s*\{\s*font-size: 0\.9rem/);
  assert.match(css, /\.sidebar \.shelf-item-copy\s*\{[^}]*min-width: 0[^}]*flex: 1/);
  assert.match(css, /\.sidebar \.shelf-item-count\s*\{[^}]*flex-shrink: 0/);
  assert.match(css, /\.sidebar\s*\{[^}]*position: fixed[^}]*width: min\(15rem, 86vw\)/);
});

test("sidebar shelf covers use portrait book proportions", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.sidebar \.shelf-thumbnail:not\(\.status-shelf-thumbnail\)\s*\{[^}]*width: 2\.2rem[^}]*height: 3\.05rem[^}]*aspect-ratio: 0\.72/);
  assert.match(css, /\.shelf-thumb-art\s*\{[^}]*width: 100%[^}]*height: 100%/);
  assert.match(css, /\.book-cover-art img\s*\{[^}]*object-fit: cover/);
});

test("mobile bookmark extends beyond both screen edges with the tassel below the viewport", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const sidebar = [...css.matchAll(/\.sidebar\s*\{([^}]+)\}/g)].at(-1)[1];
  assert.match(sidebar, /--sidebar-height: calc\(\(100dvh \+ 0\.75rem\) \/ 0\.84\)/);
  assert.match(sidebar, /top: -0\.75rem/);
  assert.match(sidebar, /bottom: auto/);
  assert.match(sidebar, /height: var\(--sidebar-height\)/);
  assert.match(sidebar, /padding-top: max\(calc\(5\.5rem \+ env\(safe-area-inset-top\)\), calc\(var\(--sidebar-height\) \* 0\.085\)\)/);
  assert.match(sidebar, /padding-bottom: calc\(var\(--sidebar-height\) \* 0\.26\)/);
  assert.match(css, /\.sidebar \.mobile-sidebar-close\s*\{[^}]*top: max\(2\.75rem, calc\(env\(safe-area-inset-top\) \+ 2rem\)\)[^}]*right: 2\.25rem/);
});

test("mobile close button is an understated, keyboard-accessible golden medallion", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="closeLibraryBtn"[^>]*type="button"[^>]*aria-label="Close library">\s*<img class="mobile-sidebar-close-medallion" src="\/assets\/Ornate%20Golden%20X%20Medallion\.png" alt="" aria-hidden="true"/);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.sidebar \.mobile-sidebar-close\s*\{[^}]*width: 2\.75rem[^}]*height: 2\.75rem[^}]*border: 0[^}]*background: transparent[^}]*opacity: 0\.82/);
  assert.match(css, /\.sidebar \.mobile-sidebar-close-medallion\s*\{[^}]*width: 2\.5rem/);
  assert.match(css, /\.sidebar \.mobile-sidebar-close:focus-visible\s*\{[^}]*outline: 2px solid #ffe4b2/);
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /"\/assets\/Ornate%20Golden%20X%20Medallion\.png"/);
});

test("sidebar artwork replaces CSS ornaments and reserves room for the eyelet and tassel", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const sidebarRules = [...css.matchAll(/\.sidebar\s*\{([^}]+)\}/g)];
  const bookmark = sidebarRules.find((rule) => rule[1].includes("Elegant%20Brown"));
  assert.match(bookmark[1], /transparent url/);
  assert.match(bookmark[1], /250% 100% no-repeat/);
  assert.match(bookmark[1], /padding: calc\(var\(--sidebar-height, calc\(100dvh - 2rem\)\) \* 0\.085\) 1\.75rem calc\(var\(--sidebar-height, calc\(100dvh - 2rem\)\) \* 0\.28\)/);
  assert.match(bookmark[1], /clip-path: none/);
  assert.doesNotMatch(css, /\.sidebar::(?:before|after)/);
  assert.match(sidebarRules.at(-1)[1], /position: fixed/);
  assert.match(css, /\.sidebar \.nav-pill\.active\s*\{[^}]*#df8052/);
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /sidebar-ornament/);
  assert.match(css, /\.sidebar-content\s*\{[^}]*overflow-y: auto/);
  assert.match(css, /\.sidebar\.is-open\s*\{[^}]*display: flex/);
  assert.match(css, /--sidebar-height: calc\(100dvh \+ 1\.25rem\);[\s\S]*top: -0\.75rem;[\s\S]*height: var\(--sidebar-height\);[\s\S]*margin: -0\.75rem 0 0;/);
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
    getReadingStatusLabel: (status) => status === "reading" ? "Currently Reading" : "",
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
test("Your Library has a distinct open-book icon instead of the Home icon", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.library-heading-btn::before\s*\{[^}]*background: url\("data:image\/svg\+xml/);
});
