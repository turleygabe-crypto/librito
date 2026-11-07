import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { booksWithCoversFirst } from "../lib/book-ordering.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");

test("home hero uses cursive only for English browser languages", () => {
  const heroSource = source.slice(source.indexOf("function createHomeHero()"), source.indexOf("\nfunction shuffleBooks("));
  for (const [language, expected] of [["en", true], ["en-US", true], ["en-GB", true], ["fr-FR", false], ["ja-JP", false], ["de-DE", false]]) {
    let cursive;
    const context = {
      Element, navigator: { language },
      document: { createElement: () => {
        const el = new Element();
        el.classList = { toggle: (name, value) => { assert.equal(name, "hero-english"); cursive = value; } };
        return el;
      } },
    };
    const hero = runInNewContext(`${heroSource}\ncreateHomeHero();`, context);
    assert.equal(cursive, expected, language);
    assert.equal(hero.children[0].children.length, 2);
    assert.equal(hero.children[0].children[0].textContent, "Your next favorite book is waiting.");
    assert.equal(hero.children[0].children[1].textContent, "Track your library, discover new reads, and keep your love for books close.");
    assert.doesNotMatch(heroSource, /Explore recommendations|createElement\("button"\)/);
  }
});

class Element {
  children = [];
  attributes = {};
  events = {};
  style = {};
  isConnected = true;
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, handler) { this.events[name] = handler; }
}

test("global ISBN scan has a separate quick lookup flow that opens the scanned book profile", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const desktopSearchRules = css.slice(css.lastIndexOf("@media (min-width: 900px)"), css.lastIndexOf("@media (max-width: 700px)"));
  const searchCluster = html.slice(html.indexOf('<div class="global-search-cluster">'), html.indexOf("</div>", html.indexOf('<div class="global-search-cluster">')));
  const searchForm = html.slice(html.indexOf('<form id="globalSearchForm"'), html.indexOf("</form>", html.indexOf('<form id="globalSearchForm"')));
  assert.match(searchCluster, /id="globalIsbnScanBtn"[^>]*aria-label="Scan ISBN barcode"[^>]*title="Scan ISBN barcode"/);
  assert.ok(searchCluster.indexOf('id="globalIsbnScanBtn"') < searchCluster.indexOf('id="globalSearchForm"'));
  assert.doesNotMatch(html, /globalSearchLanguage|global-language-control/);
  assert.doesNotMatch(source, /globalSearchLanguage|buildGlobalSearchLanguageMenu/);
  assert.match(html, /id="quickScanOverlay"[\s\S]*?id="quickScanVideo"[\s\S]*?id="quickScanForm"[\s\S]*?id="quickScanIsbnInput"/);
  assert.match(source, /globalIsbnScanBtn\.addEventListener\("click", openQuickScan\)/);
  const openQuickScanSource = source.slice(source.indexOf("function openQuickScan()"), source.indexOf("\nfunction closeQuickScan("));
  assert.doesNotMatch(openQuickScanSource, /quickScanIsbnInput\.focus\(/);
  assert.match(openQuickScanSource, /querySelector\("\.quick-scan-card"\)\.focus\(/);
  assert.match(html, /class="dialog-card quick-scan-card"[^>]*tabindex="-1"/);
  assert.match(source, /function openQuickScan\(\)[\s\S]*?startCameraScan\(\{\s*video: quickScanVideo,\s*status: quickScanStatus,\s*onBarcode: \(value\) => lookupQuickScanBook\(value\)/);
  assert.match(source, /async function lookupQuickScanBook\(isbn\)[\s\S]*?setQuickScanLoading\(true, normalized\);[\s\S]*?openBookProfile\(book\);\s*await waitForBookProfileReady\(\);\s*if \(isCurrent\(\)\) closeQuickScan\(\);[\s\S]*?if \(matchingBook\) \{\s*await openProfile\(matchingBook\)/);
  assert.match(source, /function setQuickScanLoading\([\s\S]*?createBookLoader\(/);
  assert.match(css, /\.quick-scan-card\.is-loading #quickScanVideo, \.quick-scan-card\.is-loading \.quick-scan-form \{ display: none !important; \}/);
  assert.match(source, /quickScanForm\.addEventListener\("submit", \(event\) => \{\s*event\.preventDefault\(\);\s*lookupQuickScanBook\(quickScanIsbnInput\.value\)/);
  assert.match(source, /scanBookOptionBtn\.addEventListener\("click", \(\) => \{\s*startBookLookup\("scan"\);\s*\}\)/);
  assert.match(css, /\.global-search-cluster > \.global-isbn-scan\s*\{/);
  assert.match(css, /grid-template-areas:\s*"menu brand scan account"\s*"search search search search";/);
  assert.match(css, /\.spotify-topbar\s*\{[^}]*padding: 0\.65rem 0 0;[^}]*border: 0;[^}]*border-radius: 0;[^}]*background: transparent;[^}]*box-shadow: none;/);
  assert.match(css, /\.spotify-topbar > \.library-toggle-btn::before\s*\{[^}]*position: absolute;[^}]*top: 50%;[^}]*left: 50%;[^}]*display: block;[^}]*height: 0\.875rem;[^}]*transform: translate\(-50%, -50%\);[^}]*currentColor 0 2px,[^}]*currentColor 6px 8px,[^}]*currentColor 12px 14px/);
  assert.match(css, /\.spotify-topbar > \.library-toggle-btn\s*\{[^}]*box-shadow: 0 2px 4px[^}]*inset 0 1px 0/);
  assert.match(css, /\.global-search-cluster \.global-search\s*\{[^}]*background-image: linear-gradient\(180deg/);
  assert.match(desktopSearchRules, /\.topbar-brand,\s*\.global-search-cluster > \.global-isbn-scan\s*\{\s*display: none;/);
});

