import { createSupabaseClient } from "./lib/supabase-client.js";

const storageKey = "librito-library-v1";
const openLibraryLanguages = [
  ["eng", "English"],
  ["spa", "Spanish"],
  ["fre", "French"],
  ["ger", "German"],
  ["ita", "Italian"],
  ["por", "Portuguese"],
  ["dut", "Dutch"],
  ["jpn", "Japanese"],
  ["chi", "Chinese"],
  ["kor", "Korean"],
  ["rus", "Russian"],
  ["ara", "Arabic"],
  ["hin", "Hindi"],
  ["swe", "Swedish"],
  ["ben", "Bengali"],
  ["cze", "Czech"],
  ["dan", "Danish"],
  ["fin", "Finnish"],
  ["gre", "Greek"],
  ["heb", "Hebrew"],
  ["hun", "Hungarian"],
  ["ind", "Indonesian"],
  ["nor", "Norwegian"],
  ["pol", "Polish"],
  ["rum", "Romanian"],
  ["tha", "Thai"],
  ["tur", "Turkish"],
  ["ukr", "Ukrainian"],
  ["vie", "Vietnamese"],
];
const browserLanguageCodes = {
  ar: "ara",
  bn: "ben",
  cs: "cze",
  da: "dan",
  de: "ger",
  en: "eng",
  es: "spa",
  fi: "fin",
  fr: "fre",
  el: "gre",
  hi: "hin",
  he: "heb",
  hu: "hun",
  id: "ind",
  it: "ita",
  ja: "jpn",
  ko: "kor",
  nl: "dut",
  no: "nor",
  pl: "pol",
  pt: "por",
  ro: "rum",
  ru: "rus",
  sv: "swe",
  th: "tha",
  tr: "tur",
  uk: "ukr",
  vi: "vie",
  zh: "chi",
};
const defaultBooks = [
  {
    id: crypto.randomUUID(),
    title: "The Midnight Library",
    author: "Matt Haig",
    genre: "Fiction",
    isbn: "9780525559474",
    shelf: "New Arrivals",
    cost: 18.99,
    added: "2026-07-11",
    notes: "A warm, reflective pick for rainy evenings.",
  },
  {
    id: crypto.randomUUID(),
    title: "Piranesi",
    author: "Susanna Clarke",
    genre: "Fiction",
    isbn: "9781635575637",
    shelf: "New Arrivals",
    cost: 14.5,
    added: "2026-07-08",
    notes: "Dreamlike architecture and lingering wonder.",
  },
  {
    id: crypto.randomUUID(),
    title: "Braiding Sweetgrass",
    author: "Robin Wall Kimmerer",
    genre: "Nonfiction",
    isbn: "9781579654672",
    shelf: "New Arrivals",
    cost: 22.0,
    added: "2026-06-27",
    notes: "A grounding gift for slow afternoons.",
  },
  {
    id: crypto.randomUUID(),
    title: "The House of Doors",
    author: "Tan Twan Eng",
    genre: "Fiction",
    isbn: "9780593540465",
    shelf: "Cozy Recs",
    cost: 24.0,
    added: "2026-06-24",
    notes: "Atmospheric and lush for slower evenings.",
  },
  {
    id: crypto.randomUUID(),
    title: "Anxious People",
    author: "Fredrik Backman",
    genre: "Fiction",
    isbn: "9781501160837",
    shelf: "Cozy Recs",
    cost: 16.5,
    added: "2026-06-21",
    notes: "Witty, warm, and quietly comforting.",
  },
  {
    id: crypto.randomUUID(),
    title: "The Light We Carry",
    author: "Michelle Obama",
    genre: "Nonfiction",
    isbn: "9780593237465",
    shelf: "Cozy Recs",
    cost: 20.0,
    added: "2026-06-14",
    notes: "Thoughtful notes for reflective mornings.",
  },
  {
    id: crypto.randomUUID(),
    title: "Educated",
    author: "Tara Westover",
    genre: "Nonfiction",
    isbn: "9780399590504",
    shelf: "Staff Picks",
    cost: 19.75,
    added: "2026-06-11",
    notes: "A memoir that lingers long after the final page.",
  },
  {
    id: crypto.randomUUID(),
    title: "Tomorrow, and Tomorrow, and Tomorrow",
    author: "Gabrielle Zevin",
    genre: "Fiction",
    isbn: "9780593321201",
    shelf: "Staff Picks",
    cost: 18.25,
    added: "2026-06-05",
    notes: "A crowd favorite for story lovers.",
  },
  {
    id: crypto.randomUUID(),
    title: "The Vanishing Half",
    author: "Brit Bennett",
    genre: "Fiction",
    isbn: "9780525536291",
    shelf: "Staff Picks",
    cost: 17.5,
    added: "2026-05-28",
    notes: "A beautifully layered novel for book club.",
  },
];

const defaultBookMetadata = Object.fromEntries(defaultBooks.map((book) => [book.title, {
  genre: book.genre,
  isbn: book.isbn,
}]));

const state = {
  books: [],
  shelves: [],
  session: null,
  profile: null,
  supabase: null,
  view: "home",
  currentShelf: "",
  currentBook: null,
  searchQuery: "",
  searchResults: null,
  searchMessage: "",
  searchLoading: false,
  loading: true,
  loadError: "",
  shelfFilter: "All",
  dismissedRecommendations: new Set(),
  shelfSort: { key: "added", direction: "desc" },
};

const discoveryBooks = [
  { title: "The Humans", author: "Matt Haig", genre: "Fiction", isbn: "9781782115083", pages: 304 },
  { title: "How to Stop Time", author: "Matt Haig", genre: "Fiction", isbn: "9781782118626", pages: 336 },
  { title: "The Ten Thousand Doors of January", author: "Alix E. Harrow", genre: "Fantasy", isbn: "9780316421973", pages: 374 },
  { title: "The Invisible Life of Addie LaRue", author: "V. E. Schwab", genre: "Fantasy", isbn: "9780765387561", pages: 448 },
  { title: "The Thursday Murder Club", author: "Richard Osman", genre: "Mystery", isbn: "9781984880963", pages: 368 },
  { title: "The Book of Delights", author: "Ross Gay", genre: "Essays", isbn: "9781616207922", pages: 288 },
  { title: "The Anthropocene Reviewed", author: "John Green", genre: "Essays", isbn: "9780525555216", pages: 304 },
  { title: "The Art of Stillness", author: "Pico Iyer", genre: "Nonfiction", isbn: "9781476784724", pages: 96 },
];

const bookForm = document.getElementById("bookForm");
const dialogOverlay = document.getElementById("dialogOverlay");
const openModalBtn = document.getElementById("openModalBtn");
const closeDialogBtn = document.getElementById("closeDialogBtn");
const bookEntryChoice = document.getElementById("bookEntryChoice");
const lookupBookOptionBtn = document.getElementById("lookupBookOptionBtn");
const manualBookOptionBtn = document.getElementById("manualBookOptionBtn");
const bookLookupFlow = document.getElementById("bookLookupFlow");
const lookupBackBtn = document.getElementById("lookupBackBtn");
const manualEntryFromLookupBtn = document.getElementById("manualEntryFromLookupBtn");
const bookDetailsPanel = document.getElementById("bookDetailsPanel");
const bookDetailsBackBtn = document.getElementById("bookDetailsBackBtn");
const saveBookBtn = document.getElementById("saveBookBtn");
const toast = document.getElementById("toast");
const lookupSearchTab = document.getElementById("lookupSearchTab");
const lookupScanTab = document.getElementById("lookupScanTab");
const titleLookupPanel = document.getElementById("titleLookupPanel");
const isbnLookupPanel = document.getElementById("isbnLookupPanel");
const lookupTitleInput = document.getElementById("lookupTitleInput");
const lookupAuthorInput = document.getElementById("lookupAuthorInput");
const lookupLanguage = document.getElementById("lookupLanguage");
const lookupTitleBtn = document.getElementById("lookupTitleBtn");
const titleLookupResults = document.getElementById("titleLookupResults");
const selectedBookConfirmation = document.getElementById("selectedBookConfirmation");
const scanIsbnBtn = document.getElementById("scanIsbnBtn");
const lookupIsbnBtn = document.getElementById("lookupIsbnBtn");
const isbnInput = document.getElementById("isbnInput");
const scannerVideo = document.getElementById("scannerVideo");
const scanStatus = document.getElementById("scanStatus");
const authButton = document.getElementById("authButton");
const sidebarAuthCopy = document.getElementById("sidebarAuthCopy");
const authOverlay = document.getElementById("authOverlay");
const closeAuthBtn = document.getElementById("closeAuthBtn");
const authForm = document.getElementById("authForm");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const googleAuthOptions = document.getElementById("googleAuthOptions");
const googleAuthBtn = document.getElementById("googleAuthBtn");
const toggleAuthModeBtn = document.getElementById("toggleAuthModeBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const authTitle = document.getElementById("authTitle");
const authCopy = document.getElementById("authCopy");
const displayNameInput = document.getElementById("displayNameInput");
const newShelfInput = document.getElementById("newShelfInput");
const shelfColorInput = document.getElementById("shelfColorInput");
const shelfDrawerOverlay = document.getElementById("shelfDrawerOverlay");
const closeShelfDrawerBtn = document.getElementById("closeShelfDrawerBtn");
const globalSearchForm = document.getElementById("globalSearchForm");
const globalSearchInput = document.getElementById("globalSearchInput");
const sidebar = document.getElementById("sidebar");
const libraryToggleBtn = document.getElementById("libraryToggleBtn");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const shelfForm = document.getElementById("shelfForm");
const bookProfileOverlay = document.getElementById("bookProfileOverlay");
const closeBookProfileBtn = document.getElementById("closeBookProfileBtn");
const bookProfileContent = document.getElementById("bookProfileContent");
let cameraStream = null;
let barcodeLoopTimer = null;
let readingCoverCycleTimer = null;
let readingCoverCycleBooks = [];
let readingCoverCycleIndex = 0;
let readingCoverCycleKey = "";
let selectedBook = null;
let titleSearchResults = [];
let selectedTitleResult = null;
let bookEntryMode = "";
let dialogReturnFocus = null;
let shelfReturnFocus = null;
let authReturnFocus = null;
let bookProfileReturnFocus = null;
const oauthRedirectKey = "librito-oauth-redirect";
let authPrompted = sessionStorage.getItem(oauthRedirectKey) === "true";
let authMode = "signin";
let supabaseInitialization = null;

function getAuthRedirectUrl() {
  const { hostname, origin, pathname } = window.location;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  return `${isLocalhost ? origin : "https://librito.casa"}${pathname}`;
}

function createRouteHash(view, values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return `#/${view}${query ? `?${query}` : ""}`;
}

function navigateTo(view, values = {}) {
  const hash = createRouteHash(view, values);
  if (window.location.hash !== hash) {
    window.history.pushState(null, "", hash);
  }
  restoreRouteFromLocation();
}

function findBookForRoute(params) {
  const id = params.get("id");
  const title = params.get("title");
  const author = params.get("author");
  const books = [
    ...state.books,
    ...(state.searchResults || []),
    ...discoveryBooks,
  ];
  return books.find((book) => id
    ? book.id === id
    : book.title === title && book.author === author);
}

function renderBookRoute(params = new URLSearchParams(window.location.hash.split("?")[1] || "")) {
  state.currentBook = findBookForRoute(params) || null;
  if (state.currentBook) {
    renderBookPage(state.currentBook);
    return;
  }
  const page = showPage("book");
  page.append(createPageHeader("Book · Your library", state.loading ? "Loading book…" : "Book not found"));
}

function restoreRouteFromLocation() {
  const [path, query = ""] = window.location.hash.slice(1).split("?");
  const params = new URLSearchParams(query);
  switch (path) {
    case "/shelves":
      showShelvesPage();
      break;
    case "/shelf":
      showShelfPage(params.get("name") || "");
      break;
    case "/search":
      runNaturalSearch(params.get("q") || "", { updateHistory: false });
      break;
    case "/stats":
      showStatsPage();
      break;
    case "/book":
      state.view = "book";
      renderBookRoute(params);
      break;
    case "/purchase":
      showPurchasePage(params);
      break;
    default:
      showHomePage();
  }
}

function loadBooks() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      return JSON.parse(saved).map((book) => ({ ...defaultBookMetadata[book.title], ...book }));
    }
  } catch (error) {
    console.warn("Could not read saved library", error);
  }
  return defaultBooks;
}

function getLibraryBooks() {
  return state.books.filter((book) => !book.disposition);
}

function saveBooks() {
  if (!state.session) localStorage.setItem(storageKey, JSON.stringify(state.books));
  render();
}

async function toggleBookLike(book) {
  const current = state.books.find((item) => getBookKey(item) === getBookKey(book));
  if (!current) {
    showToast("Only books in your library can be liked.");
    return;
  }
  const nextLiked = !current.liked;
  if (state.supabase && state.session) {
    const query = state.supabase.from("liked_books");
    const result = nextLiked
      ? await query.insert({ user_id: state.session.user.id, book_id: current.id })
      : await query.delete().eq("user_id", state.session.user.id).eq("book_id", current.id);
    if (result.error) {
      console.error(result.error);
      showToast("Could not update liked books. Run the latest Supabase schema first.");
      return;
    }
  }
  current.liked = nextLiked;
  if (!state.session) localStorage.setItem(storageKey, JSON.stringify(state.books));
  render();
}

function getMissingBooksColumn(error) {
  const message = error && typeof error.message === "string" ? error.message : "";
  const match = message.match(/'([^']+)' column of 'books'/i);
  return match ? match[1] : null;
}

function getSchemaUpgradeMessage(error) {
  if (!error) return "";
  return getMissingBooksColumn(error)
    ? "Your Supabase schema is out of date. Run the latest migration before updating books."
    : "";
}

async function runBookSchemaRetry(operation, payload) {
  let currentPayload = { ...payload };
  while (true) {
    const result = await operation(currentPayload);
    if (!result.error) return result;
    const missingColumn = getMissingBooksColumn(result.error);
    if (!missingColumn || !(missingColumn in currentPayload)) return result;
    delete currentPayload[missingColumn];
    if (!Object.keys(currentPayload).length) return result;
  }
}

async function updateBookFields(book, fields) {
  if (state.supabase && state.session) {
    const result = await runBookSchemaRetry(async (candidate) => {
      const { error } = await state.supabase.from("books")
        .update(candidate)
        .eq("id", book.id)
        .eq("user_id", state.session.user.id);
      return { error };
    }, fields);

    if (result.error) {
      console.error(result.error);
      showToast(getSchemaUpgradeMessage(result.error) || "Could not update this book. Run the latest Supabase schema first.");
      return false;
    }
  }
  Object.assign(book, fields);
  if (!state.session) localStorage.setItem(storageKey, JSON.stringify(state.books));
  return true;
}

async function setReadingStatus(book, status) {
  const updated = await updateBookFields(book, { reading_status: status });
  if (!updated) return;
  render();
  showToast(status === "reading" ? "Added to Currently Reading" : "Removed from Currently Reading");
}

async function markBookAsRead(book) {
  const pageCount = Number(book.page_count || book.pages);
  const fields = { reading_status: "completed" };
  if (Number.isInteger(pageCount) && pageCount > 0) fields.current_page = pageCount;
  const updated = await updateBookFields(book, fields);
  if (!updated) return;
  render();
  showToast("Marked as complete");
}

async function readBookAgain(book) {
  const updated = await updateBookFields(book, {
    reading_status: "reading",
    current_page: 0,
    disposition: null,
  });
  if (!updated) return;
  render();
  showToast("Moved to Currently Reading");
}