test("quick ISBN lookup opens matching library books and metadata-only book profiles", async () => {
  const normalizeSource = source.slice(source.indexOf("function normalizeIsbn("), source.indexOf("\nasync function fetchBookDataByIsbn("));
  const lookupSource = source.slice(source.indexOf("async function lookupQuickScanBook("), source.indexOf("\nfunction openShelfDrawer("));
  const bookData = {
    title: "Found by ISBN",
    authors: [{ name: "A. Reader" }],
    subjects: [{ name: "Fiction" }],
    cover: { large: "https://example.test/cover.jpg" },
    publish_date: "2024",
    number_of_pages: 240,
  };
  const createLookup = (books, data = bookData) => {
    const result = { closed: false, opened: null, loading: [], status: { textContent: "" } };
    const context = {
      state: { books, catalogBooks: [], searchResults: [] },
      quickScanStatus: result.status,
      quickScanLookupId: 0,
      quickScanReturnFocus: null,
      HTMLElement: class {},
      fetchBookDataByIsbn: async () => data,
      stopCameraScan() {},
      setQuickScanLoading: (isLoading) => { result.loading.push(isLoading); },
      waitForBookProfileReady: async () => { result.waited = true; },
      closeQuickScan: () => { result.closed = true; },
      openBookProfile: (book) => { result.opened = book; },
      console,
      showToast() {},
    };
    runInNewContext(`${normalizeSource}\n${lookupSource}\nthis.lookup = lookupQuickScanBook;`, context);
    result.lookup = context.lookup;
    return result;
  };

  const libraryBook = { id: "library-book", isbn: "978-1-2345-6789-0" };
  const libraryLookup = createLookup([libraryBook]);
  await libraryLookup.lookup("9781234567890");
  assert.equal(libraryLookup.closed, true);
  assert.equal(libraryLookup.opened, libraryBook);
  assert.deepEqual(libraryLookup.loading, [true]);
  assert.equal(libraryLookup.waited, true);

  const missingLookup = createLookup([], null);
  await missingLookup.lookup("9781234567890");
  assert.deepEqual(missingLookup.loading, [true, false]);
  assert.equal(missingLookup.opened, null);
  assert.match(missingLookup.status.textContent, /No book found/);

  const metadataLookup = createLookup([]);
  await metadataLookup.lookup("9781234567890");
  assert.equal(metadataLookup.closed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(metadataLookup.opened)), {
    title: "Found by ISBN",
    author: "A. Reader",
    genre: "Fiction",
    isbn: "9781234567890",
    cover_url: "https://example.test/cover.jpg",
    publish_date: "2024",
    page_count: 240,
  });
});

test("the sidebar uses the transparent bookmark artwork and precaches it", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /url\("\/assets\/Elegant%20Botanical%20Green%20Bookmark\.png"\)/);
  const worker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /"\/assets\/Elegant%20Botanical%20Green%20Bookmark\.png"/);
  const image = await readFile(new URL("../assets/Elegant%20Botanical%20Green%20Bookmark.png", import.meta.url));
  assert.equal(image.readUInt32BE(16), 750);
  assert.equal(image.readUInt32BE(20), 2097);
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
  assert.match(sidebar, /id="libraryNavBtn"[^>]*><span>My library<\/span>/);
  assert.match(sidebar, /<nav class="sidebar-wishlist-nav"[^>]*>[\s\S]*id="wishlistNavBtn"[\s\S]*<span>Wish list<\/span>/);
  assert.ok(sidebar.indexOf('class="sidebar-wishlist-nav"') < sidebar.indexOf('class="sidebar-library"'));
});

test("botanical bookmark retains its own border, foliage and tassel without legacy overlays", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /sidebar-gold-details/);
  assert.doesNotMatch(css, /sidebar-gold-details|\.sidebar::after|Elegant%20Brown/);
  assert.match(css, /\.sidebar\s*\{[^}]*--sage-ink: var\(--botanical-ink\)[^}]*--antique-gold: var\(--parchment\)/);
  assert.match(css, /\.sidebar \.sidebar-shelf-heading h2\s*\{[^}]*color: var\(--antique-gold\)/);
  assert.match(css, /\.sidebar \.status-shelf-remove\s*\{[^}]*color: var\(--antique-gold\)/);
  assert.match(css, /\.sidebar \.shelf-item-count\s*\{[^}]*color: var\(--antique-gold\)/);
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
  assert.match(css, /\.sidebar-logo\s*\{[^}]*width: 125%[^}]*max-width: none[^}]*height: auto[^}]*margin-left: -12\.5%[^}]*object-fit: contain/);
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

test("mobile bookmark sits slightly below the top with the tassel below the viewport", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const sidebar = [...css.matchAll(/\.sidebar\s*\{([^}]+)\}/g)].at(-1)[1];
  assert.match(sidebar, /--sidebar-height: calc\(\(100dvh \+ 0\.75rem\) \/ 0\.84\)/);
  assert.match(sidebar, /top: 0\.5rem/);
  assert.match(sidebar, /bottom: auto/);
  assert.match(sidebar, /height: var\(--sidebar-height\)/);
  assert.match(sidebar, /padding-top: max\(calc\(5\.5rem \+ env\(safe-area-inset-top\)\), calc\(var\(--sidebar-height\) \* 0\.085\)\)/);
  assert.match(sidebar, /padding-bottom: calc\(var\(--sidebar-height\) \* 0\.22\)/);
  assert.match(css, /\.sidebar \.mobile-sidebar-close\s*\{[^}]*top: max\(1\.5rem, env\(safe-area-inset-top\)\)[^}]*right: 1\.75rem/);
});