async function setBookDisposition(book, disposition) {
  const action = disposition === "sold" ? "sold" : "donated";
  const confirmed = window.confirm(
    `Mark “${book.title}” as ${action}? It will stay in Completed Books and be hidden from your active library.`
  );
  if (!confirmed) return;
  const updated = await updateBookFields(book, { disposition });
  if (!updated) return;
  render();
  showToast(`Marked as ${action}`);
}

async function saveCurrentPage(book, currentPage) {
  if (!Number.isInteger(currentPage) || currentPage < 0) {
    showToast("Enter a valid current page (0 or greater).");
    return;
  }
  const pageCount = Number(book.page_count || book.pages);
  if (Number.isInteger(pageCount) && pageCount > 0 && currentPage > pageCount) {
    showToast(`Current page cannot exceed ${pageCount}.`);
    return;
  }
  const updated = await updateBookFields(book, { current_page: currentPage });
  if (!updated) return;
  render();
  showToast("Current page saved");
}

async function addBookToShelf(book, shelf) {
  if (!state.session) {
    showToast("Sign in to save books to shelves.");
    openAuthModal();
    return;
  }
  if (!book.id || !shelf?.id) {
    showToast("This book must be in your library before it can be added to a shelf.");
    return;
  }
  const names = getBookShelfNames(book);
  if (names.includes(shelf.name)) {
    showToast("This book is already on that shelf.");
    return;
  }
  const { error } = await state.supabase.from("book_shelves").insert({
    book_id: book.id,
    shelf_id: shelf.id,
    user_id: state.session.user.id,
  });
  if (error) {
    console.error(error);
    showToast("Could not add book to shelf. Run the latest Supabase schema first.");
    return;
  }
  book.shelves = [...names, shelf.name];
  book.shelf ||= shelf.name;
  render();
  if (state.view === "shelf") showShelfPage(state.currentShelf);
  showToast(`Added to ${shelf.name}`);
}

async function removeBookFromShelf(book, shelfName) {
  if (shelfName === "Library") {
    await removeBookFromLibrary(book);
    return;
  }
  const shelf = state.shelves.find((item) => item.name === shelfName);
  if (!shelf) {
    showToast("This book is not on a managed shelf.");
    return;
  }
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("book_shelves")
      .delete()
      .eq("book_id", book.id)
      .eq("shelf_id", shelf.id)
      .eq("user_id", state.session.user.id);
    if (error) {
      console.error(error);
      showToast("Could not remove book from shelf. Run the latest Supabase schema first.");
      return;
    }
    if (book.shelf === shelfName && state.supabase) {
      const { error: updateError } = await state.supabase.from("books")
        .update({ shelf: null })
        .eq("id", book.id)
        .eq("user_id", state.session.user.id);
      if (updateError) {
        console.error(updateError);
        showToast("Removed from shelf, but could not update the legacy shelf field.");
        return;
      }
    }
  }
  book.shelves = getBookShelfNames(book).filter((name) => name !== shelfName);
  if (book.shelf === shelfName) book.shelf = book.shelves[0] || "";
  if (!state.session) localStorage.setItem(storageKey, JSON.stringify(state.books));
  render();
  if (state.view === "shelf") showShelfPage(state.currentShelf);
  showToast("Removed from shelf");
}

async function removeBookFromLibrary(book) {
  const confirmed = window.confirm(`Remove “${book.title}” from your library?`);
  if (!confirmed) return;
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("books")
      .delete()
      .eq("id", book.id)
      .eq("user_id", state.session.user.id);
    if (error) {
      console.error(error);
      showToast("Could not remove this book from your library.");
      return;
    }
  }
  state.books = state.books.filter((item) => item.id !== book.id);
  if (state.currentBook && getBookKey(state.currentBook) === getBookKey(book)) navigateTo("home");
  if (!state.session) localStorage.setItem(storageKey, JSON.stringify(state.books));
  render();
  showToast("Removed from your library");
}

async function renameShelf(shelf, name) {
  if (!name
    || ["currently reading", "completed books"].includes(name.toLowerCase())
    || state.shelves.some((item) => item.id !== shelf.id && item.name.toLowerCase() === name.toLowerCase())) {
    showToast("Choose a unique shelf name.");
    return;
  }
  const { error } = await state.supabase.from("shelves")
    .update({ name })
    .eq("id", shelf.id)
    .eq("user_id", state.session.user.id);
  if (error) {
    console.error(error);
    showToast("Could not rename shelf.");
    return;
  }
  const oldName = shelf.name;
  shelf.name = name;
  state.books.forEach((book) => {
    if (book.shelf === oldName) book.shelf = name;
    book.shelves = getBookShelfNames(book).map((item) => item === oldName ? name : item);
  });
  navigateTo("shelf", { name });
  renderShelves();
  showToast("Shelf renamed");
}