test("mobile close button uses botanical colors and an accessible label", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="closeLibraryBtn"[^>]*type="button"[^>]*aria-label="Close library">\s*<span aria-hidden="true">&times;<\/span>/);
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.sidebar \.mobile-sidebar-close\s*\{[^}]*width: 2rem[^}]*height: 2rem[^}]*background: var\(--botanical-green\)[^}]*color: var\(--parchment\)/);
  assert.match(css, /\.sidebar \.mobile-sidebar-close:focus-visible\s*\{[^}]*outline: 2px solid #ffe4b2/);
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /"\/assets\/Ornate%20Golden%20X%20Medallion\.png"/);
});

test("botanical bookmark layer preserves original artwork without filtering navigation", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const sidebarRules = [...css.matchAll(/\.sidebar\s*\{([^}]+)\}/g)];
  const bookmark = sidebarRules.find((rule) => rule[1].includes("isolation: isolate"));
  const artwork = css.match(/\.sidebar::before\s*\{([^}]+)\}/)[1];
  assert.match(artwork, /Elegant%20Botanical%20Green/);
  assert.match(artwork, /180% 100% no-repeat/);
  assert.doesNotMatch(artwork, /filter:|mask-image:/);
  assert.match(artwork, /pointer-events: none/);
  assert.match(artwork, /z-index: -1/);
  assert.match(bookmark[1], /padding: calc\(var\(--sidebar-height, calc\(100dvh - 2rem\)\) \* 0\.04\) 1\.75rem calc\(var\(--sidebar-height, calc\(100dvh - 2rem\)\) \* 0\.2\)/);
  assert.match(bookmark[1], /clip-path: none/);
  assert.doesNotMatch(bookmark[1], /filter:/);
  assert.match(sidebarRules.at(-1)[1], /position: fixed/);
  assert.match(css, /\.sidebar \.nav-pill\.active\s*\{[^}]*background: var\(--sage-ink\)/);
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /sidebar-ornament/);
  assert.match(css, /\.sidebar-content\s*\{[^}]*overflow-y: auto/);
  assert.match(css, /\.sidebar\.is-open\s*\{[^}]*display: flex/);
  assert.match(css, /--sidebar-height: calc\(100dvh \+ 1\.25rem\);[\s\S]*top: 0\.5rem;[\s\S]*height: var\(--sidebar-height\);[\s\S]*margin: 0\.5rem 0 0;/);
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
    booksWithCoversFirst,
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

function createReadingSection(books, libraryBooks = books) {
  const calls = [];
  const context = {
    booksWithCoversFirst,
    document: { createElement: () => new Element() },
    state: { loading: false, loadError: "" },
    getReadingStatusLabel: () => "Currently Reading",
    createBookCover: (book) => ({ book }),
    openBookProfile: (book) => calls.push(["profile", book]),
    setBookBookmark: (book) => calls.push(["bookmark", book]),
  };
  const functions = source.slice(source.indexOf("function createCurrentlyReadingHomeSection("),
    source.indexOf("\nfunction ", source.indexOf("function createReadingBookCard(") + 1));
  const createSection = runInNewContext(`${functions}\ncreateCurrentlyReadingHomeSection`, context);
  return { section: createSection(books, libraryBooks), calls };
}

test("home reading rows show covers first, including before the start-reading preview limit", () => {
  const books = Array.from({ length: 8 }, (_, index) => ({
    title: `Book ${index}`, cover_i: index >= 6 ? index : null,
  }));
  const { section } = createReadingSection(books);
  assert.deepEqual(section.children[1].children.map((card) => card.children[0].children[0].book.title),
    ["Book 6", "Book 7", "Book 0", "Book 1", "Book 2", "Book 3", "Book 4", "Book 5"]);
  const { section: emptyReading } = createReadingSection([], books);
  assert.deepEqual(emptyReading.children[2].children.map((card) => card.children[0].children[0].book.title),
    ["Book 6", "Book 7", "Book 0", "Book 1", "Book 2", "Book 3"]);
});

test("every currently reading book has a cover-first card with progress and its own bookmark action", () => {
  const books = Array.from({ length: 8 }, (_, index) => ({
    title: `Book ${index}`, author: `Author ${index}`, reading_status: "reading",
    page_count: 100, current_page: index * 10,
  }));
  const { section, calls } = createReadingSection(books);
  const row = section.children[1];
  assert.equal(row.className, "card-row reading-home-row");
  assert.equal(row.children.length, books.length);
  assert.equal(row.attributes["aria-label"], "Currently reading books");
  assert.equal(row.tabIndex, 0);
  row.children.forEach((card, index) => {
    assert.equal(card.className, "reading-feature-card");
    const [cover, details] = card.children;
    assert.equal(cover.children[0].book, books[index]);
    const [title, author, progress, bookmark] = details.children;
    assert.equal(title.textContent, books[index].title);
    assert.equal(author.textContent, books[index].author);
    assert.equal(progress.children[0].textContent, `Page ${index * 10} of 100`);
    assert.equal(progress.children[1].textContent, `${index * 10}%`);
    assert.equal(progress.children[2].attributes["aria-valuenow"], String(index * 10));
    assert.equal(progress.children[2].children[0].style.width, `${index * 10}%`);
    assert.equal(bookmark.textContent, index ? "Move bookmark" : "Set bookmark");
    cover.events.click();
    title.events.click();
    bookmark.events.click();
    assert.deepEqual(calls.slice(-3),
      [["profile", books[index]], ["profile", books[index]], ["bookmark", books[index]]]);
  });
  const scrolls = [];
  row.scrollBy = (options) => scrolls.push({ ...options });
  let prevented = 0;
  for (const key of ["ArrowRight", "ArrowLeft", "Enter"]) {
    row.events.keydown({ key, preventDefault() { prevented += 1; } });
  }
  assert.equal(prevented, 2);
  assert.deepEqual(scrolls, [
    { left: 240, behavior: "smooth" }, { left: -240, behavior: "smooth" },
  ]);
});

test("a single reading book uses the same row and missing page counts remain supported", () => {
  const book = { title: "Single book", reading_status: "reading", current_page: 12 };
  const { section } = createReadingSection([book]);
  const row = section.children[1];
  assert.equal(row.className, "card-row reading-home-row");
  assert.equal(row.children.length, 1);
  const progress = row.children[0].children[1].children[2];
  assert.equal(progress.children[0].textContent, "Page 12");
  assert.equal(progress.children[1].textContent, "");
});

test("Currently reading still offers ordinary library cards when no book has been started", () => {
  const books = [{ title: "Next book", reading_status: "next_read" }];
  const { section, calls } = createReadingSection([], books);
  assert.match(section.children[1].textContent, /Choose one from your library/);
  const card = section.children[2].children[0];
  assert.equal(card.className, "media-card book-card");
  card.children[0].events.click();
  assert.deepEqual(calls, [["profile", books[0]]]);
});

test("reading cards stack full-width covers above details in a slim, scrollable row", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.reading-feature-card\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)[^}]*align-content: start/);
  assert.match(css, /\.reading-feature-cover\s*\{[^}]*width: 100%/);
  assert.match(css, /\.reading-feature-title\s*\{[^}]*white-space: nowrap/);
  assert.match(css, /\.card-row\.reading-home-row\s*\{[^}]*grid-auto-columns: minmax\(8\.7rem, 10\.5rem\)/);
  assert.doesNotMatch(css, /grid-auto-columns: minmax\(15rem, 85vw\)/);
  assert.doesNotMatch(css, /\.reading-home-layout/);
});