async function deleteShelf(shelf) {
  const { error: booksError } = await state.supabase.from("books")
    .update({ shelf: null })
    .eq("shelf", shelf.name)
    .eq("user_id", state.session.user.id);
  if (booksError) {
    console.error(booksError);
    showToast("Could not detach books from this shelf.");
    return;
  }
  const { error } = await state.supabase.from("shelves")
    .delete()
    .eq("id", shelf.id)
    .eq("user_id", state.session.user.id);
  if (error) {
    console.error(error);
    showToast("Could not delete shelf.");
    return;
  }
  state.shelves = state.shelves.filter((item) => item.id !== shelf.id);
  state.books.forEach((book) => {
    book.shelves = getBookShelfNames(book).filter((name) => name !== shelf.name);
    if (book.shelf === shelf.name) book.shelf = book.shelves[0] || "";
  });
  if (state.view === "shelf") navigateTo("home");
  render();
  showToast("Shelf deleted");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function createBookCover(book, className = "") {
  const cover = document.createElement("div");
  cover.className = `book-cover-art ${className}`.trim();
  const titleText = book.title || "Untitled";
  const initials = document.createElement("span");
  initials.className = "book-cover-initials";
  initials.setAttribute("aria-hidden", "true");
  initials.textContent = titleText.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const title = document.createElement("span");
  title.className = "book-cover-placeholder";
  title.textContent = titleText;
  const palette = ["#74513d", "#365a59", "#745070", "#8b5945", "#465773"];
  const colorIndex = [...titleText].reduce((hash, character) => hash + character.charCodeAt(0), 0) % palette.length;
  cover.style.background = `linear-gradient(145deg, ${palette[colorIndex]}, #241611)`;
  cover.append(initials, title);

  const isbn = Array.isArray(book.isbn)
    ? book.isbn[0]
    : book.isbn || (Array.isArray(book.isbnList) ? book.isbnList[0] : "");
  const coverSize = className.includes("book-detail-cover") ? "L" : "M";
  const coverUrl = book.cover_i
    ? `https://covers.openlibrary.org/b/id/${book.cover_i}-${coverSize}.jpg?default=false`
    : book.cover_url || (isbn
      ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-${coverSize}.jpg?default=false`
      : "");
  if (coverUrl) {
    const image = document.createElement("img");
    let currentCoverSize = coverSize;
    image.src = coverUrl;
    image.alt = `${book.title || "Book"} cover`;
    image.loading = "lazy";
    image.addEventListener("load", () => cover.classList.add("has-cover"), { once: true });
    image.addEventListener("error", () => {
      if (currentCoverSize === "L") {
        currentCoverSize = "M";
        image.src = coverUrl.replace("-L.jpg", "-M.jpg");
      } else {
        image.remove();
      }
    });
    cover.prepend(image);
  }
  return cover;
}

function updateAuthButton() {
  authButton.textContent = state.session ? "Sign out" : "Sign in";
  sidebarAuthCopy.textContent = state.session
    ? "You're signed in. Your shelves are saved to your account."
    : "Sign in to build your own shelves.";
  const accountName = state.session?.user?.email || "Account";
  document.querySelector(".account-menu-label").textContent = accountName;
  document.querySelector(".account-avatar").textContent = accountName.slice(0, 1).toUpperCase();
}

function getDefaultBookLanguage() {
  const language = navigator.language.split("-")[0].toLowerCase();
  return browserLanguageCodes[language] || "eng";
}

function initializeBookLanguageOptions() {
  const defaultLanguage = getDefaultBookLanguage();
  const defaultName = openLibraryLanguages.find(([code]) => code === defaultLanguage)?.[1]
    || new Intl.DisplayNames([navigator.language], { type: "language" }).of(navigator.language.split("-")[0])
    || defaultLanguage;
  lookupLanguage.replaceChildren(new Option(`Default (${defaultName})`, "default"));
  openLibraryLanguages
    .filter(([code]) => code !== defaultLanguage)
    .forEach(([code, name]) => lookupLanguage.add(new Option(name, code)));
  lookupLanguage.add(new Option("Any language", "all"));
}

function renderStats() {
  const libraryBooks = getLibraryBooks();
  const totalBooks = libraryBooks.length;
  const totalSpent = libraryBooks.reduce((sum, book) => sum + Number(book.cost || 0), 0);

  document.getElementById("totalBooks").textContent = totalBooks;
  document.getElementById("totalSpent").textContent = formatCurrency(totalSpent);
  document.getElementById("shelvesCount").textContent = `${state.shelves.length} shelves`;
}

function renderShelves() {
  const shelfList = document.getElementById("shelfList");
  const libraryBooks = getLibraryBooks();
  const shelfCounts = libraryBooks.reduce((acc, book) => {
    const shelfName = book.shelf || "Library";
    acc[shelfName] = (acc[shelfName] || 0) + 1;
    return acc;
  }, {});
  const shelvesToRender = state.shelves.length
    ? state.shelves.map((shelf) => ({
        name: shelf.name,
        color: shelf.color || "#8b5e3c",
        books: libraryBooks.filter((book) => getBookShelfNames(book).includes(shelf.name)),
      }))
    : Object.entries(shelfCounts).map(([name]) => ({
        name,
        color: "#8b5e3c",
        books: libraryBooks.filter((book) => (book.shelf || "Library") === name),
      }));

  shelfList.replaceChildren();
  const likedBooks = libraryBooks.filter((book) => book.liked);
  const currentlyReadingBooks = libraryBooks.filter((book) => book.reading_status === "reading");
  shelfList.append(createShelfNavigationItem("Liked Books", String(likedBooks.length), "liked", likedBooks[0]));
  shelfList.append(createShelfNavigationItem(
    "Currently Reading",
    String(currentlyReadingBooks.length),
    "#496c5d",
    currentlyReadingBooks[0]
  ));
  startReadingCoverCycle(currentlyReadingBooks);
  const completedBooks = state.books.filter((book) => book.reading_status === "completed");
  shelfList.append(createShelfNavigationItem(
    "Completed Books",
    String(completedBooks.length),
    "#8b5e3c",
    completedBooks[0]
  ));
  const visibleShelves = shelvesToRender.filter(({ books }) => matchesShelfFilter(books));
  visibleShelves.forEach((shelf) => {
    shelfList.append(createShelfNavigationItem(shelf.name, String(shelf.books.length), shelf.color, shelf.books[0]));
  });
  if (!visibleShelves.length && state.shelfFilter !== "All") {
    const empty = document.createElement("p");
    empty.className = "sidebar-empty";
    empty.textContent = "No shelves match this filter.";
    shelfList.append(empty);
  } else if (!visibleShelves.length && libraryBooks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "sidebar-empty";
    empty.textContent = "Your shelves will appear here.";
    shelfList.append(empty);
  }
}

function getBookShelfNames(book) {
  if (Array.isArray(book.shelves) && book.shelves.length) return book.shelves;
  return book.shelf ? [book.shelf] : [];
}

function matchesShelfFilter(books) {
  if (state.shelfFilter === "All") return true;
  const genres = books.map((book) => (book.genre || "").toLowerCase());
  if (state.shelfFilter === "Fiction") return genres.some((genre) => genre.includes("fiction") && !genre.includes("nonfiction"));
  if (state.shelfFilter === "Nonfiction") return genres.some((genre) => genre.includes("nonfiction") || genre.includes("non-fiction"));
  return genres.some((genre) => genre && !genre.includes("fiction") && !genre.includes("nonfiction") && genre !== "non-fiction");
}

function setShelfFilter(filter) {
  state.shelfFilter = filter;
  document.querySelectorAll(".sidebar-filters .category-tab").forEach((button) => {
    const active = button.textContent.trim() === filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderShelves();
  if (window.matchMedia("(max-width: 899px)").matches && sidebar.classList.contains("is-open")) {
    setLibraryDrawerOpen(false);
  }
}

function setLibraryDrawerOpen(open) {
  sidebar.classList.toggle("is-open", open);
  sidebarBackdrop.hidden = !open;
  document.body.classList.toggle("library-drawer-open", open);
  libraryToggleBtn.setAttribute("aria-expanded", String(open));
  libraryToggleBtn.setAttribute("aria-label", open ? "Close library" : "Open library");
  if (open) document.getElementById("closeLibraryBtn").focus();
  else if (window.matchMedia("(max-width: 899px)").matches) libraryToggleBtn.focus();
}

function createShelfNavigationItem(name, count, color, book = null) {
  const item = document.createElement("button");
  item.className = "shelf-item";
  item.type = "button";
  item.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 899px)").matches) setLibraryDrawerOpen(false);
    navigateTo("shelf", { name });
  });

  const thumbnail = document.createElement("span");
  thumbnail.className = "shelf-thumbnail";
  if (name === "Currently Reading" && book) {
    thumbnail.dataset.readingShelfCover = "true";
    thumbnail.append(createBookCover(book, "shelf-thumb-art"));
  } else if (book) {
    thumbnail.append(createBookCover(book, "shelf-thumb-art"));
  } else if (color === "liked") {
    thumbnail.classList.add("liked-thumbnail");
    thumbnail.textContent = "♥";
    thumbnail.setAttribute("aria-hidden", "true");
  } else {
    thumbnail.style.backgroundColor = color;
    thumbnail.textContent = name.slice(0, 1).toUpperCase();
    thumbnail.setAttribute("aria-hidden", "true");
  }

  const copy = document.createElement("span");
  copy.className = "shelf-item-copy";
  const title = document.createElement("strong");
  title.textContent = name;
  const subtitle = document.createElement("span");
  subtitle.textContent = `${name === "Liked Books" ? "Collection" : "Shelf"} · ${count} books`;
  copy.append(title, subtitle);
  item.append(thumbnail, copy);
  return item;
}

function startReadingCoverCycle(books) {
  const cycleKey = books.map((book) => book.id || getBookKey(book)).join("|");
  if (cycleKey === readingCoverCycleKey) {
    updateReadingShelfCovers();
    return;
  }
  readingCoverCycleKey = cycleKey;
  window.clearInterval(readingCoverCycleTimer);
  readingCoverCycleTimer = null;
  readingCoverCycleBooks = books.slice();
  for (let index = readingCoverCycleBooks.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [readingCoverCycleBooks[index], readingCoverCycleBooks[randomIndex]] =
      [readingCoverCycleBooks[randomIndex], readingCoverCycleBooks[index]];
  }
  readingCoverCycleIndex = 0;
  updateReadingShelfCovers();
  if (readingCoverCycleBooks.length > 1) {
    readingCoverCycleTimer = window.setInterval(() => {
      readingCoverCycleIndex = (readingCoverCycleIndex + 1) % readingCoverCycleBooks.length;
      updateReadingShelfCovers();
    }, 5000);
  }
}

function updateReadingShelfCovers() {
  const book = readingCoverCycleBooks[readingCoverCycleIndex];
  if (!book) return;
  document.querySelectorAll("[data-reading-shelf-cover]").forEach((cover) => {
    cover.replaceChildren(createBookCover(book, "shelf-thumb-art"));
  });
  document.querySelectorAll("[data-reading-shelf-card-cover]").forEach((cover) => {
    cover.replaceChildren(createBookCover(book));
  });
}

function groupBooksByShelf(books) {
  return books.slice().sort((a, b) => new Date(b.added || b.added_on || 0) - new Date(a.added || a.added_on || 0)).reduce((acc, book) => {
    const shelfName = book.shelf || "Library";
    if (!acc[shelfName]) acc[shelfName] = [];
    acc[shelfName].push(book);
    return acc;
  }, {});
}

function renderShelfOptions() {
  const shelfSelect = bookForm.elements.shelf;
  const selectedShelf = shelfSelect.value;
  shelfSelect.replaceChildren(new Option("Library (no shelf)", ""));
  state.shelves.forEach((shelf) => {
    shelfSelect.add(new Option(shelf.name, shelf.name));
  });
  shelfSelect.value = state.shelves.some((shelf) => shelf.name === selectedShelf) ? selectedShelf : "";
}

function openBookProfile(book) {
  bookProfileReturnFocus = document.activeElement;
  selectedBook = book;
  navigateTo("book", {
    id: book.id || "",
    title: book.title || "",
    author: book.author || "",
  });
}

function closeBookProfile() {
  selectedBook = null;
  window.history.replaceState(null, "", createRouteHash("home"));
  restoreRouteFromLocation();
  if (bookProfileReturnFocus instanceof HTMLElement && bookProfileReturnFocus.isConnected) bookProfileReturnFocus.focus();
  bookProfileReturnFocus = null;
}

function renderBooks() {
  const container = document.getElementById("homeRows");
  if (state.view !== "home") return;
  container.replaceChildren();
  if (state.loading) {
    container.setAttribute("aria-busy", "true");
    const status = document.createElement("p");
    status.className = "visually-hidden";
    status.setAttribute("role", "status");
    status.textContent = "Loading your library";
    container.append(status);
  } else {
    container.removeAttribute("aria-busy");
  }

  const libraryBooks = getLibraryBooks();
  const orderedBooks = libraryBooks.slice().sort((a, b) =>
    new Date(b.added || b.added_on || 0) - new Date(a.added || a.added_on || 0));
  const ownedKeys = new Set(libraryBooks.map(getBookKey));
  const recommendations = scoreRecommendations(discoveryBooks.filter((book) =>
    !ownedKeys.has(getBookKey(book)) && !state.dismissedRecommendations.has(getBookKey(book))));
  const moreByOwnedAuthors = recommendations.filter(({ book }) =>
    libraryBooks.some((owned) => owned.author && owned.author.toLowerCase() === book.author.toLowerCase()));
  const shelfTiles = state.shelves.map((shelf) => ({
    name: shelf.name,
    count: libraryBooks.filter((book) => book.shelf === shelf.name).length,
    color: shelf.color || "#8b5e3c",
    book: libraryBooks.find((book) => book.shelf === shelf.name),
  }));
  const genres = [...new Set(libraryBooks.map((book) => book.genre).filter(Boolean))];
  const genreTiles = [...new Set([...genres, "Fiction", "Nonfiction", "Mystery", "Fantasy", "Essays"])]
    .map((genre, index) => ({
      title: genre,
      count: libraryBooks.filter((book) => book.genre === genre).length,
      color: ["#8050a8", "#bf613f", "#3f7772", "#536c9e"][index % 4],
    }));

  const homeSections = [
    ["Jump back in", () => createCardRow("Jump back in", shelfTiles.length
      ? shelfTiles.slice(0, 6).map((shelf) => ({ type: "shelf", ...shelf }))
      : orderedBooks.slice(0, 6).map((book) => ({ type: "compact-book", book })), {
        compact: true,
        emptyMessage: state.loading ? "Loading your shelves and books…" : "",
      })],
    ["Picked for your library", () => createCardRow("Picked for your library", recommendations.slice(0, 8)
      .map(({ book, reason }) => ({ type: "book", book, subtitle: reason, recommendation: true })))],
    ["Shelves for your taste", () => createCardRow("Shelves for your taste", buildSuggestedShelves(genres))],
    ["Recently added", () => createCardRow("Recently added", orderedBooks.slice(0, 10)
      .map((book) => ({ type: "book", book })), {
        emptyMessage: state.loading
          ? "Loading your library…"
          : state.loadError || "Add your first book to start building your library.",
        emptyActionLabel: state.loading ? "" : "＋ Add your first book",
        emptyAction: state.loading ? null : openDialog,
      })],
    ["More by authors you own", () => createCardRow("More by authors you own", moreByOwnedAuthors.slice(0, 8)
      .map(({ book }) => ({ type: "book", book })), {
        emptyMessage: state.loading
          ? "Loading your library…"
          : "Add books by an author you love to find more of their work.",
      })],
    ["Browse by genre", () => createCardRow("Browse by genre", genreTiles.map((genre) => ({ type: "genre", ...genre })))],
  ];

  let hadSectionError = false;
  homeSections.forEach(([title, createSection]) => {
    try {
      container.append(createSection());
    } catch (error) {
      console.error(`Could not render home section "${title}"`, error);
      const section = document.createElement("section");
      section.className = "home-section card-row-section";
      const message = document.createElement("p");
      message.className = "row-empty-state";
      message.textContent = "This section could not be displayed. Please refresh the page.";
      section.append(message);
      container.append(section);
      hadSectionError = true;
    }
  });
  if (hadSectionError) showToast("Some home sections could not be displayed.");
}

function scoreRecommendations(candidates) {
  const libraryBooks = getLibraryBooks();
  const ownedGenres = new Set(libraryBooks.map((book) => (book.genre || "").toLowerCase()).filter(Boolean));
  const ownedAuthors = new Set(libraryBooks.map((book) => (book.author || "").toLowerCase()).filter(Boolean));
  return candidates.map((book) => {
    const authorSource = libraryBooks.find((owned) =>
      owned.author && owned.author.toLowerCase() === book.author.toLowerCase());
    const genreSource = libraryBooks.find((owned) =>
      owned.genre && owned.genre.toLowerCase() === book.genre.toLowerCase());
    const authorMatch = ownedAuthors.has(book.author.toLowerCase());
    const genreMatch = ownedGenres.has(book.genre.toLowerCase());
    return {
      book,
      score: Number(authorMatch) * 3 + Number(genreMatch),
      reason: authorSource
        ? `Because you own ${authorSource.title}`
        : genreSource
          ? `Because you own ${genreSource.title}`
        : genreMatch
          ? `Because you enjoy ${book.genre}`
          : `A ${book.genre.toLowerCase()} pick for your library`,
    };
  }).sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title));
}

function getBookKey(book) {
  return (book.isbn || `${book.title}|${book.author}`).toString().toLowerCase();
}

function buildSuggestedShelves(genres) {
  const suggestions = [
    { title: "Late Night Reading", subtitle: "Stories for after hours", color: "#74508a" },
    { title: "New Perspectives", subtitle: "Ideas that stay with you", color: "#bd6749" },
    { title: "Slow Sunday Reads", subtitle: "A softer kind of afternoon", color: "#496c5d" },
  ];
  if (genres.includes("Nonfiction")) {
    suggestions[1] = { title: "Curious Minds", subtitle: "Thoughtful nonfiction", color: "#4c7083" };
  }
  return suggestions.map((shelf) => ({ type: "suggested-shelf", ...shelf }));
}

function createCardRow(title, cards, {
  compact = false,
  emptyMessage = "",
  emptyActionLabel = "",
  emptyAction = null,
} = {}) {
  const section = document.createElement("section");
  section.className = "home-section card-row-section";
  const heading = document.createElement("div");
  heading.className = "section-heading-row";
  const headingTitle = document.createElement("h2");
  headingTitle.textContent = title;
  const showAll = document.createElement("button");
  showAll.type = "button";
  showAll.className = "text-btn show-all-btn";
  showAll.textContent = "Show all";
  showAll.setAttribute("aria-expanded", "false");
  heading.append(headingTitle, showAll);

  const row = document.createElement("div");
  row.className = `card-row${compact ? " compact-card-row" : ""}`;
  row.setAttribute("role", "region");
  row.setAttribute("aria-label", `${title} books and shelves`);
  row.tabIndex = 0;
  row.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      row.scrollBy({ left: event.key === "ArrowRight" ? 240 : -240, behavior: "smooth" });
    }
  });
  if (!cards.length && emptyMessage) {
    const empty = document.createElement("p");
    empty.className = "row-empty-state";
    empty.textContent = emptyMessage;
    row.append(empty);
    if (emptyAction && emptyActionLabel) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "secondary-btn row-empty-action";
      action.textContent = emptyActionLabel;
      action.addEventListener("click", emptyAction);
      row.append(action);
    }
  } else {
    cards.forEach((cardData) => row.append(
      cardData.type === "shelf" || cardData.type === "suggested-shelf"
        ? createShelfCard(cardData, { compact })
        : cardData.type === "genre"
          ? createGenreCard(cardData)
          : createBookCard(cardData.book, {
            compact: cardData.type === "compact-book",
            subtitle: cardData.subtitle,
            recommendation: cardData.recommendation,
          })
    ));
  }

  showAll.hidden = cards.length <= 5;
  showAll.addEventListener("click", () => {
    const expanded = row.classList.toggle("expanded");
    showAll.setAttribute("aria-expanded", String(expanded));
    showAll.textContent = expanded ? "Show less" : "Show all";
  });
  section.append(heading, row);
  return section;
}

function createBookCard(book, { compact = false, subtitle = "", recommendation = false } = {}) {
  const card = document.createElement("article");
  card.className = `media-card book-card${compact ? " compact-book-card" : ""}`;
  const open = document.createElement("button");
  open.type = "button";
  open.className = "card-open-button";
  open.setAttribute("aria-label", `Open ${book.title} by ${book.author || "Unknown author"}`);
  open.append(createBookCover(book));
  const title = document.createElement("strong");
  title.className = "book-cover-title";
  title.textContent = book.title || "Untitled";
  const author = document.createElement("span");
  author.className = "book-cover-author";
  author.textContent = subtitle || book.author || "Unknown author";
  open.append(title, author);
  open.addEventListener("click", () => openBookProfile(book));
  card.append(open);
  const ownedBook = getLibraryBooks().find((owned) => getBookKey(owned) === getBookKey(book));
  if (!ownedBook) {
    const addMenu = document.createElement("details");
    addMenu.className = "card-add-menu";
    const action = document.createElement("summary");
    action.className = "card-action";
    action.textContent = "＋";
    action.setAttribute("aria-label", `Add or purchase ${book.title}`);
    const choices = document.createElement("div");
    choices.className = "card-add-actions";
    const addToLibrary = document.createElement("button");
    addToLibrary.type = "button";
    addToLibrary.textContent = "Add to Library";
    addToLibrary.addEventListener("click", () => {
      addMenu.open = false;
      markBookAsOwned(book);
    });
    const purchase = document.createElement("button");
    purchase.type = "button";
    purchase.textContent = "Purchase";
    purchase.addEventListener("click", () => {
      addMenu.open = false;
      navigateTo("purchase", {
        title: book.title || "",
        author: book.author || "",
        isbn: Array.isArray(book.isbn) ? book.isbn[0] || "" : book.isbn || "",
        cover: book.cover_url
          || (book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg?default=false` : ""),
      });
    });
    choices.append(addToLibrary, purchase);
    addMenu.append(action, choices);
    wireCardPopover(addMenu, action, choices);
    card.append(addMenu);
  }
  if (ownedBook) {
    const like = document.createElement("button");
    like.type = "button";
    like.className = `card-like${book.liked ? " is-liked" : ""}`;
    like.textContent = book.liked ? "♥" : "♡";
    like.setAttribute("aria-label", book.liked ? `Unlike ${book.title}` : `Like ${book.title}`);
    like.setAttribute("aria-pressed", String(Boolean(book.liked)));
    like.addEventListener("click", () => toggleBookLike(ownedBook));
    card.append(like);
  }
  card.append(createBookCardMenu(book, ownedBook, recommendation));
  return card;
}