test("home rows wait for the library before reporting an empty author row", () => {
  const rows = [];
  const context = {
    booksWithCoversFirst,
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
  const books = Array.from({ length: 4 }, (_, index) => ({
    title: `Recent ${index}`, added: `202${4 - index}`, cover_i: index >= 2 ? index : null,
  }));
  context.getLibraryBooks = () => books;
  context.getBookKey = (book) => book.title;
  context.homeRowBookCount = 2;
  rows.length = 0;
  context.renderBooks();
  assert.deepEqual(rows.find((row) => row.title === "Recently added").cards.map(({ book }) => book.title),
    ["Recent 2", "Recent 3"]);
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
  for (const options of [{}, { compact: true }, { mini: true }]) {
    const loader = context.createLoader(options);
    assert.equal(loader.className, `book-loader${options.compact ? " book-loader-compact" : ""}${options.mini ? " book-loader-mini" : ""}`);
    assert.equal(loader.attributes.role, "status");
    const slot = loader.children[0].children[0];
    assert.equal(slot.children[0].book, classics[1]);
    const firstMessage = loader.children[1].textContent;
    slot.events.animationiteration();
    assert.equal(slot.children[0].book, classics[0]);
    assert.equal(slot.children[0].className, "book-loader-art");
    if (options.mini) assert.equal(loader.children[1].textContent, firstMessage);
    else assert.notEqual(loader.children[1].textContent, firstMessage);
    slot.events.animationiteration();
    assert.equal(slot.children[0].book, classics[1]);
    loader.isConnected = false;
    slot.events.animationiteration();
    assert.equal(slot.children[0].book, classics[1]);
  }
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /animation: book-loader-bounce 2\.7s linear infinite/);
  assert.match(css, /@keyframes book-loader-bounce\s*\{/);
});

test("loading books keep bouncing and rotating under reduced motion without changing other animations", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const reducedMotionBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)];
  assert.equal(reducedMotionBlocks.length, 2);
  const globalRule = reducedMotionBlocks[0][1];
  assert.match(globalRule, /\*,\s*\*::before,\s*\*::after/);
  assert.match(globalRule, /animation-duration: 0\.01ms !important/);
  assert.match(globalRule, /animation-iteration-count: 1 !important/);
  const loaderRule = reducedMotionBlocks[1][1];
  assert.match(loaderRule, /\.book-loader-slot\s*\{\s*animation-duration: 2\.7s !important;\s*animation-iteration-count: infinite !important;\s*\}/);
  assert.doesNotMatch(loaderRule, /animation: none|animation-name:/);
  assert.match(css, /\.book-loader-mini \.book-loader-slot\s*\{[^}]*animation-name: book-loader-bounce-mini/);
});
test("Your Library has a distinct open-book icon instead of the Home icon", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.library-heading-btn::before\s*\{[^}]*background: url\("data:image\/svg\+xml/);
});

test("text fields never auto-focus on touch devices so the keyboard stays closed", () => {
  const helper = source.slice(source.indexOf("function focusField("), source.indexOf("\nfunction createBookLoader("));
  const run = (coarse, dialog) => {
    const calls = [];
    const field = {
      focus: () => calls.push("field"),
      closest: () => dialog,
    };
    const context = { window: { matchMedia: () => ({ matches: coarse }) } };
    runInNewContext(`${helper}\nthis.focusField = focusField;`, context);
    context.focusField(field);
    return calls;
  };
  const dialogCalls = [];
  const dialog = {
    attrs: {},
    hasAttribute(name) { return name in this.attrs; },
    setAttribute(name, value) { this.attrs[name] = value; },
    focus: () => dialogCalls.push("dialog"),
  };
  assert.deepEqual(run(false, dialog), ["field"]);
  assert.deepEqual(run(true, dialog), []);
  assert.deepEqual(dialogCalls, ["dialog"]);
  assert.equal(dialog.attrs.tabindex, "-1");
  assert.doesNotMatch(source, /(authForm\.elements\.email|newShelfInput|lookupTitleInput|bookForm\.elements\.title|costInput|inputNode)\.focus\(/);
  assert.doesNotMatch(source, /autofocus/);
});