function markBookAsOwned(book) {
  openDialog();
  if (!state.session) return;
  startManualEntry();
  bookForm.elements.title.value = book.title || "";
  bookForm.elements.author.value = Array.isArray(book.author_name)
    ? book.author_name.join(", ")
    : book.author || "";
  bookForm.elements.isbn.value = Array.isArray(book.isbn)
    ? book.isbn[0] || ""
    : book.isbn || "";
  bookForm.elements.cover_url.value = book.cover_url
    || (book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg?default=false` : "");
  bookForm.elements.genre.value = book.genre || "";
  bookForm.elements.page_count.value = String(book.page_count || book.pages || "");
  bookForm.elements.added.value = new Date().toISOString().slice(0, 10);
  if (!bookForm.elements.cost.value) bookForm.elements.cost.value = "0";
}

function createBookCardMenu(book, ownedBook, recommendation) {
  const menu = document.createElement("details");
  menu.className = "card-menu";
  const summary = document.createElement("summary");
  summary.textContent = "⋯";
  summary.setAttribute("aria-label", `More actions for ${book.title}`);
  const actions = document.createElement("div");
  actions.className = "card-menu-actions";
  wireCardPopover(menu, summary, actions);
  const addToShelf = document.createElement("button");
  addToShelf.type = "button";
  addToShelf.textContent = "Add to shelf";
  addToShelf.addEventListener("click", () => {
    menu.open = false;
    if (ownedBook) openBookProfile(ownedBook);
    else markBookAsOwned(book);
  });
  const markOwned = document.createElement("button");
  markOwned.type = "button";
  markOwned.textContent = ownedBook ? "Open book" : "Mark as owned";
  markOwned.addEventListener("click", () => {
    menu.open = false;
    if (ownedBook) openBookProfile(ownedBook);
    else markBookAsOwned(book);
  });
  const like = document.createElement("button");
  like.type = "button";
  like.textContent = ownedBook?.liked ? "Unlike" : "Like";
  like.addEventListener("click", () => {
    menu.open = false;
    if (ownedBook) toggleBookLike(ownedBook);
    else showToast("Add this book to your library before liking it.");
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    menu.open = false;
    if (ownedBook) removeBookFromLibrary(ownedBook);
    else if (recommendation) {
      state.dismissedRecommendations.add(getBookKey(book));
      renderBooks();
    } else if (state.view === "search" && state.searchResults) {
      state.searchResults = state.searchResults.filter((item) => getBookKey(item) !== getBookKey(book));
      showSearchPage(state.searchQuery);
    }
  });
  actions.append(addToShelf, markOwned, like, remove);
  menu.append(summary, actions);
  return menu;
}

function wireCardPopover(menu, summary, panel) {
  const positionPanel = () => {
    const summaryRect = summary.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const left = Math.max(margin, Math.min(
      summaryRect.right - panelRect.width,
      window.innerWidth - panelRect.width - margin
    ));
    const below = summaryRect.bottom + gap;
    const top = below + panelRect.height <= window.innerHeight - margin
      ? below
      : Math.max(margin, summaryRect.top - panelRect.height - gap);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };
  const repositionPanel = () => {
    if (menu.open) positionPanel();
  };
  menu.addEventListener("toggle", () => {
    menu.closest(".media-card")?.classList.toggle("card-menu-open", menu.open);
    if (menu.open) {
      positionPanel();
      window.addEventListener("resize", repositionPanel);
      window.addEventListener("scroll", repositionPanel, true);
    } else {
      window.removeEventListener("resize", repositionPanel);
      window.removeEventListener("scroll", repositionPanel, true);
    }
  });
}

function createShelfCard(shelf, { compact = false } = {}) {
  const card = document.createElement("article");
  const isSuggestion = shelf.type === "suggested-shelf";
  card.className = `media-card shelf-card${compact ? " compact-shelf-card" : ""}${isSuggestion ? " suggested-shelf-card" : ""}`;
  const open = document.createElement("button");
  open.type = "button";
  open.className = "card-open-button";
  const name = shelf.name || shelf.title;
  open.setAttribute("aria-label", `${isSuggestion ? "View" : "Open"} shelf ${name}`);
  const cover = document.createElement("span");
  cover.className = "shelf-card-art";
  cover.style.setProperty("--shelf-color", shelf.color);
  if (name === "Currently Reading" && shelf.book) {
    cover.dataset.readingShelfCardCover = "true";
    cover.append(createBookCover(shelf.book));
  } else if (shelf.book) cover.append(createBookCover(shelf.book));
  else cover.textContent = name.slice(0, 1).toUpperCase();
  const title = document.createElement("strong");
  title.className = "book-cover-title";
  title.textContent = name;
  const subtitle = document.createElement("span");
  subtitle.className = "book-cover-author";
  subtitle.textContent = isSuggestion ? shelf.subtitle : `${shelf.count} books`;
  open.append(cover, title, subtitle);
  open.addEventListener("click", () => {
    if (isSuggestion) navigateTo("shelves");
    else navigateTo("shelf", { name });
  });
  card.append(open);
  if (cover.hasAttribute("data-reading-shelf-card-cover")) updateReadingShelfCovers();
  return card;
}

function createGenreCard(genre) {
  const card = document.createElement("article");
  card.className = "media-card genre-card";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "genre-tile";
  button.style.setProperty("--genre-color", genre.color);
  button.textContent = genre.title;
  button.setAttribute("aria-label", `Browse ${genre.title}, ${genre.count} books`);
  button.addEventListener("click", () => runNaturalSearch(genre.title));
  card.append(button);
  return card;
}

function showHomePage() {
  state.view = "home";
  state.currentShelf = "";
  state.currentBook = null;
  document.getElementById("homeRows").classList.remove("hidden");
  document.getElementById("pageView").classList.add("hidden");
  updateActiveNavigation("Home");
  render();
}

function showPage(view) {
  state.view = view;
  document.getElementById("homeRows").classList.add("hidden");
  const page = document.getElementById("pageView");
  page.classList.remove("hidden");
  page.replaceChildren();
  return page;
}

function updateActiveNavigation(label) {
  document.querySelectorAll(".nav-pill").forEach((item) => {
    const active = item.textContent.trim().toLowerCase() === label.toLowerCase();
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function createPageHeader(kicker, title, description = "") {
  const header = document.createElement("header");
  header.className = "page-header";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "text-btn page-back";
  back.textContent = "‹ Home";
  back.addEventListener("click", () => navigateTo("home"));
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = kicker;
  const heading = document.createElement("h1");
  heading.textContent = title;
  header.append(back, eyebrow, heading);
  if (description) {
    const copy = document.createElement("p");
    copy.className = "page-description";
    copy.textContent = description;
    header.append(copy);
  }
  return header;
}

function showShelfPage(shelfName) {
  state.view = "shelf";
  state.currentShelf = shelfName;
  updateActiveNavigation("Your shelves");
  const page = showPage("shelf");
  const shelf = state.shelves.find((item) => item.name === shelfName);
  const books = shelfName === "Completed Books"
    ? state.books.filter((book) => book.reading_status === "completed")
    : getLibraryBooks().filter((book) => shelfName === "Liked Books"
      ? book.liked
      : shelfName === "Currently Reading"
        ? book.reading_status === "reading"
        : shelfName === "Library"
          ? getBookShelfNames(book).length === 0
          : getBookShelfNames(book).includes(shelfName));
  const coverBook = books[0] || { title: shelfName, author: "", isbn: "" };
  const totalValue = books.reduce((total, book) => total + Number(book.cost || 0), 0);
  const description = shelfName === "Currently Reading"
    ? `${books.length} ${books.length === 1 ? "book" : "books"} in progress`
    : `${books.length} books · ${formatCurrency(totalValue)} total value`;
  const header = createPageHeader("Shelf · Your library", shelfName, description);

  const toolbar = document.createElement("div");
  toolbar.className = "page-toolbar";
  const addBook = document.createElement("button");
  addBook.type = "button";
  addBook.className = "action-btn";
  addBook.textContent = "＋ Add a book";
  addBook.addEventListener("click", openDialog);
  toolbar.append(addBook);
  if (shelf && state.session) {
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "secondary-btn";
    rename.textContent = "Rename shelf";
    rename.addEventListener("click", async () => {
      const nextName = window.prompt("Rename shelf", shelf.name)?.trim();
      if (!nextName || nextName === shelf.name) return;
      await renameShelf(shelf, nextName);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-btn";
    remove.textContent = "Delete shelf";
    remove.addEventListener("click", async () => {
      if (window.confirm(`Delete “${shelf.name}”? Books will stay in your library.`)) await deleteShelf(shelf);
    });
    toolbar.append(rename, remove);
  }
  if (shelfName === "Currently Reading") {
    page.append(header, toolbar, createCurrentlyReadingList(books));
    return;
  }
  if (shelfName === "Completed Books") {
    page.append(header, createCompletedBooksList(books));
    return;
  }
  const hero = document.createElement("div");
  hero.className = "shelf-hero";
  const cover = createBookCover(coverBook, "shelf-hero-cover");
  if (shelf) cover.style.setProperty("--cover-tint", shelf.color || "#8b5e3c");
  const meta = document.createElement("div");
  meta.className = "shelf-hero-meta";
  const owner = document.createElement("span");
  owner.textContent = state.profile?.full_name || state.session?.user?.email || "Your library";
  const count = document.createElement("strong");
  count.textContent = `${books.length} ${books.length === 1 ? "book" : "books"}`;
  meta.append(owner, count);
  hero.append(cover, meta);
  page.append(header, hero, toolbar, createBookTable(books));
}

function createCompletedBooksList(books) {
  const list = document.createElement("div");
  list.className = "currently-reading-list";
  list.setAttribute("aria-label", "Completed books");
  if (!books.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state-card";
    const title = document.createElement("h2");
    title.textContent = "Your completed books will appear here";
    const copy = document.createElement("p");
    copy.textContent = "Mark a book as complete from Currently Reading to add it to this shelf.";
    empty.append(title, copy);
    list.append(empty);
    return list;
  }

  books.forEach((book) => {
    const row = document.createElement("article");
    row.className = "currently-reading-row completed-book-row";
    const coverButton = document.createElement("button");
    coverButton.type = "button";
    coverButton.className = "currently-reading-cover";
    coverButton.setAttribute("aria-label", `Open ${book.title}`);
    coverButton.append(createBookCover(book));
    coverButton.addEventListener("click", () => openBookProfile(book));

    const details = document.createElement("div");
    details.className = "currently-reading-details";
    const title = document.createElement("button");
    title.type = "button";
    title.className = "table-book-title";
    title.textContent = book.title || "Untitled";
    title.addEventListener("click", () => openBookProfile(book));
    const author = document.createElement("span");
    author.className = "currently-reading-author";
    author.textContent = book.author || "Unknown author";
    const status = document.createElement("span");
    status.className = "currently-reading-progress";
    status.textContent = book.disposition
      ? `Completed · ${book.disposition === "sold" ? "Sold" : "Donated"}`
      : `Completed · ${Number(book.current_page || 0)} pages read`;
    details.append(title, author, status);

    const actions = document.createElement("div");
    actions.className = "currently-reading-controls completed-book-actions";
    const readAgain = document.createElement("button");
    readAgain.type = "button";
    readAgain.className = "action-btn";
    readAgain.textContent = "Read again";
    readAgain.addEventListener("click", () => readBookAgain(book));
    actions.append(readAgain);

    if (!book.disposition) {
      const options = document.createElement("details");
      options.className = "completed-disposition";
      const summary = document.createElement("summary");
      summary.className = "secondary-btn";
      summary.textContent = "Sell or donate";
      const optionsGrid = document.createElement("div");
      optionsGrid.className = "disposition-options";
      [
        {
          heading: "Sell online",
          description: "Compare buyback offers or list it for sale.",
          links: [
            ["BookScouter", "https://www.bookscouter.com/"],
            ["Search eBay", `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent([book.title, book.author].filter(Boolean).join(" "))}`],
          ],
        },
        {
          heading: "Sell locally",
          description: "Find nearby used bookstores.",
          links: [["Search nearby", "https://www.google.com/maps/search/used+bookstores+near+me/"]],
        },
        {
          heading: "Donate online",
          description: "Find organizations accepting books by mail.",
          links: [["Search donation programs", "https://www.google.com/search?q=donate+books+by+mail"]],
        },
        {
          heading: "Donate locally",
          description: "Find nearby book donation locations.",
          links: [["Search nearby", "https://www.google.com/maps/search/book+donation+near+me/"]],
        },
      ].forEach(({ heading, description, links }) => {
        const option = document.createElement("section");
        option.className = "disposition-option";
        const title = document.createElement("h3");
        title.textContent = heading;
        const copy = document.createElement("p");
        copy.textContent = description;
        const linkList = document.createElement("div");
        linkList.className = "disposition-links";
        links.forEach(([label, href]) => {
          const link = document.createElement("a");
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = label;
          linkList.append(link);
        });
        const mark = document.createElement("button");
        mark.type = "button";
        mark.className = "text-btn disposition-mark";
        const disposition = heading.startsWith("Sell") ? "sold" : "donated";
        mark.textContent = `Mark as ${disposition}`;
        mark.addEventListener("click", () => setBookDisposition(book, disposition));
        option.append(title, copy, linkList, mark);
        optionsGrid.append(option);
      });
      options.append(summary, optionsGrid);
      actions.append(options);
    }
    row.append(coverButton, details, actions);
    list.append(row);
  });
  return list;
}

function createCurrentlyReadingList(books) {
  const list = document.createElement("div");
  list.className = "currently-reading-list";
  list.setAttribute("aria-label", "Books currently being read");
  if (!books.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state-card";
    const title = document.createElement("h2");
    title.textContent = "Nothing on your reading list yet";
    const copy = document.createElement("p");
    copy.textContent = "Open a book in your library and switch on Currently Reading to add it here.";
    empty.append(title, copy);
    list.append(empty);
    return list;
  }

  books.forEach((book) => {
    const row = document.createElement("article");
    row.className = "currently-reading-row";
    const coverButton = document.createElement("button");
    coverButton.type = "button";
    coverButton.className = "currently-reading-cover";
    coverButton.setAttribute("aria-label", `Open ${book.title}`);
    coverButton.append(createBookCover(book));
    coverButton.addEventListener("click", () => openBookProfile(book));

    const details = document.createElement("div");
    details.className = "currently-reading-details";
    const title = document.createElement("button");
    title.type = "button";
    title.className = "table-book-title";
    title.textContent = book.title || "Untitled";
    title.addEventListener("click", () => openBookProfile(book));
    const author = document.createElement("span");
    author.className = "currently-reading-author";
    author.textContent = book.author || "Unknown author";
    const pageCount = Number(book.page_count || book.pages);
    const progress = document.createElement("span");
    progress.className = "currently-reading-progress";
    progress.textContent = Number.isInteger(pageCount) && pageCount > 0
      ? `Page ${book.current_page || 0} of ${pageCount}`
      : `Page ${book.current_page || 0}`;
    details.append(title, author, progress);

    const controls = document.createElement("div");
    controls.className = "currently-reading-controls";
    const pageInput = document.createElement("input");
    pageInput.type = "number";
    pageInput.min = "0";
    if (Number.isInteger(pageCount) && pageCount > 0) pageInput.max = String(pageCount);
    pageInput.step = "1";
    pageInput.value = String(book.current_page || 0);
    pageInput.setAttribute("aria-label", `Current page for ${book.title}`);
    const savePage = document.createElement("button");
    savePage.type = "button";
    savePage.className = "secondary-btn";
    savePage.textContent = "Save page";
    savePage.addEventListener("click", () => saveCurrentPage(
      book,
      pageInput.value.trim() ? Number(pageInput.value) : Number.NaN
    ));
    const complete = document.createElement("button");
    complete.type = "button";
    complete.className = "action-btn";
    complete.textContent = "Mark complete";
    complete.addEventListener("click", () => markBookAsRead(book));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-btn";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${book.title} from Currently Reading`);
    remove.addEventListener("click", () => setReadingStatus(book, ""));
    controls.append(pageInput, savePage, complete, remove);
    row.append(coverButton, details, controls);
    list.append(row);
  });
  return list;
}

function showShelvesPage() {
  updateActiveNavigation("Your shelves");
  const page = showPage("shelves");
  const header = createPageHeader("Your Library", "Your shelves", "Your books, gathered into collections.");
  const createShelf = document.createElement("button");
  createShelf.type = "button";
  createShelf.className = "action-btn";
  createShelf.textContent = "＋ Create shelf";
  createShelf.addEventListener("click", openShelfDrawer);
  const toolbar = document.createElement("div");
  toolbar.className = "page-toolbar";
  toolbar.append(createShelf);
  page.append(header, toolbar);
  const libraryBooks = getLibraryBooks();
  const tiles = [
    {
      type: "shelf",
      name: "Liked Books",
      count: libraryBooks.filter((book) => book.liked).length,
      color: "#704052",
      book: libraryBooks.find((book) => book.liked),
    },
    {
      type: "shelf",
      name: "Currently Reading",
      count: libraryBooks.filter((book) => book.reading_status === "reading").length,
      color: "#496c5d",
      book: libraryBooks.find((book) => book.reading_status === "reading"),
    },
    {
      type: "shelf",
      name: "Completed Books",
      count: state.books.filter((book) => book.reading_status === "completed").length,
      color: "#8b5e3c",
      book: state.books.find((book) => book.reading_status === "completed"),
    },
    {
      type: "shelf",
      name: "Library",
      count: libraryBooks.filter((book) => !getBookShelfNames(book).length).length,
      color: "#8b5e3c",
      book: libraryBooks.find((book) => !getBookShelfNames(book).length),
    },
    ...state.shelves.map((shelf) => ({
      type: "shelf",
      name: shelf.name,
      count: libraryBooks.filter((book) => getBookShelfNames(book).includes(shelf.name)).length,
      color: shelf.color || "#8b5e3c",
      book: libraryBooks.find((book) => getBookShelfNames(book).includes(shelf.name)),
    })),
  ];
  page.append(createCardRow("Collections", tiles));
}

function createBookTable(books) {
  const wrapper = document.createElement("div");
  wrapper.className = "book-table-wrap";
  if (!books.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state-card";
    const title = document.createElement("h2");
    title.textContent = "This shelf is ready for a first book";
    const copy = document.createElement("p");
    copy.textContent = "Add a book and it will appear here.";
    empty.append(title, copy);
    wrapper.append(empty);
    return wrapper;
  }

  const columns = [
    ["title", "Title"],
    ["author", "Author"],
    ["genre", "Genre"],
    ["added", "Date added"],
    ["cost", "Value"],
  ];
  const table = document.createElement("table");
  table.className = "book-table";
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const numberHeading = document.createElement("th");
  numberHeading.scope = "col";
  numberHeading.textContent = "#";
  headerRow.append(numberHeading);
  columns.forEach(([key, label]) => {
    const th = document.createElement("th");
    th.scope = "col";
    const sort = document.createElement("button");
    sort.type = "button";
    sort.className = "table-sort";
    sort.textContent = label;
    sort.setAttribute("aria-label", `Sort by ${label}`);
    sort.addEventListener("click", () => {
      state.shelfSort.direction = state.shelfSort.key === key && state.shelfSort.direction === "asc" ? "desc" : "asc";
      state.shelfSort.key = key;
      showShelfPage(state.currentShelf);
    });
    th.append(sort);
    headerRow.append(th);
  });
  thead.append(headerRow);
  const tbody = document.createElement("tbody");
  const sortedBooks = books.slice().sort((first, second) => {
    const { key, direction } = state.shelfSort;
    const a = key === "added" ? new Date(first.added || first.added_on || 0).getTime()
      : key === "cost" ? Number(first.cost || 0)
        : String(first[key] || "").toLocaleLowerCase();
    const b = key === "added" ? new Date(second.added || second.added_on || 0).getTime()
      : key === "cost" ? Number(second.cost || 0)
        : String(second[key] || "").toLocaleLowerCase();
    return (a < b ? -1 : a > b ? 1 : 0) * (direction === "asc" ? 1 : -1);
  });
  sortedBooks.forEach((book, index) => {
    const row = document.createElement("tr");
    const number = document.createElement("td");
    number.textContent = String(index + 1);
    row.append(number);
    columns.forEach(([key]) => {
      const cell = document.createElement("td");
      if (key === "title") {
        const title = document.createElement("button");
        title.type = "button";
        title.className = "table-book-title";
        title.textContent = book.title;
        title.addEventListener("click", () => openBookProfile(book));
        cell.append(title);
      } else if (key === "added") {
        cell.textContent = formatDate(book.added || book.added_on);
      } else if (key === "cost") {
        cell.textContent = formatCurrency(book.cost);
      } else {
        cell.textContent = book[key] || "—";
      }
      row.append(cell);
    });
    const actions = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "table-sort";
    const isLikedShelf = state.currentShelf === "Liked Books";
    const isCurrentlyReadingShelf = state.currentShelf === "Currently Reading";
    remove.textContent = isLikedShelf ? "Unlike" : "Remove";
    remove.setAttribute("aria-label", `${isLikedShelf ? "Unlike" : "Remove"} ${book.title}`);
    remove.addEventListener("click", () => {
      if (isLikedShelf) toggleBookLike(book);
      else if (isCurrentlyReadingShelf) setReadingStatus(book, "");
      else removeBookFromShelf(book, state.currentShelf);
    });
    actions.append(remove);
    row.append(actions);
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function renderBookPage(book) {
  state.currentBook = book;
  updateActiveNavigation("");
  const page = showPage("book");
  const header = createPageHeader("Book · Your library", book.title, book.author || "Unknown author");
  const layout = document.createElement("div");
  layout.className = "book-detail-layout";
  const cover = createBookCover(book, "book-detail-cover");
  const content = document.createElement("div");
  content.className = "book-detail-content";
  const details = [
    ["Author", book.author || "Unknown author"],
    ["Genre", book.genre || "—"],
    ["ISBN", book.isbn || "—"],
    ["Date added", formatDate(book.added || book.added_on)],
    ["Pages", book.page_count || book.pages || "—"],
    ["Value", formatCurrency(book.cost)],
  ];
  details.forEach(([label, value]) => {
    const field = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label} `;
    field.append(strong, document.createTextNode(value));
    content.append(field);
  });
  const actions = document.createElement("div");
  actions.className = "page-actions";
  const ownedBook = state.books.find((item) => getBookKey(item) === getBookKey(book));
  const add = document.createElement("button");
  add.type = "button";
  add.className = "action-btn";
  add.textContent = ownedBook?.disposition
    ? "In Completed Books"
    : ownedBook
      ? "Already in your library"
      : "＋ Mark as owned";
  add.disabled = Boolean(ownedBook);
  add.addEventListener("click", () => {
    openDialog();
    if (state.session) {
      bookForm.elements.title.value = book.title || "";
      bookForm.elements.author.value = book.author || "";
      bookForm.elements.isbn.value = book.isbn || "";
      bookForm.elements.cover_url.value = book.cover_url
        || (book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg?default=false` : "");
      bookForm.elements.genre.value = book.genre || "";
      bookForm.elements.page_count.value = String(book.page_count || book.pages || "");
    }
  });
  const like = document.createElement("button");
  like.type = "button";
  like.className = "secondary-btn";
  like.textContent = ownedBook?.liked ? "♥ Liked" : "♡ Like";
  like.setAttribute("aria-pressed", String(Boolean(ownedBook?.liked)));
  like.addEventListener("click", () => {
    if (ownedBook) toggleBookLike(ownedBook);
    else showToast("Add this book to your library before liking it.");
  });
  actions.append(add, like);
  if (ownedBook && !ownedBook.disposition && state.shelves.length) {
    const shelfSelect = document.createElement("select");
    shelfSelect.className = "page-shelf-select";
    shelfSelect.setAttribute("aria-label", "Choose a shelf");
    shelfSelect.add(new Option("Choose a shelf", ""));
    state.shelves.forEach((shelf) => {
      shelfSelect.add(new Option(shelf.name, shelf.id));
    });
    const addToShelf = document.createElement("button");
    addToShelf.type = "button";
    addToShelf.className = "secondary-btn";
    addToShelf.textContent = "Add to shelf";
    addToShelf.addEventListener("click", () => {
      const shelf = state.shelves.find((item) => item.id === shelfSelect.value);
      if (shelf) addBookToShelf(ownedBook, shelf);
      else showToast("Choose a shelf first.");
    });
    actions.append(shelfSelect, addToShelf);
  }
  content.append(actions);
  if (ownedBook && !ownedBook.disposition) {
    const readingActions = document.createElement("div");
    readingActions.className = "reading-actions";
    const currentlyReadingLabel = document.createElement("label");
    currentlyReadingLabel.className = "currently-reading-toggle";
    const currentlyReading = document.createElement("input");
    currentlyReading.type = "checkbox";
    currentlyReading.checked = ownedBook.reading_status === "reading";
    currentlyReading.addEventListener("change", () => setReadingStatus(
      ownedBook,
      currentlyReading.checked ? "reading" : ""
    ));
    const toggleTrack = document.createElement("span");
    toggleTrack.className = "toggle-track";
    toggleTrack.setAttribute("aria-hidden", "true");
    const toggleText = document.createElement("span");
    toggleText.textContent = "Currently Reading";
    currentlyReadingLabel.append(currentlyReading, toggleTrack, toggleText);

    const currentPage = document.createElement("input");
    currentPage.type = "number";
    currentPage.min = "0";
    currentPage.step = "1";
    currentPage.value = String(ownedBook.current_page || 0);
    currentPage.className = "current-page-input";
    currentPage.setAttribute("aria-label", "Current page");
    const currentPageField = document.createElement("label");
    currentPageField.className = "current-page-field";
    currentPageField.append(document.createTextNode("Current Page"), currentPage);
    currentPage.addEventListener("change", () => {
      if (currentPage.value.trim()) saveCurrentPage(ownedBook, Number(currentPage.value));
      else showToast("Enter a valid current page (0 or greater).");
    });
    readingActions.append(currentlyReadingLabel, currentPageField);
    content.append(readingActions);
  }
  layout.append(cover, content);
  page.append(header, layout);
  page.append(createBookEditionPicker(book));
  const similar = discoveryBooks.filter((item) => item.genre === book.genre && getBookKey(item) !== getBookKey(book));
  if (similar.length) page.append(createCardRow("More like this", similar.slice(0, 6).map((item) => ({ type: "book", book: item }))));
}

function createBookEditionPicker(book) {
  const section = document.createElement("section");
  section.className = "edition-picker";
  const heading = document.createElement("h2");
  heading.textContent = "Choose an edition and cover";
  const description = document.createElement("p");
  description.className = "page-description";
  description.textContent = `Browse ${getOpenLibraryLanguageName(getDefaultBookLanguage())} editions and choose the cover you prefer.`;
  const loadButton = document.createElement("button");
  loadButton.type = "button";
  loadButton.className = "secondary-btn";
  loadButton.textContent = "Show editions and covers";
  const status = document.createElement("p");
  status.className = "edition-picker-status";
  status.setAttribute("role", "status");
  const choices = document.createElement("div");
  choices.className = "edition-cover-choices";
  section.append(heading, description, loadButton, status, choices);

  loadButton.addEventListener("click", async () => {
    loadButton.disabled = true;
    status.textContent = "Finding editions…";
    choices.replaceChildren();
    try {
      const editions = await getOpenLibraryEditionsForBook(book);
      if (!editions.length) {
        status.textContent = `No ${getOpenLibraryLanguageName(getDefaultBookLanguage())} editions with covers were found.`;
        return;
      }
      status.textContent = `Choose from ${editions.length} edition${editions.length === 1 ? "" : "s"} and available cover${editions.length === 1 ? "" : "s"}.`;
      editions.forEach((edition) => {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = "edition-cover-choice";
        choice.setAttribute("aria-pressed", String(
          book.cover_url === edition.coverUrl && book.isbn === edition.isbn
        ));
        choice.append(createBookCover({
          title: edition.title,
          cover_url: edition.coverUrl,
        }));
        const copy = document.createElement("span");
        copy.className = "edition-cover-copy";
        const title = document.createElement("strong");
        title.textContent = edition.title;
        const metadata = document.createElement("span");
        metadata.textContent = [
          edition.publishDate,
          edition.publisher,
          edition.isbn && `ISBN ${edition.isbn}`,
        ].filter(Boolean).join(" · ") || `${getOpenLibraryLanguageName(getDefaultBookLanguage())} edition`;
        copy.append(title, metadata);
        choice.append(copy);
        choice.addEventListener("click", async () => {
          choice.disabled = true;
          const fields = {
            title: edition.title || book.title,
            isbn: edition.isbn || book.isbn || "",
            cover_url: edition.coverUrl,
            ...(edition.pageCount ? { page_count: edition.pageCount } : {}),
          };
          const ownedBook = state.books.find((item) =>
            (book.id && item.id === book.id) || getBookKey(item) === getBookKey(book)
          );
          if (ownedBook && !await updateBookFields(ownedBook, fields)) {
            choice.disabled = false;
            return;
          }
          Object.assign(book, fields);
          if (ownedBook && ownedBook !== book) {
            Object.assign(ownedBook, fields);
            delete ownedBook.cover_i;
          }
          delete book.cover_i;
          updateBookPageDetails(book);
          choices.querySelectorAll(".edition-cover-choice").forEach((button) => {
            button.setAttribute("aria-pressed", String(button === choice));
          });
          choice.disabled = false;
          showToast(ownedBook ? "Edition updated" : "Edition selected");
        });
        choices.append(choice);
      });
    } catch (error) {
      console.error(error);
      status.textContent = "Could not load editions. Check your connection and try again.";
    } finally {
      loadButton.disabled = false;
    }
  });
  return section;
}

function updateBookPageDetails(book) {
  state.currentBook = book;
  const page = document.getElementById("pageView");
  const heading = page.querySelector(".page-header h1");
  if (heading) heading.textContent = book.title || "Untitled";
  const existingCover = page.querySelector(".book-detail-cover");
  if (existingCover) existingCover.replaceWith(createBookCover(book, "book-detail-cover"));
  const values = {
    ISBN: book.isbn || "—",
    Pages: book.page_count || book.pages || "—",
  };
  page.querySelectorAll(".book-detail-content > p").forEach((field) => {
    const label = field.querySelector("strong")?.textContent.trim();
    if (!label || !(label in values)) return;
    field.replaceChildren(field.querySelector("strong"), document.createTextNode(` ${values[label]}`));
  });
}

async function getOpenLibraryEditionsForBook(book) {
  let workKeys = [];
  const isbn = (book.isbn || "").replace(/[^0-9Xx]/g, "");
  if (isbn) {
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`);
    if (!response.ok) throw new Error(`Open Library ISBN lookup responded with ${response.status}`);
    const result = await response.json();
    const editionKey = result[`ISBN:${isbn}`]?.key;
    if (editionKey && /^\/books\/[^/]+$/.test(editionKey)) {
      const editionResponse = await fetch(`https://openlibrary.org${editionKey}.json`);
      if (!editionResponse.ok) throw new Error(`Open Library edition responded with ${editionResponse.status}`);
      const edition = await editionResponse.json();
      workKeys = (edition.works || []).map((work) => work.key).filter((key) => /^\/works\/[^/]+$/.test(key));
    }
  }

  if (!workKeys.length) {
    const params = new URLSearchParams({
      q: `${book.title || ""} ${book.author || ""} language:${getDefaultBookLanguage()}`.trim(),
      fields: "key,title,author_name",
      limit: "10",
    });
    const response = await fetch(`https://openlibrary.org/search.json?${params}`);
    if (!response.ok) throw new Error(`Open Library search responded with ${response.status}`);
    const result = await response.json();
    const works = Array.isArray(result.docs) ? result.docs : [];
    const normalizedAuthor = (book.author || "").toLowerCase();
    const matchingWork = works.find((work) =>
      (work.author_name || []).some((author) => author.toLowerCase() === normalizedAuthor)
    ) || works[0];
    if (matchingWork?.key && /^\/works\/[^/]+$/.test(matchingWork.key)) workKeys = [matchingWork.key];
  }

  const results = await Promise.all(workKeys.map(async (workKey) => {
    const response = await fetch(`https://openlibrary.org${workKey}/editions.json?limit=100`);
    if (!response.ok) throw new Error(`Open Library editions responded with ${response.status}`);
    const payload = await response.json();
    return Array.isArray(payload.entries) ? payload.entries : [];
  }));
  const language = getDefaultBookLanguage();
  const choices = results.flat().flatMap((edition) => {
    const languages = (edition.languages || []).map((entry) => entry.key.split("/").pop());
    if (!languages.includes(language)) return [];
    const isbn = [...(edition.isbn_13 || []), ...(edition.isbn_10 || [])][0] || "";
    return (edition.covers || [])
      .filter((coverId) => Number.isInteger(coverId) && coverId > 0)
      .map((coverId) => ({
        title: edition.title || book.title || "Untitled",
        isbn,
        coverUrl: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`,
        publisher: edition.publishers?.[0] || "",
        publishDate: edition.publish_date || "",
        pageCount: Number(edition.number_of_pages) || null,
      }));
  });
  return choices.filter((edition, index, all) =>
    all.findIndex((candidate) => candidate.coverUrl === edition.coverUrl && candidate.isbn === edition.isbn) === index
  );
}

function showSearchPage(query = "") {
  state.view = "search";
  state.searchQuery = query;
  updateActiveNavigation("Discover");
  const page = showPage("search");
  page.append(createPageHeader("Discover", query ? `Search results for “${query}”` : "Browse by genre"));
  if (!query) {
    state.searchResults = null;
    state.searchMessage = "";
    state.searchLoading = false;
    const libraryBooks = getLibraryBooks();
    const genres = [...new Set([...libraryBooks.map((book) => book.genre).filter(Boolean), "Fiction", "Nonfiction", "Mystery", "Fantasy", "Essays"])];
    const tiles = genres.map((genre, index) => ({
      title: genre,
      count: libraryBooks.filter((book) => book.genre === genre).length,
      color: ["#8050a8", "#bf613f", "#3f7772", "#536c9e"][index % 4],
    }));
    page.append(createCardRow("Explore genres", tiles.map((genre) => ({ type: "genre", ...genre }))));
    return;
  }

  const matches = state.searchResults || findLocalSearchMatches(query);
  if (state.searchMessage) {
    const message = document.createElement("p");
    message.className = "page-description";
    message.textContent = state.searchMessage;
    page.append(message);
  }
  if (state.searchLoading) {
    const status = document.createElement("p");
    status.className = "page-description search-loading";
    status.setAttribute("role", "status");
    status.textContent = "Searching the book catalog…";
    page.append(status);
  }
  const terms = normalizeSearchText(query).toLowerCase().split(/\s+/).filter(Boolean);
  const shelves = state.shelves.filter((shelf) => terms.every((term) => shelf.name.toLowerCase().includes(term)));
  if (!matches.length && !shelves.length) {
    const empty = document.createElement("p");
    empty.className = "row-empty-state";
    empty.textContent = "No matches yet. Try a different title, author, or genre.";
    page.append(empty);
    return;
  }
  const books = document.createElement("section");
  books.className = "search-result-group";
  books.append(createCardRow("Books", matches.map((book) => ({ type: "book", book })), { emptyMessage: "No books found." }));
  page.append(books);
  const authors = [...new Set(matches.map((book) => book.author).filter(Boolean))];
  if (authors.length) {
    const authorSection = document.createElement("section");
    authorSection.className = "search-result-group";
    const heading = document.createElement("h2");
    heading.textContent = "Authors";
    const list = document.createElement("div");
    list.className = "author-result-list";
    authors.forEach((author) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "author-result";
      button.textContent = author;
      button.addEventListener("click", () => runNaturalSearch(author));
      list.append(button);
    });
    authorSection.append(heading, list);
    page.append(authorSection);
  }
  if (shelves.length) {
    const section = document.createElement("section");
    section.className = "search-result-group";
    section.append(createCardRow("Shelves", shelves.map((shelf) => ({
      type: "shelf",
      name: shelf.name,
      color: shelf.color || "#8b5e3c",
      count: getLibraryBooks().filter((book) => getBookShelfNames(book).includes(shelf.name)).length,
      book: getLibraryBooks().find((book) => getBookShelfNames(book).includes(shelf.name)),
    }))));
    page.append(section);
  }
}

function parseNaturalSearch(query) {
  const lowerQuery = query.toLowerCase();
  const pageMatch = lowerQuery.match(/(?:under|below|less than|up to|at most)\s+(\d+)\s+pages?/);
  const genres = ["science fiction", "non-fiction", "nonfiction", "sci-fi", "mystery", "romance", "fantasy", "history", "horror", "thriller", "poetry", "biography", "memoir", "fiction"];
  const genre = genres.find((item) => new RegExp(`\\b${item.replace("-", "\\-")}\\b`).test(lowerQuery)) || "";
  const moods = ["cozy", "uplifting", "funny", "dark", "romantic", "hopeful", "short", "adventurous", "thoughtful"];
  const mood = moods.find((item) => lowerQuery.includes(item)) || "";
  const cleaned = lowerQuery
    .replace(/(?:under|below|less than|up to|at most)\s+\d+\s+pages?/g, " ")
    .replace(/\b(?:books?|book|find|me|some|a|an|the|with|that|are|is|for|please|read|reading)\b/g, " ")
    .replace(/\b(?:cozy|uplifting|funny|dark|romantic|hopeful|short|adventurous|thoughtful)\b/g, " ")
    .replace(/\b(?:mystery|romance|fantasy|science fiction|sci-fi|history|horror|thriller|poetry|biography|memoir|fiction|nonfiction|non-fiction)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const pageLimit = pageMatch ? Number(pageMatch[1]) : null;
  const queryTerms = [genre, mood, cleaned].filter(Boolean);
  return {
    genre: ["sci-fi"].includes(genre) ? "science fiction" : genre,
    mood,
    pageLimit,
    queryTerms,
    cleaned,
  };
}

function normalizeSearchText(query) {
  return parseNaturalSearch(query).cleaned;
}

function findLocalSearchMatches(query) {
  const parsed = parseNaturalSearch(query);
  const candidates = [...getLibraryBooks(), ...discoveryBooks].filter((book, index, all) =>
    all.findIndex((candidate) => getBookKey(candidate) === getBookKey(book)) === index);
  return candidates.filter((book) => {
    const searchable = [book.title, book.author, book.genre, ...(book.subjects || [])]
      .filter(Boolean).join(" ").toLowerCase();
    if (parsed.genre && !searchable.includes(parsed.genre) && !searchable.includes(parsed.genre.replace("science fiction", "sci-fi"))) return false;
    if (parsed.mood && (book.mood || book.subjects?.length)
      && !searchable.includes(parsed.mood)
      && !book.mood?.toLowerCase().includes(parsed.mood)) return false;
    if (parsed.pageLimit && (!book.pages || Number(book.pages) > parsed.pageLimit)) return false;
    return !parsed.cleaned || parsed.cleaned.split(/\s+/).every((term) => searchable.includes(term));
  });
}

async function runNaturalSearch(query, { updateHistory = true } = {}) {
  if (updateHistory) {
    navigateTo("search", { q: query.trim() });
    return;
  }
  state.searchQuery = query.trim();
  state.searchMessage = "";
  state.searchLoading = false;
  state.searchResults = findLocalSearchMatches(state.searchQuery);
  if (!state.searchQuery) {
    showSearchPage("");
    return;
  }

  const parsed = parseNaturalSearch(state.searchQuery);
  if (state.searchResults.length && !parsed.pageLimit) {
    showSearchPage(state.searchQuery);
    return;
  }
  state.searchLoading = true;
  showSearchPage(state.searchQuery);
  const searchTerms = [...new Set(parsed.queryTerms)];
  try {
    const params = new URLSearchParams({
      q: `${searchTerms.join(" ") || state.searchQuery} language:${getDefaultBookLanguage()}`,
      fields: "key,title,author_name,isbn,cover_i,subject,number_of_pages_median",
      limit: "24",
    });
    const response = await fetch(`https://openlibrary.org/search.json?${params}`);
    if (!response.ok) throw new Error(`Open Library search failed with ${response.status}`);
    const data = await response.json();
    const works = Array.isArray(data.docs) ? data.docs : [];
    const editionResults = await Promise.allSettled(works.map(async (work) => {
      if (!work.key) return null;
      const edition = await getMatchingOpenLibraryEdition(work.key, getDefaultBookLanguage());
      if (!edition) return null;
      const isbnList = [...(edition.isbn_13 || []), ...(edition.isbn_10 || [])];
      return {
        title: edition.title || work.title || "Untitled",
        author: work.author_name?.[0] || "Unknown author",
        author_name: work.author_name || [],
        isbn: isbnList[0] || "",
        isbnList,
        cover_i: edition.covers?.[0],
        subjects: work.subject || [],
        genre: parsed.genre || work.subject?.[0] || "",
        pages: work.number_of_pages_median,
        page_count: work.number_of_pages_median,
      };
    }));
    let editionLookupFailures = 0;
    const externalBooks = editionResults.flatMap((result) => {
      if (result.status === "rejected") {
        editionLookupFailures += 1;
        console.error(result.reason);
        return [];
      }
      const book = result.value;
      return book && (!parsed.pageLimit || (book.pages && book.pages <= parsed.pageLimit)) ? [book] : [];
    });
    state.searchResults = [...state.searchResults, ...externalBooks]
      .filter((book, index, all) => all.findIndex((candidate) => getBookKey(candidate) === getBookKey(book)) === index);
    if (editionLookupFailures) {
      const languageName = getOpenLibraryLanguageName(getDefaultBookLanguage());
      state.searchMessage = `Some matching ${languageName} editions could not be checked; showing verified editions only.`;
    }
    if (!state.searchResults.length && parsed.pageLimit) {
      state.searchMessage = `No results with a verified page count under ${parsed.pageLimit} pages.`;
    } else if (!state.searchResults.length && works.length && !externalBooks.length && !editionLookupFailures) {
      state.searchMessage = `No matching editions found in ${getOpenLibraryLanguageName(getDefaultBookLanguage())}.`;
    }
  } catch (error) {
    console.warn("Natural-language search used local results because Open Library was unavailable.", error);
    state.searchMessage = state.searchResults.length
      ? "Showing local matches; book-catalog search is temporarily unavailable."
      : "Book-catalog search is temporarily unavailable. Try a title, author, or genre in your library.";
  } finally {
    state.searchLoading = false;
  }
  if (state.view === "search" && state.searchQuery === query.trim()) showSearchPage(state.searchQuery);
}

function showStatsPage() {
  updateActiveNavigation("Stats");
  const page = showPage("stats");
  page.append(createPageHeader("Your library", "Your reading collection", "A little look back at the books you have gathered."));
  const libraryBooks = getLibraryBooks();
  const totalValue = libraryBooks.reduce((sum, book) => sum + Number(book.cost || 0), 0);
  const genreCounts = countBy(libraryBooks, (book) => book.genre || "Uncatalogued");
  const authorCounts = countBy(libraryBooks, (book) => book.author || "Unknown author");
  const stats = document.createElement("div");
  stats.className = "stats-grid";
  [
    ["Total books", String(libraryBooks.length)],
    ["Total value", formatCurrency(totalValue)],
    ["Shelves", String(state.shelves.length)],
    ["Top genre", topEntry(genreCounts)],
    ["Top author", topEntry(authorCounts)],
  ].forEach(([label, value]) => {
    const card = document.createElement("article");
    card.className = "stat-card";
    const name = document.createElement("span");
    name.textContent = label;
    const total = document.createElement("strong");
    total.textContent = value;
    card.append(name, total);
    stats.append(card);
  });
  page.append(stats);
}

function showPurchasePage(params = new URLSearchParams(window.location.hash.split("?")[1] || "")) {
  updateActiveNavigation("");
  const title = params.get("title") || "";
  const author = params.get("author") || "";
  const isbn = params.get("isbn") || "";
  const cover = params.get("cover") || "";
  const page = showPage("purchase");
  page.append(createPageHeader("Purchase", title || "Book not found", author));
  if (!title) {
    const message = document.createElement("p");
    message.className = "row-empty-state";
    message.textContent = "This purchase page is missing book details. Return home and choose a book to purchase.";
    page.append(message);
    return;
  }

  const book = { title, author, isbn, cover_url: cover };
  const summary = document.createElement("section");
  summary.className = "purchase-book-summary";
  summary.append(createBookCover(book));
  const details = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = title;
  const byline = document.createElement("p");
  byline.className = "page-description";
  byline.textContent = author || "Unknown author";
  details.append(heading, byline);
  if (isbn) {
    const identifier = document.createElement("p");
    identifier.className = "purchase-isbn";
    identifier.textContent = `ISBN: ${isbn}`;
    details.append(identifier);
  }
  summary.append(details);

  const section = document.createElement("section");
  section.className = "purchase-options";
  const sectionHeading = document.createElement("h2");
  sectionHeading.textContent = "Choose a retailer";
  const retailerList = document.createElement("div");
  retailerList.className = "purchase-retailer-list";
  const searchTerm = isbn || `${title} ${author}`.trim();
  const encodedSearch = encodeURIComponent(searchTerm);
  const retailers = [
    ["Amazon", "Shop new and used editions", `https://www.amazon.com/s?k=${encodedSearch}&i=stripbooks`],
    ["Bookshop.org", "Support independent bookstores", `https://bookshop.org/search?keywords=${encodedSearch}`],
    ["Barnes & Noble", "Browse books and editions", `https://www.barnesandnoble.com/s/${encodedSearch}`],
    ["ThriftBooks", "Find pre-owned copies", `https://www.thriftbooks.com/browse/?b.search=${encodedSearch}`],
    ["Better World Books", "Shop new and used books", `https://www.betterworldbooks.com/search/results?q=${encodedSearch}`],
  ];
  retailers.forEach(([name, description, url]) => {
    const link = document.createElement("a");
    link.className = "purchase-retailer";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const copy = document.createElement("span");
    const retailer = document.createElement("strong");
    retailer.textContent = name;
    const note = document.createElement("span");
    note.textContent = description;
    copy.append(retailer, note);
    const arrow = document.createElement("span");
    arrow.className = "purchase-retailer-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";
    link.append(copy, arrow);
    retailerList.append(link);
  });
  const disclosure = document.createElement("p");
  disclosure.className = "purchase-disclosure";
  disclosure.textContent = "Retailer pages show their own prices, formats, shipping, and availability.";
  section.append(sectionHeading, retailerList, disclosure);
  page.append(summary, section);
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function topEntry(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
}

function render() {
  renderShelfOptions();
  renderStats();
  renderShelves();
  if (state.view === "home") {
    try {
      renderBooks();
    } catch (error) {
      console.error("Could not render the home page", error);
      const section = document.createElement("section");
      section.className = "home-section card-row-section";
      const message = document.createElement("p");
      message.className = "row-empty-state";
      message.textContent = "The home page could not be loaded. Please refresh and try again.";
      section.append(message);
      document.getElementById("homeRows").replaceChildren(section);
      showToast("Could not load the home page.");
    }
  }
  else if (state.view === "shelf") showShelfPage(state.currentShelf);
  else if (state.view === "shelves") showShelvesPage();
  else if (state.view === "search") showSearchPage(state.searchQuery);
  else if (state.view === "stats") showStatsPage();
  else if (state.view === "book") renderBookRoute();
  else if (state.view === "purchase") showPurchasePage();
}

function openDialog() {
  if (!state.session) {
    showToast("Sign in with Google to start your library.");
    openAuthModal();
    return;
  }
  dialogReturnFocus = document.activeElement;
  dialogOverlay.classList.remove("hidden");
  showEntryChoice();
  lookupBookOptionBtn.focus();
}

function showEntryChoice() {
  bookEntryMode = "";
  bookEntryChoice.classList.remove("hidden");
  bookLookupFlow.classList.add("hidden");
  bookDetailsPanel.classList.add("hidden");
}

function startBookLookup() {
  bookEntryMode = "lookup";
  bookEntryChoice.classList.add("hidden");
  bookLookupFlow.classList.remove("hidden");
  bookDetailsPanel.classList.add("hidden");
  setLookupTab("search");
  lookupTitleInput.focus();
}

function setLookupTab(tab) {
  const scanning = tab === "scan";
  if (!scanning) stopCameraScan();
  clearTitleLookupResults();
  lookupSearchTab.classList.toggle("is-active", !scanning);
  lookupSearchTab.setAttribute("aria-selected", String(!scanning));
  lookupSearchTab.tabIndex = scanning ? -1 : 0;
  lookupScanTab.classList.toggle("is-active", scanning);
  lookupScanTab.setAttribute("aria-selected", String(scanning));
  lookupScanTab.tabIndex = scanning ? 0 : -1;
  titleLookupPanel.classList.toggle("hidden", scanning);
  isbnLookupPanel.classList.toggle("hidden", !scanning);
  if (scanning) {
    scanStatus.textContent = "Enter an ISBN or scan the book's barcode with your camera.";
  } else {
    scanStatus.textContent = "Search by title, author, or both.";
  }
}

function startManualEntry() {
  bookEntryMode = "manual";
  bookEntryChoice.classList.add("hidden");
  bookLookupFlow.classList.add("hidden");
  bookDetailsPanel.classList.remove("hidden");
  bookDetailsBackBtn.textContent = "Choose another method";
  bookForm.elements.title.focus();
}

function showBookDetails() {
  bookEntryChoice.classList.add("hidden");
  bookLookupFlow.classList.add("hidden");
  bookDetailsPanel.classList.remove("hidden");
  bookDetailsBackBtn.textContent = bookEntryMode === "lookup" ? "Back to book lookup" : "Choose another method";
  bookForm.elements.title.focus();
}

function closeDialog() {
  dialogOverlay.classList.add("hidden");
  stopCameraScan();
  bookForm.reset();
  lookupTitleInput.value = "";
  lookupAuthorInput.value = "";
  titleSearchResults = [];
  selectedTitleResult = null;
  titleLookupResults.replaceChildren();
  renderSelectedBookConfirmation();
  setLookupTab("search");
  scanStatus.textContent = "Search by title or author.";
  showEntryChoice();
  if (dialogReturnFocus instanceof HTMLElement && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
  dialogReturnFocus = null;
}

function openShelfDrawer() {
  if (window.matchMedia("(max-width: 899px)").matches && sidebar.classList.contains("is-open")) {
    setLibraryDrawerOpen(false);
  }
  if (!state.session) {
    showToast("Sign in with Google to create shelves.");
    openAuthModal();
    return;
  }
  shelfReturnFocus = document.activeElement;
  shelfDrawerOverlay.classList.remove("hidden");
  newShelfInput.focus();
}

function closeShelfDrawer() {
  shelfDrawerOverlay.classList.add("hidden");
  shelfForm.reset();
  if (shelfColorInput) shelfColorInput.value = "#8b5e3c";
  if (shelfReturnFocus instanceof HTMLElement && shelfReturnFocus.isConnected) shelfReturnFocus.focus();
  shelfReturnFocus = null;
}

function openAuthModal() {
  authReturnFocus = document.activeElement;
  setAuthMode("signin");
  authOverlay.classList.remove("hidden");
  authForm.elements.email.focus();
}

function closeAuthModal() {
  authOverlay.classList.add("hidden");
  authForm.reset();
  setAuthMode("signin");
  if (authReturnFocus instanceof HTMLElement && authReturnFocus.isConnected) authReturnFocus.focus();
  authReturnFocus = null;
}

function setAuthMode(nextMode) {
  authMode = nextMode;
  googleAuthOptions.classList.toggle("hidden", nextMode === "reset");
  authForm.elements.password.required = nextMode !== "reset";
  if (nextMode === "reset") {
    authTitle.textContent = "Reset your password";
    authCopy.textContent = "Enter your email and we will send you a secure password reset link.";
    authSubmitBtn.textContent = "Send reset link";
    toggleAuthModeBtn.textContent = "Back to sign in";
    toggleAuthModeBtn.style.display = "inline-flex";
    forgotPasswordBtn.style.display = "none";
    displayNameInput.closest("label").style.display = "none";
    authForm.elements.password.closest("label").style.display = "none";
  } else if (nextMode === "signin") {
    authTitle.textContent = "Sign in to Librito";
    authCopy.textContent = "Choose one way to sign in: continue with Google, or use your email and password.";
    authSubmitBtn.textContent = "Sign in";
    toggleAuthModeBtn.textContent = "Need an account?";
    toggleAuthModeBtn.style.display = "inline-flex";
    forgotPasswordBtn.style.display = "inline-flex";
    displayNameInput.closest("label").style.display = "none";
    authForm.elements.password.closest("label").style.display = "grid";
  } else {
    authTitle.textContent = "Create your Librito profile";
    authCopy.textContent = "Choose one way to create your account: continue with Google, or use email and password. You do not need both.";
    authSubmitBtn.textContent = "Create account";
    toggleAuthModeBtn.textContent = "Already have an account?";
    toggleAuthModeBtn.style.display = "inline-flex";
    forgotPasswordBtn.style.display = "none";
    displayNameInput.closest("label").style.display = "grid";
    authForm.elements.password.closest("label").style.display = "grid";
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 1800);
}

function fillBookDetails({ title, authors = [], isbn = "", publishDate = "", genre = "", coverUrl = "" }) {
  bookForm.elements.title.value = title || "";
  bookForm.elements.author.value = authors.join(", ");
  bookForm.elements.genre.value = genre;
  if (isbn) isbnInput.value = isbn;
  bookForm.elements.cover_url.value = coverUrl;
  bookForm.elements.notes.value = publishDate ? `Published ${publishDate}` : "";
  bookForm.elements.added.value = new Date().toISOString().slice(0, 10);
  showBookDetails();
}

function getBookDescription(result) {
  const sentence = Array.isArray(result.first_sentence) ? result.first_sentence[0] : result.first_sentence;
  if (sentence) return sentence;
  if (Array.isArray(result.subject) && result.subject.length) return result.subject.slice(0, 3).join(" · ");
  const metadata = [result.first_publish_year, result.isbn?.[0] ? `ISBN ${result.isbn[0]}` : ""].filter(Boolean);
  return metadata.join(" · ") || "No description available.";
}

function getOpenLibraryLanguageName(code) {
  return openLibraryLanguages.find(([languageCode]) => languageCode === code)?.[1] || code;
}

async function getMatchingOpenLibraryEdition(workKey, selectedLanguage) {
  const response = await fetch(`https://openlibrary.org${workKey}/editions.json?limit=100`);
  if (!response.ok) throw new Error(`Open Library editions responded with ${response.status}`);
  const payload = await response.json();
  const editions = Array.isArray(payload.entries) ? payload.entries : [];
  const matchingEditions = editions.filter((edition) => {
    const editionLanguages = (edition.languages || []).map((language) => language.key.split("/").pop());
    return !selectedLanguage || editionLanguages.includes(selectedLanguage);
  });
  matchingEditions.sort((first, second) => {
    const editionScore = (edition) => Number(Boolean(edition.covers?.length)) * 2 + Number(Boolean(edition.isbn_13?.length));
    return editionScore(second) - editionScore(first);
  });
  const edition = matchingEditions[0];
  if (!edition) return null;
  const editionLanguages = (edition.languages || []).map((language) => language.key.split("/").pop());
  return { ...edition, language: editionLanguages };
}

function renderTitleSearchResults() {
  titleLookupResults.replaceChildren();
  titleSearchResults.forEach((result, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lookup-result";
    button.setAttribute("aria-pressed", String(selectedTitleResult === result));
    button.append(createBookCover({ ...result, isbnList: result.isbn }));

    const copy = document.createElement("span");
    copy.className = "lookup-result-copy";
    const title = document.createElement("strong");
    title.textContent = result.title || "Untitled";
    const authors = Array.isArray(result.author_name) ? result.author_name : [];
    const authorLine = document.createElement("span");
    authorLine.textContent = authors.join(", ") || "Unknown author";
    const description = document.createElement("span");
    const languageName = result.language?.[0] ? getOpenLibraryLanguageName(result.language[0]) : "";
    description.textContent = [languageName && `${languageName} edition`, getBookDescription(result)].filter(Boolean).join(" · ");
    copy.append(title, authorLine, description);
    button.append(copy);
    button.addEventListener("click", () => {
      selectedTitleResult = titleSearchResults[index];
      renderTitleSearchResults();
      renderSelectedBookConfirmation();
      scanStatus.textContent = `Selected ${result.title || "Untitled"}. Confirm to use this book.`;
      selectedBookConfirmation.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    titleLookupResults.append(button);
  });
}

function renderSelectedBookConfirmation() {
  selectedBookConfirmation.replaceChildren();
  selectedBookConfirmation.classList.toggle("hidden", !selectedTitleResult);
  if (!selectedTitleResult) return;

  const result = selectedTitleResult;
  selectedBookConfirmation.append(createBookCover({ ...result, isbnList: result.isbn }));
  const message = document.createElement("p");
  const authors = Array.isArray(result.author_name) ? result.author_name : [];
  message.textContent = `Use “${result.title || "Untitled"}” by ${authors.join(", ") || "Unknown author"}?`;
  const actions = document.createElement("div");
  actions.className = "selected-book-actions";
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "action-btn";
  confirmButton.textContent = "Use this book";
  confirmButton.addEventListener("click", () => {
    fillBookDetails({
      title: result.title,
      authors,
      isbn: Array.isArray(result.isbn) ? result.isbn[0] || "" : "",
      publishDate: result.first_publish_year ? String(result.first_publish_year) : "",
      genre: Array.isArray(result.subject) ? result.subject[0] || "" : "",
      coverUrl: result.cover_i
        ? `https://covers.openlibrary.org/b/id/${result.cover_i}-L.jpg?default=false`
        : "",
    });
    selectedTitleResult = null;
    titleSearchResults = [];
    titleLookupResults.replaceChildren();
    renderSelectedBookConfirmation();
    scanStatus.textContent = "Book details filled. Review them below and save to your library.";
  });
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "secondary-btn";
  cancelButton.textContent = "Choose another";
  cancelButton.addEventListener("click", () => {
    selectedTitleResult = null;
    renderTitleSearchResults();
    renderSelectedBookConfirmation();
    scanStatus.textContent = "Select the book you want to add.";
  });
  actions.append(confirmButton, cancelButton);
  selectedBookConfirmation.append(message, actions);
}

async function lookupBooksByTitleOrAuthor() {
  const title = lookupTitleInput.value.trim();
  const author = lookupAuthorInput.value.trim();
  if (!title && !author) {
    scanStatus.textContent = "Enter a title, an author, or both to search.";
    return;
  }

  const selectedLanguage = lookupLanguage.value === "all"
    ? ""
    : lookupLanguage.value === "default"
      ? getDefaultBookLanguage()
      : lookupLanguage.value;
  const searchTerms = [title, author].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    q: selectedLanguage ? `${searchTerms} language:${selectedLanguage}` : searchTerms,
    limit: "10",
    fields: "key,title,author_name,first_publish_year,first_sentence,subject",
  });
  scanStatus.textContent = "Searching books…";
  titleSearchResults = [];
  selectedTitleResult = null;
  titleLookupResults.replaceChildren();
  renderSelectedBookConfirmation();

  try {
    const response = await fetch(`https://openlibrary.org/search.json?${params}`);
    if (!response.ok) throw new Error(`Open Library responded with ${response.status}`);
    const payload = await response.json();
    const works = Array.isArray(payload.docs) ? payload.docs : [];
    const editionResults = await Promise.allSettled(works.map(async (work) => {
      if (!work.key) return null;
      const edition = await getMatchingOpenLibraryEdition(work.key, selectedLanguage);
      if (!edition) return null;
      return {
        ...work,
        title: edition.title || work.title,
        isbn: [...(edition.isbn_13 || []), ...(edition.isbn_10 || [])],
        cover_i: edition.covers?.[0],
        language: edition.language,
        first_publish_year: edition.publish_date || work.first_publish_year,
      };
    }));
    let editionLookupFailures = 0;
    titleSearchResults = editionResults.flatMap((result) => {
      if (result.status === "rejected") {
        editionLookupFailures += 1;
        console.error(result.reason);
        return [];
      }
      return result.value ? [result.value] : [];
    });
    if (!titleSearchResults.length) {
      scanStatus.textContent = editionLookupFailures
        ? "Could not verify the language of matching editions. Try again or enter the details manually."
        : `No matching editions found in ${selectedLanguage ? getOpenLibraryLanguageName(selectedLanguage) : "any language"}. You can enter the details manually.`;
      return;
    }

    renderTitleSearchResults();
    scanStatus.textContent = `${titleSearchResults.length} matching editions${editionLookupFailures ? "; some editions could not be checked" : ""}. Select a cover to review and confirm.`;
  } catch (error) {
    console.error(error);
    scanStatus.textContent = "Book search failed. Try again or enter the details manually.";
    showToast("Book search failed");
  }
}

async function lookupBookByIsbn(isbn) {
  const normalized = (isbn || "").replace(/[^0-9Xx]/g, "").trim();
  if (!normalized) {
    showToast("Enter an ISBN first.");
    return;
  }

  scanStatus.textContent = `Looking up ${normalized}…`;
  try {
    let bookData = null;

    try {
      const response = await fetch(`/api/scan?isbn=${encodeURIComponent(normalized)}`);
      if (response.ok) {
        const payload = await response.json();
        bookData = payload.data;
      }
    } catch (error) {
      console.warn("Local API lookup failed, falling back to Open Library", error);
    }

    if (!bookData) {
      const openLibraryResponse = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(normalized)}&format=json&jscmd=data`);
      if (!openLibraryResponse.ok) throw new Error("Lookup failed");
      const openLibraryPayload = await openLibraryResponse.json();
      bookData = openLibraryPayload[`ISBN:${normalized}`] || null;
    }

    if (!bookData) {
      scanStatus.textContent = "No metadata found for that ISBN. You can enter the details manually.";
      return;
    }

    const authors = Array.isArray(bookData.authors)
      ? bookData.authors.map((author) => author.name).filter(Boolean)
      : [];

    fillBookDetails({
      title: bookData.title,
      authors,
      isbn: normalized,
      publishDate: bookData.publish_date || "",
      coverUrl: bookData.cover?.large || "",
    });
    scanStatus.textContent = `Loaded ${bookData.title}`;
    showToast("Book profile filled from ISBN lookup");
  } catch (error) {
    console.error(error);
    scanStatus.textContent = "Lookup failed. Try again or enter the details manually.";
    showToast("Lookup failed");
  }
}

async function startCameraScan() {
  if (!navigator.mediaDevices?.getUserMedia) {
    scanStatus.textContent = "Camera access is not available in this browser. Enter the ISBN manually.";
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    scannerVideo.srcObject = cameraStream;
    scannerVideo.style.display = "block";
    scanStatus.textContent = "Scanning… point the camera at the barcode.";

    if ("BarcodeDetector" in window) {
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "qr_code"] });
      const runDetection = async () => {
        if (!cameraStream) return;
        try {
          const barcodes = await detector.detect(scannerVideo);
          if (barcodes.length) {
            const value = barcodes[0].rawValue;
            isbnInput.value = value;
            scanStatus.textContent = `Detected ${value}`;
            await lookupBookByIsbn(value);
            stopCameraScan();
            return;
          }
        } catch (error) {
          console.warn("Barcode scan failed", error);
        }
        barcodeLoopTimer = window.setTimeout(runDetection, 700);
      };
      runDetection();
    } else {
      const { BrowserMultiFormatReader } = await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm");
      const reader = new BrowserMultiFormatReader();
      scanStatus.textContent = "Scanning… point the camera at the barcode.";
      reader.decodeFromVideoElement(scannerVideo, async (result) => {
        if (!result || !cameraStream) return;
        const value = result.getText();
        isbnInput.value = value;
        scanStatus.textContent = `Detected ${value}`;
        await lookupBookByIsbn(value);
        reader.reset();
        stopCameraScan();
      });
    }
  } catch (error) {
    console.error(error);
    stopCameraScan();
    scanStatus.textContent = error?.name === "NotAllowedError" || error?.name === "SecurityError"
      ? "Camera access was denied or blocked. Allow camera access on a secure page, or enter the ISBN manually."
      : "Could not start the barcode scanner. Check camera availability and your connection, or enter the ISBN manually.";
  }
}

function stopCameraScan() {
  if (barcodeLoopTimer) {
    window.clearTimeout(barcodeLoopTimer);
    barcodeLoopTimer = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  scannerVideo.style.display = "none";
  scannerVideo.srcObject = null;
}

function initializeSupabase() {
  if (!supabaseInitialization) {
    supabaseInitialization = initializeSupabaseOnce();
  }
  return supabaseInitialization;
}

async function initializeSupabaseOnce() {
  try {
    state.supabase = createSupabaseClient();
    const { data: { session } } = await state.supabase.auth.getSession();
    state.session = session;
    updateAuthButton();

    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      updateAuthButton();
      if (session) {
        if (sessionStorage.getItem(oauthRedirectKey) === "true") {
          authPrompted = true;
          sessionStorage.removeItem(oauthRedirectKey);
        }
        state.loading = true;
        state.loadError = "";
        state.books = [];
        state.shelves = [];
        render();
        loadFromSupabase().catch(handleLibraryLoadFailure);
      } else {
        authPrompted = false;
        state.loading = false;
        state.loadError = "";
        state.books = loadBooks();
        state.shelves = [];
        render();
      }
    });

    if (!session) {
      state.loading = false;
      state.books = loadBooks();
      render();
      if (!authPrompted) {
        openAuthModal();
      }
      return;
    }

    state.books = [];
    state.shelves = [];
    state.loading = true;
    state.loadError = "";
    render();
    loadFromSupabase().catch(handleLibraryLoadFailure);
  } catch (error) {
    console.error(error);
    state.loading = false;
    state.loadError = "";
    state.books = loadBooks();
    render();
    if (!authPrompted) {
      openAuthModal();
    }
    showToast("Supabase is not configured yet. Using local demo data.");
  }
}

function handleLibraryLoadFailure(error) {
  console.error(error);
  state.loading = false;
  state.loadError = "Your library could not be loaded. Check your connection and try again.";
  render();
  showToast("Could not load your books.");
}

async function refreshAuthSession() {
  await initializeSupabase();
  if (!state.supabase) return null;

  const { data, error } = await state.supabase.auth.getSession();
  if (error) throw error;
  state.session = data.session;
  updateAuthButton();
  return state.session;
}

async function ensureProfile(displayName = "") {
  if (!state.supabase || !state.session) return;
  const user = state.session.user;
  const { data, error } = await state.supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email,
        full_name: displayName || user.user_metadata?.full_name || user.email,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) {
    console.error(error);
    return;
  }
  state.profile = data;
}

async function loadShelvesFromSupabase() {
  if (!state.supabase || !state.session) return;
  const { data, error } = await state.supabase.from("shelves").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    showToast("Could not load your shelves.");
    return;
  }
  state.shelves = data || [];
}

async function createShelfInSupabase() {
  const name = newShelfInput.value.trim();
  if (!name) {
    showToast("Name your shelf first.");
    return;
  }
  if (["currently reading", "completed books"].includes(name.toLowerCase())) {
    showToast(`${name} is a generated shelf. Choose another name.`);
    return;
  }
  let session;
  try {
    session = await refreshAuthSession();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not check your account. Try again.");
    return;
  }
  if (!session) {
    showToast("Sign in to save shelves.");
    openAuthModal();
    return;
  }

  const { data, error } = await state.supabase
    .from("shelves")
    .insert({ name, color: shelfColorInput?.value || "#8b5e3c", user_id: session.user.id })
    .select("*")
    .single();

  if (error) {
    console.error(error);
    showToast("Could not create shelf.");
    return;
  }

  state.shelves = [data, ...state.shelves.filter((item) => item.id !== data.id)];
  newShelfInput.value = "";
  if (shelfColorInput) shelfColorInput.value = "#8b5e3c";
  render();
  closeShelfDrawer();
  showToast("Shelf created");
}

async function loadFromSupabase() {
  if (!state.supabase || !state.session) return false;
  await ensureProfile();
  await loadShelvesFromSupabase();
  const { data, error } = await state.supabase.from("books").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    state.loading = false;
    state.loadError = "Your library could not be loaded. Check your connection and try again.";
    render();
    showToast("Could not load your books.");
    return false;
  }
  const books = (data || []).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    genre: book.genre || "",
    isbn: book.isbn || "",
    cover_url: book.cover_url || "",
    shelf: book.shelf,
    reading_status: book.reading_status || "",
    disposition: book.disposition || "",
    current_page: Number(book.current_page || 0),
    page_count: book.page_count ? Number(book.page_count) : null,
    cost: Number(book.cost || 0),
    added: book.added_on || book.created_at,
    notes: book.notes || "",
    shelves: [],
    liked: false,
  }));
  const { data: shelfLinks, error: linksError } = await state.supabase
    .from("book_shelves")
    .select("book_id,shelf_id,shelves(name)");
  if (linksError) {
    console.error(linksError);
    showToast("Shelf membership needs the latest Supabase schema; showing legacy shelf assignments.");
    books.forEach((book) => {
      if (book.shelf) book.shelves.push(book.shelf);
    });
  } else {
    (shelfLinks || []).forEach((link) => {
      const book = books.find((item) => item.id === link.book_id);
      const joinedShelf = Array.isArray(link.shelves) ? link.shelves[0] : link.shelves;
      if (book && joinedShelf?.name && !book.shelves.includes(joinedShelf.name)) book.shelves.push(joinedShelf.name);
    });
    books.forEach((book) => {
      if (!book.shelves.length && book.shelf && state.shelves.some((shelf) => shelf.name === book.shelf)) {
        book.shelves.push(book.shelf);
      }
    });
  }
  const { data: likedRows, error: likedError } = await state.supabase
    .from("liked_books")
    .select("book_id");
  if (likedError) {
    console.error(likedError);
    showToast("Liked Books needs the latest Supabase schema.");
  } else {
    const likedIds = new Set((likedRows || []).map((row) => row.book_id));
    books.forEach((book) => { book.liked = likedIds.has(book.id); });
  }
  state.books = books;
  state.loading = false;
  state.loadError = "";
  render();
  return true;
}

async function saveBookToSupabase(book) {
  if (!state.supabase || !state.session) {
    showToast("Your account connection is unavailable. The book was not saved; try again.");
    return false;
  }

  const payload = {
    id: book.id,
    title: book.title,
    author: book.author,
    genre: book.genre || null,
    isbn: book.isbn || null,
    cover_url: book.cover_url || null,
    shelf: book.shelf || null,
    reading_status: book.reading_status || null,
    disposition: book.disposition || null,
    current_page: Number(book.current_page || 0),
    page_count: book.page_count || null,
    cost: Number(book.cost || 0),
    added_on: book.added,
    notes: book.notes || null,
    user_id: state.session.user.id,
  };

  const { data: savedBook, error } = await runBookSchemaRetry(async (candidate) => {
    const { data, error: insertError } = await state.supabase
      .from("books")
      .insert(candidate)
      .select("id")
      .single();
    return { data, error: insertError };
  }, payload);
  if (error || !savedBook) {
    console.error(error || new Error("Supabase did not confirm the inserted book."));
    showToast(getSchemaUpgradeMessage(error) || error?.message || "Could not save your book. Check your connection and try again.");
    return false;
  }

  let shelfMembershipSaved = true;
  const shelf = state.shelves.find((item) => item.name === book.shelf);
  if (shelf) {
    try {
      const { error: shelfError } = await state.supabase.from("book_shelves").insert({
        book_id: book.id,
        shelf_id: shelf.id,
        user_id: state.session.user.id,
      });
      if (shelfError) {
        console.error(shelfError);
        shelfMembershipSaved = false;
      }
    } catch (shelfError) {
      console.error(shelfError);
      shelfMembershipSaved = false;
    }
  }
  let libraryLoaded = false;
  try {
    libraryLoaded = await loadFromSupabase();
  } catch (error) {
    console.error(error);
  }
  if (!shelfMembershipSaved) {
    showToast("Book saved, but shelf membership could not be saved. Run the latest Supabase schema.");
    return true;
  }
  if (!libraryLoaded || !state.books.some((item) => item.id === savedBook.id)) {
    showToast("Book saved, but it could not be confirmed in your library. Refresh the page to check.");
    return true;
  }
  showToast("Book saved to your library");
  return true;
}

document.querySelectorAll(".sidebar-filters .category-tab").forEach((tab) => {
  tab.addEventListener("click", () => setShelfFilter(tab.textContent.trim()));
});

globalSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = globalSearchInput.value.trim();
  await runNaturalSearch(query);
});

document.getElementById("topHomeBtn").addEventListener("click", () => {
  navigateTo("home");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("popstate", restoreRouteFromLocation);

libraryToggleBtn.addEventListener("click", () => {
  setLibraryDrawerOpen(!sidebar.classList.contains("is-open"));
});
document.getElementById("closeLibraryBtn").addEventListener("click", () => setLibraryDrawerOpen(false));
sidebarBackdrop.addEventListener("click", () => setLibraryDrawerOpen(false));

document.querySelectorAll(".nav-pill").forEach((item) => {
  item.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 899px)").matches) setLibraryDrawerOpen(false);
    if (item.textContent.includes("Home")) navigateTo("home");
    if (item.textContent.includes("Your shelves")) navigateTo("shelves");
    if (item.textContent.includes("Discover")) runNaturalSearch("");
    if (item.textContent.includes("Stats")) navigateTo("stats");
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!shelfDrawerOverlay.classList.contains("hidden")) closeShelfDrawer();
    else if (!authOverlay.classList.contains("hidden")) closeAuthModal();
    else if (!dialogOverlay.classList.contains("hidden")) closeDialog();
    else if (!bookProfileOverlay.classList.contains("hidden")) closeBookProfile();
    else if (document.body.classList.contains("library-drawer-open")) setLibraryDrawerOpen(false);
    else document.querySelectorAll(".card-menu[open], .account-menu[open]").forEach((menu) => { menu.open = false; });
    return;
  }

  if (event.key === "Tab") {
    const activeOverlay = [...document.querySelectorAll(".dialog-overlay:not(.hidden) [role='dialog']")].at(-1);
    if (!activeOverlay) return;
    const focusable = [...activeOverlay.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.closest(".hidden"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

openModalBtn.addEventListener("click", () => {
  openDialog();
});

lookupBookOptionBtn.addEventListener("click", () => {
  startBookLookup();
});

manualBookOptionBtn.addEventListener("click", () => {
  startManualEntry();
});

lookupBackBtn.addEventListener("click", () => {
  stopCameraScan();
  showEntryChoice();
  lookupBookOptionBtn.focus();
});

manualEntryFromLookupBtn.addEventListener("click", () => {
  stopCameraScan();
  startManualEntry();
});

bookDetailsBackBtn.addEventListener("click", () => {
  if (bookEntryMode === "lookup") {
    bookDetailsPanel.classList.add("hidden");
    bookLookupFlow.classList.remove("hidden");
    (lookupScanTab.getAttribute("aria-selected") === "true" ? lookupScanTab : lookupSearchTab).focus();
  } else {
    showEntryChoice();
    manualBookOptionBtn.focus();
  }
});

lookupSearchTab.addEventListener("click", () => setLookupTab("search"));

lookupScanTab.addEventListener("click", () => setLookupTab("scan"));

scanIsbnBtn.addEventListener("click", () => {
  startCameraScan();
});

lookupSearchTab.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") {
    event.preventDefault();
    lookupScanTab.focus();
    setLookupTab("scan");
  }
});

lookupScanTab.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    lookupSearchTab.focus();
    setLookupTab("search");
  }
});

function clearTitleLookupResults() {
  titleLookupResults.replaceChildren();
  titleSearchResults = [];
  selectedTitleResult = null;
  renderSelectedBookConfirmation();
}

lookupTitleBtn.addEventListener("click", () => {
  lookupBooksByTitleOrAuthor();
});

lookupTitleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupBooksByTitleOrAuthor();
  }
});

lookupAuthorInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupBooksByTitleOrAuthor();
  }
});

isbnInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    lookupBookByIsbn(isbnInput.value);
  }
});

lookupIsbnBtn.addEventListener("click", () => {
  lookupBookByIsbn(isbnInput.value || "");
});

shelfForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createShelfInSupabase();
});

closeShelfDrawerBtn.addEventListener("click", () => {
  closeShelfDrawer();
});

shelfDrawerOverlay.addEventListener("click", (event) => {
  if (event.target === shelfDrawerOverlay) {
    closeShelfDrawer();
  }
});

authButton.addEventListener("click", async () => {
  let session;
  try {
    session = await refreshAuthSession();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not check your account. Try again.");
    return;
  }
  if (session) {
    try {
      const { error } = await state.supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not sign out.");
      return;
    }
    state.session = null;
    state.profile = null;
    state.books = loadBooks();
    state.shelves = [];
    render();
    updateAuthButton();
    showToast("Signed out");
    return;
  }
  openAuthModal();
});

toggleAuthModeBtn.addEventListener("click", () => {
  setAuthMode(authMode === "reset" ? "signin" : authMode === "signup" ? "signin" : "signup");
});

googleAuthBtn.addEventListener("click", async () => {
  await initializeSupabase();
  if (!state.supabase) {
    showToast("Authentication is not configured. Check the Supabase settings.");
    return;
  }

  googleAuthBtn.disabled = true;
  googleAuthBtn.textContent = "Connecting to Google…";
  sessionStorage.setItem(oauthRedirectKey, "true");
  try {
    const { error } = await state.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    });
    if (error) throw error;
  } catch (error) {
    console.error(error);
    sessionStorage.removeItem(oauthRedirectKey);
    googleAuthBtn.disabled = false;
    googleAuthBtn.textContent = "Continue with Google";
    showToast(error.message || "Could not connect to Google.");
  }
});

forgotPasswordBtn.addEventListener("click", () => {
  setAuthMode("reset");
  authForm.elements.email.focus();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await initializeSupabase();
  if (!state.supabase) {
    showToast("Authentication is not configured. Check the Supabase settings.");
    return;
  }

  const formData = new FormData(authForm);
  const displayName = formData.get("displayName").toString().trim();
  const email = formData.get("email").toString().trim();
  const password = formData.get("password").toString();
  if (!email) {
    showToast("Email is required.");
    return;
  }

  if (authMode !== "reset" && !password) {
    showToast("Password is required.");
    return;
  }

  if (authMode === "signup" && !displayName) {
    showToast("Add a username to create your account.");
    return;
  }

  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = authMode === "signup" ? "Creating…" : authMode === "reset" ? "Sending…" : "Signing in…";
  authPrompted = true;

  try {
    if (authMode === "signup") {
      const { data, error } = await state.supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: displayName },
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });
      if (error) throw error;

      if (!data.session) {
        closeAuthModal();
        showToast("Account created. Check your email to confirm it, then sign in.");
        return;
      }

      state.session = data.session;
      updateAuthButton();
      await ensureProfile(displayName);
      closeAuthModal();
      showToast("Account created");
    } else if (authMode === "reset") {
      const { error } = await state.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthRedirectUrl(),
      });
      if (error) throw error;
      closeAuthModal();
      showToast("Check your email for a password reset link.");
    } else {
      const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      state.session = data.session;
      updateAuthButton();
      await ensureProfile(displayName || data.user?.user_metadata?.full_name || "");
      closeAuthModal();
      showToast("Signed in");
    }
  } catch (error) {
    console.error(error);
    authPrompted = false;
    const message = error.message?.toLowerCase().includes("fetch")
      ? "Could not reach Supabase. Check that the project is running and try again."
      : error.message || "Authentication failed";
    showToast(message);
  } finally {
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = authMode === "signup" ? "Create account" : authMode === "reset" ? "Send reset link" : "Sign in";
  }
});

closeAuthBtn.addEventListener("click", () => {
  closeAuthModal();
});

authOverlay.addEventListener("click", (event) => {
  if (event.target === authOverlay) {
    closeAuthModal();
  }
});

closeDialogBtn.addEventListener("click", () => {
  stopCameraScan();
  closeDialog();
});

dialogOverlay.addEventListener("click", (event) => {
  if (event.target === dialogOverlay) {
    stopCameraScan();
    closeDialog();
  }
});

closeBookProfileBtn.addEventListener("click", () => {
  closeBookProfile();
});

bookProfileOverlay.addEventListener("click", (event) => {
  if (event.target === bookProfileOverlay) {
    closeBookProfile();
  }
});

bookForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.session) {
    showToast("Sign in with Google to save books.");
    openAuthModal();
    return;
  }

  const formData = new FormData(bookForm);
  const book = {
    id: crypto.randomUUID(),
    title: formData.get("title").toString().trim(),
    author: formData.get("author").toString().trim(),
    shelf: formData.get("shelf").toString().trim(),
    cost: Number(formData.get("cost") || 0),
    added: formData.get("added").toString().trim(),
    notes: formData.get("notes").toString().trim(),
    isbn: formData.get("isbn").toString().trim(),
    cover_url: formData.get("cover_url").toString().trim(),
    genre: formData.get("genre").toString().trim(),
    page_count: Number(formData.get("page_count") || 0) || null,
    shelves: [],
  };
  if (book.shelf) book.shelves.push(book.shelf);

  if (!book.title || !book.author || !book.added) {
    showToast("Fill in the essentials first.");
    return;
  }

  saveBookBtn.disabled = true;
  saveBookBtn.textContent = "Saving...";
  try {
    if (await saveBookToSupabase(book)) closeDialog();
  } catch (error) {
    console.error(error);
    showToast(error.message || "Could not save your book. Try again.");
  } finally {
    saveBookBtn.disabled = false;
    saveBookBtn.textContent = "Save to Library";
  }
});

initializeBookLanguageOptions();
state.books = loadBooks();
state.loading = false;
updateAuthButton();
restoreRouteFromLocation();
initializeSupabase();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
}
