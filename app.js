import { createSupabaseClient } from "./lib/supabase-client.js";

const storageKey = "librito-library-v1";
const shelvesStorageKey = "librito-shelves-v1";
const bookMetaKey = "librito-book-meta-v1";
let bookMetaStore = null;
const bookMetaPending = new Map();
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
  searchLanguage: "default",
  searchPage: 1,
  searchSort: "",
  searchFilters: {},
  searchMessage: "",
  searchLoading: false,
  loading: true,
  loadError: "",
  dismissedRecommendations: new Set(),
  catalogBooks: [],
  catalogLibraryKey: "",
  catalogRequestKey: "",
  catalogLoading: false,
  catalogError: "",
  recommendationPool: [],
  library: { query: "" },
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
const closeDialogBtn = document.getElementById("closeDialogBtn");
const bookEntryChoice = document.getElementById("bookEntryChoice");
const scanBookOptionBtn = document.getElementById("scanBookOptionBtn");
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
const globalSearchLanguage = document.getElementById("globalSearchLanguage");
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
let recommendationRotationTimer = null;
let lastRecommendationScrollAt = 0;
const allGenres = [
  "Fiction", "Nonfiction", "Mystery", "Fantasy", "Essays", "Science Fiction", "Romance", "Thriller",
  "Historical Fiction", "Horror", "Biography", "Memoir", "History", "Science", "Philosophy", "Poetry",
  "Self-Help", "Business", "Young Adult", "Children's", "Classics", "Graphic Novels", "Cooking", "Travel",
  "Art", "Religion", "Psychology", "Humor",
];
const homeRowBookCount = 24;
const recommendationRotationInterval = 3 * 60 * 1000;
const recommendationScrollPause = 2000;
let selectedBook = null;
let titleSearchResults = [];
let selectedTitleResult = null;
let bookEntryMode = "";
let dialogReturnFocus = null;
let shelfReturnFocus = null;
let authReturnFocus = null;
let bookProfileReturnFocus = null;
let editionDialogOverlay = null;
let editionDialogReturnFocus = null;
let appDialogOverlay = null;
let appDialogResolver = null;
let appDialogReturnFocus = null;
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
    ...state.catalogBooks,
    ...discoveryBooks,
  ];
  const matchingBook = books.find((book) => id
    ? book.id === id
    : book.title === title && book.author === author);
  if (matchingBook) return matchingBook;
  if (!title || (id && state.loading)) return null;
  return {
    title,
    author: author || "",
    genre: params.get("genre") || "",
    isbn: params.get("isbn") || "",
    cover_url: params.get("cover_url") || "",
    cover_i: params.get("cover_i") || "",
    page_count: Number(params.get("page_count")) || null,
  };
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
    case "/library":
      showLibraryPage();
      break;
    case "/shelf":
      showShelfPage(params.get("name") || "");
      break;
    case "/suggested-shelf":
      showSuggestedShelfPage(params.get("key") || "");
      break;
    case "/list":
      showCardListPage(params.get("key") || "");
      break;
    case "/genre":
      showGenrePage(params.get("name") || "", params.get("sort") || "", Math.max(1, Number(params.get("page")) || 1), Number(params.get("size")) || 0, {
        year: params.get("year") || "",
        len: params.get("len") || "",
        rating: params.get("rating") || "",
        lang: params.get("lang") || "",
      });
      break;
    case "/search":
      runNaturalSearch(params.get("q") || "", {
        updateHistory: false,
        language: params.get("lang") || "default",
      });
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

function loadLocalShelves() {
  try {
    const saved = localStorage.getItem(shelvesStorageKey);
    if (saved) {
      const shelves = JSON.parse(saved);
      if (Array.isArray(shelves)) return shelves;
      throw new TypeError("Saved shelves must be an array.");
    }
  } catch (error) {
    console.warn("Could not read saved shelves", error);
  }
  return [...new Set(state.books.flatMap((book) => getBookShelfNames(book)))]
    .map((name) => ({ id: `local:${name}`, name, color: "#8b5e3c" }));
}

function getLibraryBooks() {
  const meta = readBookMeta();
  return state.books.filter((book) => !book.disposition).map((book) => {
    applyBookMeta(book, meta[getBookKey(book)]);
    return book;
  });
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
  const updatedFields = { ...fields };
  if (("current_page" in updatedFields || "page_count" in updatedFields || "reading_status" in updatedFields)
    && !("edition_progress" in updatedFields)) {
    const progress = { ...(book.edition_progress || {}) };
    const editionKey = getBookEditionProgressKey(book);
    if (editionKey) {
      progress[editionKey] = {
        current_page: Number(updatedFields.current_page ?? book.current_page ?? 0),
        page_count: updatedFields.page_count === undefined
          ? (book.page_count ?? book.pages ?? null)
          : updatedFields.page_count,
        reading_status: updatedFields.reading_status === undefined
          ? (book.reading_status || "")
          : updatedFields.reading_status,
      };
      updatedFields.edition_progress = progress;
    }
  }
  if (state.supabase && state.session) {
    const result = await runBookSchemaRetry(async (candidate) => {
      const { error } = await state.supabase.from("books")
        .update(candidate)
        .eq("id", book.id)
        .eq("user_id", state.session.user.id);
      return { error };
    }, updatedFields);

    if (result.error) {
      console.error(result.error);
      showToast(getSchemaUpgradeMessage(result.error) || "Could not update this book. Run the latest Supabase schema first.");
      return false;
    }
  }
  Object.assign(book, updatedFields);
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
  const confirmed = await showAppConfirm(
    `Mark “${book.title}” as ${action}? It will stay in Completed Books and be hidden from your active library.`,
    { title: `Mark book as ${action}`, confirmLabel: `Mark as ${action}` }
  );
  if (!confirmed) return;
  const updated = await updateBookFields(book, { disposition });
  if (!updated) return;
  render();
  showToast(`Marked as ${action}`);
}

async function saveCurrentPage(book, currentPage) {
  if (!Number.isInteger(currentPage) || currentPage < 0) {
    showToast("Enter a valid bookmarked page (0 or greater).");
    return;
  }
  const pageCount = Number(book.page_count || book.pages);
  if (Number.isInteger(pageCount) && pageCount > 0 && currentPage > pageCount) {
    showToast(`Bookmarked page cannot exceed ${pageCount}.`);
    return;
  }
  const updated = await updateBookFields(book, {
    current_page: currentPage,
    bookmarked_at: new Date().toISOString(),
  });
  if (!updated) return;
  render();
  showToast("Page bookmarked");
}

async function setBookBookmark(book) {
  const hasBookmark = Number(book.current_page) > 0;
  const value = await showAppPrompt("Choose the page to bookmark.", {
    title: hasBookmark ? "Move bookmark" : "Set bookmark",
    confirmLabel: hasBookmark ? "Move bookmark" : "Set bookmark",
    value: String(book.current_page || 0),
    placeholder: "Page number",
  });
  if (value === null) return;
  const pageNumber = value.trim() ? Number(value) : Number.NaN;
  if (!Number.isInteger(pageNumber)) {
    showToast("Enter a whole page number.");
    return;
  }
  await saveCurrentPage(book, pageNumber);
}

async function addBookToShelf(book, shelf) {
  if (!shelf?.id) {
    showToast("Choose a valid shelf.");
    return;
  }
  const names = getBookShelfNames(book);
  if (names.includes(shelf.name)) {
    showToast("This book is already on that shelf.");
    return;
  }
  if (state.supabase && state.session) {
    if (!book.id) {
      showToast("This book must be in your library before it can be added to a shelf.");
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
  }
  book.shelves = [...names, shelf.name];
  book.shelf ||= shelf.name;
  if (state.session) render();
  else saveBooks();
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
  const confirmed = await showAppConfirm(`Remove “${book.title}” from your library?`, {
    title: "Remove book",
    confirmLabel: "Remove book",
    danger: true,
  });
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
  if (state.supabase && state.session) {
    const { error } = await state.supabase.from("shelves")
      .update({ name })
      .eq("id", shelf.id)
      .eq("user_id", state.session.user.id);
    if (error) {
      console.error(error);
      showToast("Could not rename shelf.");
      return;
    }
  }
  const oldName = shelf.name;
  shelf.name = name;
  state.books.forEach((book) => {
    if (book.shelf === oldName) book.shelf = name;
    book.shelves = getBookShelfNames(book).map((item) => item === oldName ? name : item);
  });
  if (!state.session) {
    localStorage.setItem(shelvesStorageKey, JSON.stringify(state.shelves));
    localStorage.setItem(storageKey, JSON.stringify(state.books));
  }
  navigateTo("shelf", { name });
  renderShelves();
  showToast("Shelf renamed");
}

async function deleteShelf(shelf) {
  if (state.supabase && state.session) {
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
  }
  state.shelves = state.shelves.filter((item) => item.id !== shelf.id);
  state.books.forEach((book) => {
    book.shelves = getBookShelfNames(book).filter((name) => name !== shelf.name);
    if (book.shelf === shelf.name) book.shelf = book.shelves[0] || "";
  });
  if (!state.session) {
    localStorage.setItem(shelvesStorageKey, JSON.stringify(state.shelves));
    localStorage.setItem(storageKey, JSON.stringify(state.books));
  }
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

function formatBookmarkTimestamp(value) {
  if (!value) return "Not bookmarked yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Bookmark time unavailable";
  return `Last bookmarked ${new Intl.DateTimeFormat(navigator.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
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
    image.loading = className.includes("book-loader-art") ? "eager" : "lazy";
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
  updateAdminLink();
}

async function updateAdminLink() {
  const link = document.getElementById("adminLink");
  if (!link) return;
  link.hidden = true;
  if (!state.supabase || !state.session) return;
  const userId = state.session.user.id;
  const { data } = await state.supabase.rpc("is_admin");
  if (data === true && state.session?.user.id === userId) link.hidden = false;
}

function getDefaultBookLanguage() {
  const language = navigator.language.split("-")[0].toLowerCase();
  return browserLanguageCodes[language] || "eng";
}

function fillLanguageSelect(select, allLabel = "All languages") {
  const defaultLanguage = getDefaultBookLanguage();
  const defaultName = openLibraryLanguages.find(([code]) => code === defaultLanguage)?.[1]
    || new Intl.DisplayNames([navigator.language], { type: "language" }).of(navigator.language.split("-")[0])
    || defaultLanguage;
  select.replaceChildren(new Option(`Default (${defaultName})`, "default"));
  openLibraryLanguages
    .filter(([code]) => code !== defaultLanguage)
    .forEach(([code, name]) => select.add(new Option(name, code)));
  select.add(new Option(allLabel, "all"));
}

function initializeBookLanguageOptions() {
  fillLanguageSelect(lookupLanguage, "Any language");
  fillLanguageSelect(globalSearchLanguage);
  buildGlobalSearchLanguageMenu();
}

let syncGlobalSearchLanguageMenu = () => {};

// Replaces the native select UI with the same menu used by the edition language finder.
function buildGlobalSearchLanguageMenu() {
  const menu = document.createElement("div");
  menu.className = "edition-language-menu global-language-menu";
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "edition-language-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "Search language");
  const triggerText = document.createElement("span");
  trigger.append(triggerText);
  const list = document.createElement("div");
  list.className = "edition-language-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  const addGroup = (title, options) => {
    const groupTitle = document.createElement("div");
    groupTitle.className = "edition-language-group";
    groupTitle.textContent = title;
    list.append(groupTitle);
    options.forEach((source) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "edition-language-option";
      option.setAttribute("role", "option");
      option.dataset.value = source.value;
      option.textContent = source.textContent;
      list.append(option);
    });
  };
  const sourceOptions = [...globalSearchLanguage.options];
  addGroup("Any language", sourceOptions.filter((o) => o.value === "all"));
  addGroup("Your language", sourceOptions.filter((o) => o.value === "default"));
  addGroup("Specific language", sourceOptions.filter((o) => o.value !== "all" && o.value !== "default"));

  syncGlobalSearchLanguageMenu = () => {
    const selected = globalSearchLanguage.selectedOptions[0];
    triggerText.textContent = selected ? selected.textContent : "Language";
    list.querySelectorAll(".edition-language-option").forEach((option) => {
      option.setAttribute("aria-selected", String(option.dataset.value === globalSearchLanguage.value));
    });
  };
  const setOpen = (open) => {
    list.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  trigger.addEventListener("click", () => setOpen(list.hidden));
  list.addEventListener("click", (event) => {
    const option = event.target.closest(".edition-language-option");
    if (!option) return;
    globalSearchLanguage.value = option.dataset.value;
    globalSearchLanguage.dispatchEvent(new Event("change"));
    setOpen(false);
    trigger.focus();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !list.hidden) {
      setOpen(false);
      trigger.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target)) setOpen(false);
  });
  globalSearchLanguage.addEventListener("change", syncGlobalSearchLanguageMenu);

  globalSearchLanguage.hidden = true;
  globalSearchLanguage.tabIndex = -1;
  menu.append(trigger, list);
  globalSearchLanguage.after(menu);
  syncGlobalSearchLanguageMenu();
}

// Returns "" when searching every language.
function resolveSearchLanguage(value) {
  if (value === "all") return "";
  return !value || value === "default" ? getDefaultBookLanguage() : value;
}

function pickResultLanguage(languages) {
  const codes = (languages || []).map((code) => String(code).split("/").pop());
  return codes.includes(getDefaultBookLanguage()) ? getDefaultBookLanguage() : codes[0] || "";
}

function groupByLanguage(items, getCode) {
  const groups = new Map();
  items.forEach((item) => {
    const code = getCode(item) || "";
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(item);
  });
  const label = (code) => (code ? getEditionLanguageName(code) : "Language not specified");
  return [...groups.entries()]
    .sort(([first], [second]) => {
      if (!first || !second) return Number(!first) - Number(!second);
      if (first === getDefaultBookLanguage() || second === getDefaultBookLanguage()) {
        return Number(second === getDefaultBookLanguage()) - Number(first === getDefaultBookLanguage());
      }
      return label(first).localeCompare(label(second));
    })
    .map(([code, group]) => [label(code), group]);
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
  shelfList.append(createShelfNavigationItem("Liked Books", String(likedBooks.length), "liked", likedBooks));
  shelfList.append(createShelfNavigationItem(
    "Currently Reading",
    String(currentlyReadingBooks.length),
    "#496c5d",
    currentlyReadingBooks
  ));
  startReadingCoverCycle(currentlyReadingBooks);
  const completedBooks = state.books.filter((book) => book.reading_status === "completed");
  shelfList.append(createShelfNavigationItem(
    "Completed Books",
    String(completedBooks.length),
    "#8b5e3c",
    completedBooks
  ));
  shelvesToRender.forEach((shelf) => {
    shelfList.append(createShelfNavigationItem(shelf.name, String(shelf.books.length), shelf.color, shelf.books));
  });
  if (!shelvesToRender.length && libraryBooks.length === 0) {
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

function setLibraryDrawerOpen(open) {
  sidebar.classList.toggle("is-open", open);
  sidebarBackdrop.hidden = !open;
  document.body.classList.toggle("library-drawer-open", open);
  libraryToggleBtn.setAttribute("aria-expanded", String(open));
  libraryToggleBtn.setAttribute("aria-label", open ? "Close library" : "Open library");
  if (open) document.getElementById("closeLibraryBtn").focus();
  else if (window.matchMedia("(max-width: 899px)").matches) libraryToggleBtn.focus();
}

function createShelfNavigationItem(name, count, color, books = []) {
  const book = books[0] || null;
  const item = document.createElement("button");
  item.className = "shelf-item";
  item.type = "button";
  item.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 899px)").matches) setLibraryDrawerOpen(false);
    navigateTo("shelf", { name });
  });

  const thumbnail = document.createElement("span");
  thumbnail.className = "shelf-thumbnail";
  if (book) {
    thumbnail.classList.add("cover-cycle-host");
    startCoverCycle(thumbnail, {
      key: `shelf:${name}`,
      getBooks: () => books,
      className: "shelf-thumb-art",
      initial: books[Math.min(coverCycleIndex.get(`shelf:${name}`) || 0, books.length - 1) % books.length] || book,
      interval: 12000,
    });
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
  const itemCount = document.createElement("span");
  itemCount.className = "shelf-item-count";
  itemCount.textContent = count;
  itemCount.setAttribute("aria-hidden", "true");
  copy.append(title, subtitle);
  item.append(thumbnail, copy, itemCount);
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
    genre: book.genre || "",
    isbn: Array.isArray(book.isbn) ? book.isbn[0] || "" : book.isbn || "",
    cover_url: book.cover_url || "",
    cover_i: book.cover_i || "",
    page_count: book.page_count || book.pages || "",
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
  if (!state.loading) ensureHomeRecommendations(libraryBooks);
  ensureGenreCatalogs();
  const orderedBooks = libraryBooks.slice().sort((a, b) =>
    new Date(b.added || b.added_on || 0) - new Date(a.added || a.added_on || 0));
  // Books without cover art sort last so they only surface when a row is expanded.
  const hasCoverArt = ({ book }) => Boolean(book.cover_i || book.cover_url);
  const recommendations = getBookRecommendations(libraryBooks)
    .sort((a, b) => Number(hasCoverArt(b)) - Number(hasCoverArt(a)));
  const pickedRecommendations = recommendations.slice(0, homeRowBookCount);
  const pickedKeys = new Set(pickedRecommendations.map(({ book }) => getBookKey(book)));
  const shelfRecommendations = recommendations.filter(({ book }) => !pickedKeys.has(getBookKey(book)));
  const moreByOwnedAuthors = shelfRecommendations.filter(({ book }) =>
    libraryBooks.some((owned) => owned.author && owned.author.toLowerCase() === book.author.toLowerCase()));
  const currentlyReadingBooks = libraryBooks.filter((book) => book.reading_status === "reading");
  const genres = [...new Set(libraryBooks.map((book) => book.genre).filter(Boolean))];
  const genreTiles = [...new Set([...genres, ...allGenres])]
    .map((genre, index) => ({
      title: genre,
      count: libraryBooks.filter((book) => bookMatchesGenre(book, genre)).length,
      books: getGenreBooks(genre, libraryBooks, recommendations),
      color: ["#8050a8", "#bf613f", "#3f7772", "#536c9e"][index % 4],
    }));

  const homeSections = [
    ["Currently reading", () => createCurrentlyReadingHomeSection(currentlyReadingBooks, libraryBooks)],
    ["Picked for your library", () => {
      const section = createCardRow("Picked for your library", pickedRecommendations
        .map(({ book, reason }) => ({ type: "book", book, subtitle: reason, recommendation: true })), {
          loading: state.catalogLoading,
          emptyMessage: state.catalogLoading
            ? "Finding books for your library…"
            : state.catalogError || "No new books to suggest right now.",
        });
      section.dataset.recommendationSection = "true";
      return section;
    }],
    ["Recently added", () => createCardRow("Recently added", orderedBooks.slice(0, homeRowBookCount)
      .map((book) => ({ type: "book", book })), {
        loading: state.loading,
        emptyMessage: state.loading
          ? "Loading your library…"
          : state.loadError || "Add your first book to start building your library.",
        emptyActionLabel: state.loading ? "" : "＋ Add your first book",
        emptyAction: state.loading ? null : openDialog,
      })],
    ["More by authors you own", () => createCardRow("More by authors you own", moreByOwnedAuthors.slice(0, homeRowBookCount)
      .map(({ book }) => ({ type: "book", book })), {
        loading: state.catalogLoading,
        emptyMessage: state.catalogLoading
          ? "Finding books by authors in your library…"
          : state.catalogError || "No more books by your authors found in the catalog yet.",
      })],
    ["Shelves for your taste", () => createCardRow("Shelves for your taste",
      buildSuggestedShelves(genres, shelfRecommendations, moreByOwnedAuthors), {
        loading: state.loading || state.catalogLoading || genreCatalogPending > 0,
        emptyMessage: state.loading || state.catalogLoading || genreCatalogPending > 0
          ? "Finding books for your shelves…"
          : state.catalogError
            ? "Could not load suggested shelves. Check your connection and try again."
          : libraryBooks.length
            ? "No suggested shelves for your library just yet."
            : "Add books to your library to get personalized suggestions.",
      })],
    ["Browse by genre", () => createCardRow("Browse by genre", genreTiles.map((genre) => ({ type: "genre", ...genre })))],
  ];

  container.append(createHomeHero());

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

function createHomeHero() {
  const hero = document.createElement("section");
  hero.className = "home-hero";
  hero.setAttribute("aria-labelledby", "homeHeroTitle");

  const copy = document.createElement("div");
  copy.className = "home-hero-copy";
  const title = document.createElement("h1");
  title.id = "homeHeroTitle";
  title.textContent = "Your next favorite book is waiting.";
  const description = document.createElement("p");
  description.textContent = "Track your library, discover new reads, and keep your love for books close.";
  const action = document.createElement("button");
  action.className = "action-btn";
  action.type = "button";
  action.textContent = "Explore recommendations";
  action.addEventListener("click", () => {
    document.querySelector('[data-recommendation-section="true"]')?.scrollIntoView({ behavior: "smooth" });
  });

  copy.append(title, description, action);
  hero.append(copy);
  return hero;
}

function shuffleBooks(books) {
  const shuffled = books.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function rotateRecommendationPool() {
  const uniqueBooks = new Map([...discoveryBooks, ...state.catalogBooks]
    .map((book) => [getRecommendationKey(book), book]));
  state.recommendationPool = shuffleBooks([...uniqueBooks.values()]);
  addGenreBooksToRecommendationPool();
}

function scheduleRecommendationRotation(delay = recommendationRotationInterval) {
  window.clearTimeout(recommendationRotationTimer);
  recommendationRotationTimer = window.setTimeout(() => {
    if (state.view === "home" && Date.now() - lastRecommendationScrollAt < recommendationScrollPause) {
      scheduleRecommendationRotation(1000);
      return;
    }
    rotateRecommendationPool();
    if (state.view === "home") renderBooks();
    scheduleRecommendationRotation();
  }, delay);
}

function trackRecommendationScroll(event) {
  const section = document.querySelector("[data-recommendation-section]");
  if (!section) return;
  const target = event.target;
  if (target instanceof Element && section.contains(target)) {
    lastRecommendationScrollAt = Date.now();
    return;
  }
  if (target === document || target === document.documentElement || target === document.body) {
    const bounds = section.getBoundingClientRect();
    if (bounds.bottom > 0 && bounds.top < window.innerHeight) {
      lastRecommendationScrollAt = Date.now();
    }
  }
}

function getRecommendationKey(book) {
  return `${(book.title || "").trim().toLowerCase()}|${(book.author || "").trim().toLowerCase()}`;
}

function isSameBookWork(first, second) {
  return getBookKey(first) === getBookKey(second)
    || getRecommendationKey(first) === getRecommendationKey(second);
}

function getLibraryDiscoveryKey(libraryBooks) {
  return JSON.stringify(libraryBooks.map((book) => [
    getBookKey(book),
    (book.author || "").trim().toLowerCase(),
    (book.genre || "").trim().toLowerCase(),
  ]).sort((a, b) => a[0].localeCompare(b[0])));
}

async function fetchOpenLibraryRecommendations({ genre = "", author = "" }) {
  const query = genre
    ? `subject:${JSON.stringify(genre)}`
    : `author:${JSON.stringify(author)}`;
  const normalizedAuthor = normalizeBookText(author);
  const mapWorks = (works) => works.flatMap((work) => {
    const authors = Array.isArray(work.author_name) ? work.author_name : [];
    if (!work.title || !authors.length
      || (author && !authors.some((name) => normalizeBookText(name) === normalizedAuthor))) return [];
    const isbn = Array.isArray(work.isbn) ? work.isbn[0] || "" : "";
    return [{
      title: work.title,
      author: authors[0],
      genre: genre || work.subject?.[0] || "",
      subjects: Array.isArray(work.subject) ? work.subject : [],
      isbn,
      cover_i: work.cover_i,
      pages: work.number_of_pages_median,
      page_count: work.number_of_pages_median,
      first_publish_year: work.first_publish_year,
    }];
  });
  const fetchWorks = (offset) => runOpenLibraryTask(async () => {
    const params = new URLSearchParams({
      q: author ? query : `${query} language:${getDefaultBookLanguage()}`,
      fields: "key,title,author_name,isbn,cover_i,subject,number_of_pages_median,first_publish_year",
      limit: "40",
      offset: String(offset),
    });
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const data = await fetchOpenLibrarySearch(params, 12000);
        return Array.isArray(data.docs) ? data.docs : [];
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => window.setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
    throw lastError;
  });
  const offset = Math.floor(Math.random() * 5) * 40;
  let matches = [];
  let openLibraryError;
  try {
    matches = mapWorks(await fetchWorks(offset));
    if (!matches.length && offset) matches = mapWorks(await fetchWorks(0));
  } catch (error) {
    openLibraryError = error;
  }
  if (matches.length || !author) {
    if (openLibraryError) throw openLibraryError;
    return matches;
  }
  // Author rows go empty when Open Library is slow or misses the author, so fall back to Google Books.
  try {
    const { books } = await fetchGoogleCatalogBooks(`inauthor:${JSON.stringify(author)}`, { language: getDefaultBookLanguage() });
    return books.filter((book) => (book.author_name || []).some((name) => normalizeBookText(name) === normalizedAuthor));
  } catch (error) {
    throw openLibraryError || error;
  }
}

async function ensureHomeRecommendations(libraryBooks) {
  const libraryKey = getLibraryDiscoveryKey(libraryBooks);
  if (state.catalogLibraryKey === libraryKey || state.catalogRequestKey === libraryKey) return;

  state.catalogRequestKey = libraryKey;
  state.catalogBooks = [];
  state.catalogError = "";
  state.catalogLoading = true;
  const uniqueGenres = [...new Set(libraryBooks.map((book) => book.genre?.trim()).filter(Boolean))];
  const uniqueAuthors = [...new Set(libraryBooks.map((book) => book.author?.trim()).filter(Boolean))];
  const queries = [
    ...shuffleBooks(uniqueGenres).slice(0, 5).map((genre) => ({ genre })),
    ...shuffleBooks(uniqueAuthors).slice(0, 8).map((author) => ({ author })),
  ];
  if (!queries.length) {
    state.catalogLibraryKey = libraryKey;
    state.catalogRequestKey = "";
    state.catalogLoading = false;
    return;
  }

  const results = await Promise.allSettled(queries.map(fetchOpenLibraryRecommendations));
  if (state.catalogRequestKey !== libraryKey) return;
  let failures = 0;
  state.catalogBooks = results.flatMap((result) => {
    if (result.status === "rejected") {
      failures += 1;
      console.error("Could not load personalized book suggestions.", result.reason);
      return [];
    }
    return result.value;
  });
  state.catalogError = failures === results.length
    ? "Book suggestions are temporarily unavailable. Check your connection and try again."
    : "";
  state.catalogLibraryKey = libraryKey;
  state.catalogRequestKey = "";
  state.catalogLoading = false;
  rotateRecommendationPool();
  if (state.view === "home" && getLibraryDiscoveryKey(getLibraryBooks()) === libraryKey) renderBooks();
  else if (state.view === "suggested-shelf") {
    const [path, query] = window.location.hash.slice(1).split("?");
    if (path === "/suggested-shelf") {
      showSuggestedShelfPage(new URLSearchParams(query).get("key") || "");
    }
  }
}

function getBookRecommendations(libraryBooks = getLibraryBooks()) {
  if (!state.recommendationPool.length) rotateRecommendationPool();
  return scoreRecommendations(state.recommendationPool.filter((book) =>
    !libraryBooks.some((owned) => isSameBookWork(owned, book))
      && !state.dismissedRecommendations.has(getBookKey(book))));
}

function createCurrentlyReadingHomeSection(books, libraryBooks) {
  const section = document.createElement("section");
  section.className = "home-section card-row-section";
  const heading = document.createElement("div");
  heading.className = "section-heading-row";
  const title = document.createElement("h2");
  title.textContent = "Currently reading";
  heading.append(title);
  if (books.length) {
    const content = document.createElement("div");
    content.className = "reading-home-layout";
    content.append(createFeaturedReadingCard(books[0]));
    if (books.length > 1) {
      const row = document.createElement("div");
      row.className = "card-row reading-home-row";
      row.setAttribute("role", "region");
      row.setAttribute("aria-label", "Currently reading books");
      row.tabIndex = 0;
      row.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          row.scrollBy({ left: event.key === "ArrowRight" ? 240 : -240, behavior: "smooth" });
        }
      });
      books.slice(1).forEach((book) => row.append(createReadingBookCard(book)));
      content.append(row);
    }
    section.append(heading, content);
    return section;
  }

  const empty = document.createElement("p");
  empty.className = "row-empty-state";
  empty.textContent = state.loading
    ? "Loading your reading list…"
    : "Ready to start a book? Choose one from your library to add to Currently Reading.";
  section.append(heading, empty);

  const booksToStart = libraryBooks.filter((book) => book.reading_status !== "reading");
  if (booksToStart.length) {
    const row = document.createElement("div");
    row.className = "card-row";
    row.setAttribute("role", "region");
    row.setAttribute("aria-label", "Choose a book to start reading");
    row.tabIndex = 0;
    row.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        row.scrollBy({ left: event.key === "ArrowRight" ? 240 : -240, behavior: "smooth" });
      }
    });
    booksToStart.slice(0, 6).forEach((book) => row.append(createReadingBookCard(book)));
    section.append(row);
  } else if (!state.loading && !libraryBooks.length) {
    const addBook = document.createElement("button");
    addBook.type = "button";
    addBook.className = "secondary-btn row-empty-action";
    addBook.textContent = "＋ Add a book";
    addBook.addEventListener("click", openDialog);
    section.append(addBook);
  }
  return section;
}

function createFeaturedReadingCard(book) {
  const card = document.createElement("article");
  card.className = "reading-feature-card";

  const coverButton = document.createElement("button");
  coverButton.type = "button";
  coverButton.className = "reading-feature-cover";
  coverButton.setAttribute("aria-label", `Open ${book.title} by ${book.author || "Unknown author"}`);
  coverButton.append(createBookCover(book));
  coverButton.addEventListener("click", () => openBookProfile(book));

  const details = document.createElement("div");
  details.className = "reading-feature-details";
  const title = document.createElement("button");
  title.type = "button";
  title.className = "reading-feature-title";
  title.textContent = book.title || "Untitled";
  title.addEventListener("click", () => openBookProfile(book));
  const author = document.createElement("p");
  author.className = "reading-feature-author";
  author.textContent = book.author || "Unknown author";
  const pageCount = Number(book.page_count || book.pages);
  const currentPage = Math.max(0, Number(book.current_page) || 0);
  const hasPageCount = Number.isInteger(pageCount) && pageCount > 0;
  const progress = document.createElement("div");
  progress.className = "reading-feature-progress";
  const progressLabel = document.createElement("span");
  const percentage = hasPageCount
    ? Math.max(0, Math.min(100, Math.round((currentPage / pageCount) * 100)))
    : 0;
  progressLabel.textContent = hasPageCount
    ? `Page ${currentPage} of ${pageCount}`
    : `Page ${currentPage}`;
  const progressValue = document.createElement("span");
  progressValue.textContent = hasPageCount ? `${percentage}%` : "";
  const progressBar = document.createElement("span");
  progressBar.className = "reading-feature-progress-bar";
  progressBar.setAttribute("role", "progressbar");
  progressBar.setAttribute("aria-label", `Reading progress for ${book.title}`);
  progressBar.setAttribute("aria-valuemin", "0");
  progressBar.setAttribute("aria-valuemax", "100");
  progressBar.setAttribute("aria-valuenow", String(percentage));
  const progressFill = document.createElement("span");
  progressFill.style.width = `${percentage}%`;
  progressBar.append(progressFill);
  progress.append(progressLabel, progressValue, progressBar);

  const continueButton = document.createElement("button");
  continueButton.type = "button";
  continueButton.className = "reading-continue-btn";
  continueButton.textContent = Number(book.current_page) > 0 ? "Move bookmark" : "Set bookmark";
  continueButton.addEventListener("click", () => setBookBookmark(book));
  details.append(title, author, progress, continueButton);
  card.append(coverButton, details);
  return card;
}

function createReadingBookCard(book) {
  const card = document.createElement("article");
  card.className = "media-card book-card";
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
  author.textContent = book.author || "Unknown author";
  open.append(title, author);
  open.addEventListener("click", () => openBookProfile(book));
  card.append(open);
  return card;
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
  }).sort((a, b) => b.score - a.score);
}

function getBookKey(book) {
  return (book.isbn || `${book.title}|${book.author}`).toString().toLowerCase();
}

function buildSuggestedShelves(genres, recommendations, authorRecommendations = []) {
  const suggestions = [];
  if (authorRecommendations.length) {
    suggestions.push({
      key: "authors",
      name: "More by authors you love",
      subtitle: "More books by authors in your library",
      color: "#74508a",
      books: authorRecommendations.map(({ book }) => book),
    });
  }
  const ownedGenres = new Set(genres.map((genre) => genre.toLowerCase()));
  const libraryBooks = getLibraryBooks();
  const allShelfGenres = [...new Map([...genres, ...allGenres].map((genre) => [genre.toLowerCase(), genre])).values()];
  allShelfGenres.forEach((genre, index) => {
    const seen = new Set();
    const books = [
      ...recommendations.map(({ book }) => book).filter((book) => bookMatchesGenre(book, genre)),
      ...(genreCoverCache.get(genre.toLowerCase())?.books || []),
    ].filter((book) => {
      const key = getBookKey(book);
      if (seen.has(key) || libraryBooks.some((owned) => isSameBookWork(owned, book))) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => Number(Boolean(b.cover_i || b.cover_url)) - Number(Boolean(a.cover_i || a.cover_url)));
    if (books.length) {
      const owned = ownedGenres.has(genre.toLowerCase());
      suggestions.push({
        key: `genre:${genre.toLowerCase()}`,
        name: `More ${genre} to explore`,
        subtitle: owned ? `Because you enjoy ${genre}` : `Explore ${genre}`,
        color: ["#bd6749", "#496c5d", "#4c7083", "#536c9e", "#8050a8"][index % 5],
        owned,
        books,
      });
    }
  });
  // Genres the reader already owns come first.
  suggestions.sort((a, b) => Number(Boolean(b.owned)) - Number(Boolean(a.owned)));
  if (!suggestions.length && recommendations.length) {
    suggestions.push({
      key: "more-to-explore",
      name: "More to explore",
      subtitle: "A mix of books picked for your library",
      color: "#4c7083",
      books: recommendations.map(({ book }) => book),
    });
  }
  return suggestions.map((shelf) => ({
    type: "suggested-shelf",
    ...shelf,
    count: shelf.books.length,
    book: shelf.books[0],
  }));
}

const cardRowRegistry = new Map();

function createRowCard(cardData, compact = false) {
  return cardData.type === "shelf" || cardData.type === "suggested-shelf"
    ? createShelfCard(cardData, { compact })
    : cardData.type === "genre"
      ? createGenreCard(cardData)
      : createBookCard(cardData.book, {
        compact: cardData.type === "compact-book",
        subtitle: cardData.subtitle,
        recommendation: cardData.recommendation,
      });
}

function showCardListPage(key) {
  const list = cardRowRegistry.get(key);
  if (!list) {
    window.history.replaceState(null, "", window.location.pathname);
    showHomePage();
    return;
  }
  const page = showPage("list");
  updateActiveNavigation("Home");
  page.append(createPageHeader("Home", list.title));
  const grid = document.createElement("div");
  grid.className = "card-row expanded genre-browse-grid";
  list.cards.forEach((cardData) => grid.append(createRowCard(cardData, list.compact)));
  page.append(grid);
}

function createCardRow(title, cards, {
  compact = false,
  emptyMessage = "",
  emptyActionLabel = "",
  emptyAction = null,
  loading = false,
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
  showAll.textContent = "See all";
  const listKey = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
  if (!cards.length && loading) {
    row.append(createBookLoader({ message: emptyMessage || "Loading…", compact: true }));
  } else if (!cards.length && emptyMessage) {
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
    cards.forEach((cardData) => row.append(createRowCard(cardData, compact)));
  }

  showAll.hidden = cards.length <= 5;
  showAll.addEventListener("click", () => {
    cardRowRegistry.set(listKey, { title, cards, compact });
    navigateTo("list", { key: listKey });
  });
  const wrap = document.createElement("div");
  wrap.className = "card-row-wrap";
  const makeArrow = (direction) => {
    const arrow = document.createElement("button");
    arrow.type = "button";
    arrow.className = `row-arrow row-arrow-${direction < 0 ? "prev" : "next"}`;
    arrow.setAttribute("aria-label", `${direction < 0 ? "Previous" : "Next"} ${title}`);
    arrow.textContent = direction < 0 ? "‹" : "›";
    arrow.addEventListener("click", () => {
      row.scrollBy({ left: direction * row.clientWidth * 0.85, behavior: "smooth" });
    });
    return arrow;
  };
  const prev = makeArrow(-1);
  const next = makeArrow(1);
  const updateArrows = () => {
    const scrollable = !row.classList.contains("expanded") && row.scrollWidth > row.clientWidth + 4;
    prev.hidden = !scrollable || row.scrollLeft < 4;
    next.hidden = !scrollable || row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  };
  row.addEventListener("scroll", updateArrows, { passive: true });
  window.addEventListener("resize", updateArrows);
  window.requestAnimationFrame(updateArrows);
  window.setTimeout(updateArrows, 600);
  wrap.append(row, prev, next);
  section.append(heading, wrap);
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
  panel.hidden = true;
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
  const handleScroll = (event) => {
    if (!menu.open) return;
    if (event.target instanceof Element && event.target.closest(".card-row")) {
      menu.open = false;
      return;
    }
    repositionPanel();
  };
  menu.addEventListener("toggle", () => {
    menu.closest(".media-card")?.classList.toggle("card-menu-open", menu.open);
    if (menu.open) {
      document.querySelectorAll(".card-add-menu[open], .card-menu[open], .book-shelf-menu[open]").forEach((otherMenu) => {
        if (otherMenu !== menu) otherMenu.open = false;
      });
      panel.hidden = false;
      document.body.append(panel);
      positionPanel();
      window.addEventListener("resize", repositionPanel);
      window.addEventListener("scroll", handleScroll, true);
    } else {
      panel.hidden = true;
      menu.append(panel);
      window.removeEventListener("resize", repositionPanel);
      window.removeEventListener("scroll", handleScroll, true);
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
  } else if (isSuggestion && shelf.books?.length) {
    cover.classList.add("cover-cycle-host");
    startCoverCycle(cover, { key: `suggested-shelf:${shelf.key}`, getBooks: () => shelf.books });
  } else if (shelf.book) cover.append(createBookCover(shelf.book));
  else cover.textContent = name.slice(0, 1).toUpperCase();
  const title = document.createElement("strong");
  title.className = "book-cover-title";
  title.textContent = name;
  const subtitle = document.createElement("span");
  subtitle.className = "book-cover-author";
  subtitle.textContent = isSuggestion
    ? `${shelf.count} suggested ${shelf.count === 1 ? "book" : "books"}`
    : `${shelf.count} books`;
  open.append(cover, title, subtitle);
  open.addEventListener("click", () => {
    if (isSuggestion) {
      setSpotlight(`suggested-shelf:${shelf.key}`);
      navigateTo("suggested-shelf", { key: shelf.key });
    }
    else navigateTo("shelf", { name });
  });
  card.append(open);
  if (cover.hasAttribute("data-reading-shelf-card-cover")) updateReadingShelfCovers();
  return card;
}

function showSuggestedShelfPage(key) {
  const libraryBooks = getLibraryBooks();
  ensureGenreCatalogs();
  if (!state.loading) ensureHomeRecommendations(libraryBooks);
  const recommendations = getBookRecommendations(libraryBooks);
  const genres = [...new Set(libraryBooks.map((book) => book.genre).filter(Boolean))];
  const pickedKeys = new Set(recommendations.slice(0, homeRowBookCount).map(({ book }) => getBookKey(book)));
  const shelfRecommendations = recommendations.filter(({ book }) => !pickedKeys.has(getBookKey(book)));
  const authorRecommendations = recommendations.filter(({ book }) =>
    !pickedKeys.has(getBookKey(book))
      && libraryBooks.some((owned) => owned.author && owned.author.toLowerCase() === book.author.toLowerCase()));
  const shelf = buildSuggestedShelves(genres, shelfRecommendations, authorRecommendations)
    .find((suggestion) => suggestion.key === key);
  const page = showPage("suggested-shelf");
  updateActiveNavigation("Home");
  if (!shelf) {
    page.append(createPageHeader("Suggestions · For your library", "Suggested shelf not found"));
    return;
  }
  page.append(createPageHeader("Suggestions · For your library", shelf.name, shelf.subtitle));
  shelf.books = withSpotlight(shelf.books, takeSpotlight(`suggested-shelf:${shelf.key}`));
  const results = document.createElement("section");
  results.className = "search-result-group";
  page.append(results);
  let currentPage = 1;
  const render = () => {
    const pageSize = getStoredSearchPageSize();
    const totalPages = Math.max(1, Math.ceil(shelf.books.length / pageSize));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const first = (currentPage - 1) * pageSize;
    const pageBooks = shelf.books.slice(first, first + pageSize);
    results.replaceChildren();
    if (!pageBooks.length) {
      const empty = document.createElement("p");
      empty.className = "genre-summary";
      empty.textContent = "No suggestions in this shelf right now.";
      results.append(empty);
      return;
    }
    const summary = document.createElement("p");
    summary.className = "genre-summary";
    summary.setAttribute("aria-live", "polite");
    summary.textContent = `Showing ${first + 1}–${first + pageBooks.length} of ${shelf.books.length} books`;
    const barOptions = {
      page: currentPage,
      totalPages,
      size: pageSize,
      onGo: (target) => {
        currentPage = target;
        render();
        page.scrollIntoView({ block: "start" });
      },
      onSize: (nextSize) => {
        localStorage.setItem(searchPageSizeKey, String(nextSize));
        currentPage = 1;
        render();
      },
    };
    const grid = document.createElement("div");
    grid.className = "card-row expanded genre-browse-grid";
    pageBooks.forEach((book) => grid.append(createBookCard(book, { recommendation: true })));
    results.append(summary, createPagingBar(barOptions), grid, createPagingBar(barOptions));
  };
  render();
}

function bookMatchesGenre(book, genre) {
  const target = genre.trim().toLowerCase();
  return String(book.genre || "").split(/[,;/]/).some((part) => part.trim().toLowerCase() === target);
}

function getGenreBooks(genre, libraryBooks, recommendations = []) {
  const seen = new Set();
  return [...libraryBooks, ...recommendations.map(({ book }) => book)].filter((book) => {
    if (!bookMatchesGenre(book, genre)) return false;
    const key = getBookKey(book);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const genreCoverCache = new Map();
const coverCycleIndex = new Map();
const coverCycleLastChange = new Map();
// Last few covers each cycle displayed (newest last), so a click can surface what caught the eye.
const coverCycleRecent = new Map();
let pendingSpotlight = null;

function rememberCycleBook(key, book) {
  const recent = (coverCycleRecent.get(key) || []).filter((item) => getBookKey(item) !== getBookKey(book));
  recent.push(book);
  coverCycleRecent.set(key, recent.slice(-3));
}

// Called on click: the shown book first, then up to two before it.
function setSpotlight(key) {
  const books = [...(coverCycleRecent.get(key) || [])].reverse();
  pendingSpotlight = books.length ? { key, books } : null;
}

function takeSpotlight(key) {
  return pendingSpotlight?.key === key ? pendingSpotlight.books : [];
}

function withSpotlight(books, spotlight) {
  if (!spotlight.length) return books;
  const pinned = new Set(spotlight.map(getBookKey));
  return [...spotlight, ...books.filter((book) => !pinned.has(getBookKey(book)))];
}
const coverCycleInterval = 14000;
const coverFadeMs = 1200;

// Resolves with a cover element only once its image has really loaded, or null if it can't.
function preloadBookCover(book, className = "", timeoutMs = 8000) {
  return new Promise((resolve) => {
    const cover = createBookCover(book, className);
    const image = cover.querySelector("img");
    if (!image) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    image.loading = "eager";
    // Reject tracking pixels and wide "no image available" placeholders.
    const isRealCover = () => image.naturalWidth >= 60 && image.naturalHeight / image.naturalWidth >= 1.15;
    image.addEventListener("load", () => finish(isRealCover() ? cover : null));
    image.addEventListener("error", () => {
      if (!image.isConnected) finish(null);
    });
    if (image.complete && image.naturalWidth > 0) finish(isRealCover() ? cover : null);
  });
}

// Slowly crossfades through the books returned by getBooks inside container.
function startCoverCycle(container, { key, getBooks, className = "", interval = coverCycleInterval, initial = null }) {
  let order = [];
  let shownKey = "";
  let showing = false;
  const refresh = () => {
    const seen = new Set();
    const pool = getBooks().filter((book) => {
      const bookKey = getBookKey(book);
      if (seen.has(bookKey)) return false;
      seen.add(bookKey);
      return true;
    });
    order = order.filter((book) => seen.has(getBookKey(book)));
    const known = new Set(order.map(getBookKey));
    order.push(...shuffleBooks(pool.filter((book) => !known.has(getBookKey(book)))));
    return order.length;
  };
  const swapIn = (cover) => {
    const previous = [...container.children];
    cover.classList.add("cover-cycle-layer");
    cover.style.opacity = "0";
    container.append(cover);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      cover.style.opacity = "1";
    }));
    window.setTimeout(() => previous.forEach((layer) => layer.remove()), coverFadeMs + 100);
  };
  const show = async () => {
    if (showing || !refresh()) return;
    showing = true;
    for (let attempt = 0; attempt < Math.min(order.length, 5); attempt += 1) {
      const index = coverCycleIndex.get(key) || 0;
      const book = order[index % order.length];
      if (getBookKey(book) === shownKey) {
        coverCycleIndex.set(key, index + 1);
        continue;
      }
      const cover = await preloadBookCover(book, className);
      if (!container.isConnected) break;
      if (cover) {
        shownKey = getBookKey(book);
        rememberCycleBook(key, book);
        coverCycleLastChange.set(key, Date.now());
        if (container.children.length) swapIn(cover);
        else container.append(cover);
        break;
      }
      coverCycleIndex.set(key, index + 1);
    }
    showing = false;
  };
  const step = () => {
    if (!container.isConnected) return;
    if (refresh()) {
      coverCycleIndex.set(key, (coverCycleIndex.get(key) || 0) + 1);
      show();
    }
    window.setTimeout(step, interval + Math.random() * interval * 0.4);
  };
  if (initial) {
    shownKey = getBookKey(initial);
    rememberCycleBook(key, initial);
    container.append(createBookCover(initial, className));
  }
  show();
  // Stagger rotations and keep the cadence across re-renders.
  const elapsed = Date.now() - (coverCycleLastChange.get(key) || 0);
  window.setTimeout(step, Math.max(2000, interval - elapsed) + Math.random() * interval * 0.5);
  return { refresh: show };
}

let genreCatalogRenderTimer = null;

// Appends (never reshuffles) so rows already on screen keep their order while the pool grows.
function addGenreBooksToRecommendationPool() {
  const known = new Set(state.recommendationPool.map(getRecommendationKey));
  const fresh = [];
  genreCoverCache.forEach((entry) => entry.books.forEach((book) => {
    const key = getRecommendationKey(book);
    if (known.has(key)) return;
    known.add(key);
    fresh.push(book);
  }));
  state.recommendationPool.push(...shuffleBooks(fresh));
}

function ensureGenreCatalogs() {
  const pending = allGenres.filter((genre) => !genreCoverCache.has(genre.toLowerCase()));
  if (!pending.length) return;
  pending.forEach((genre) => loadGenreCovers(genre).then(() => {
    window.clearTimeout(genreCatalogRenderTimer);
    genreCatalogRenderTimer = window.setTimeout(() => {
      addGenreBooksToRecommendationPool();
      if (state.view === "home") renderBooks();
      else if (state.view === "suggested-shelf") {
        const [path, query] = window.location.hash.slice(1).split("?");
        if (path === "/suggested-shelf") showSuggestedShelfPage(new URLSearchParams(query).get("key") || "");
      }
    }, 800);
  }));
}

const openLibraryQueue = [];
let openLibraryActive = 0;

// Open Library throttles bursts, so every catalog request goes through a small shared queue.
function runOpenLibraryTask(task) {
  return new Promise((resolve, reject) => {
    openLibraryQueue.push({ task, resolve, reject });
    drainOpenLibraryQueue();
  });
}

function drainOpenLibraryQueue() {
  while (openLibraryActive < 3 && openLibraryQueue.length) {
    const job = openLibraryQueue.shift();
    openLibraryActive += 1;
    job.task()
      .then(job.resolve, job.reject)
      .finally(() => {
        openLibraryActive -= 1;
        drainOpenLibraryQueue();
      });
  }
}

function loadGenreCovers(genre) {
  const key = genre.toLowerCase();
  let entry = genreCoverCache.get(key);
  if (!entry) {
    entry = { books: [], promise: null };
    genreCoverCache.set(key, entry);
    const stored = readGenrePreview(genre);
    if (stored) {
      entry.books = stored.books.filter((book) => book.cover_i);
      entry.promise = Promise.resolve();
      return entry.promise;
    }
    genreCatalogPending += 1;
    entry.promise = fetchGenreCatalogPage(genre, { background: true })
      .then((result) => {
        entry.books = result.books;
      })
      .catch((error) => {
        genreCoverCache.delete(key);
        console.error(`Could not load ${genre} covers`, error);
      })
      .finally(() => {
        genreCatalogPending -= 1;
      });
  }
  return entry.promise;
}

function createGenreCard(genre) {
  const card = document.createElement("article");
  card.className = "media-card genre-card";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "genre-tile";
  button.style.setProperty("--genre-color", genre.color);
  const label = document.createElement("span");
  label.className = "genre-tile-label";
  label.textContent = genre.title;
  button.append(label);
  button.setAttribute("aria-label", `Browse ${genre.title}, ${genre.count} books`);
  const art = document.createElement("span");
  art.className = "genre-tile-cover";
  art.setAttribute("aria-hidden", "true");
  button.prepend(art);
  const genreKey = genre.title.toLowerCase();
  const cycle = startCoverCycle(art, {
    key: `genre:${genreKey}`,
    getBooks: () => [...(genre.books || []), ...(genreCoverCache.get(genreKey)?.books || [])],
  });
  loadGenreCovers(genre.title).then(cycle.refresh);
  button.addEventListener("click", () => {
    setSpotlight(`genre:${genreKey}`);
    navigateTo("genre", { name: genre.title });
  });
  card.append(button);
  return card;
}

function showHomePage() {
  pendingSpotlight = null;
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
  const libraryNav = document.getElementById("libraryNavBtn");
  const libraryActive = label.toLowerCase() === "your library";
  if (libraryNav) {
    libraryNav.classList.toggle("active", libraryActive);
    if (libraryActive) libraryNav.setAttribute("aria-current", "page");
    else libraryNav.removeAttribute("aria-current");
  }

  document.querySelectorAll(".nav-pill").forEach((item) => {
    const active = item.textContent.trim().toLowerCase() === label.toLowerCase();
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

const searchCacheName = "librito-search-v1";
const searchCacheFreshMs = 2 * 60 * 1000;
const searchCacheMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

function fetchOpenLibrarySearch(params, timeout = 15000) {
  return fetchJsonCached(`https://openlibrary.org/search.json?${params}`, timeout);
}

// Stale-while-revalidate for catalog lookups: cached results return instantly while a background request refreshes the cache.
async function fetchJsonCached(url, timeout = 15000) {
  const cache = window.caches ? await caches.open(searchCacheName).catch(() => null) : null;
  const refresh = async () => {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!response.ok) throw new Error(`Request failed with ${response.status}: ${url}`);
    const text = await response.text();
    const data = JSON.parse(text);
    if (cache) {
      cache.put(url, new Response(text, { headers: { "x-cached-at": String(Date.now()) } })).catch(() => {});
    }
    return data;
  };
  const hit = cache ? await cache.match(url).catch(() => null) : null;
  if (hit) {
    const age = Date.now() - Number(hit.headers.get("x-cached-at") || 0);
    if (age < searchCacheMaxAgeMs) {
      try {
        const cached = await hit.json();
        if (age >= searchCacheFreshMs) refresh().catch(() => {});
        return cached;
      } catch {
        // Fall through to a network request when the cached entry is unreadable.
      }
    }
  }
  return refresh();
}

const browseSortOptions = [
  ["", "Most relevant", ""],
  ["popular", "Popular", "readinglog"],
  ["new", "Newest to oldest", "new"],
  ["old", "Oldest to newest", "old"],
  ["rating", "Top rated", "rating"],
  ["title", "Title: A to Z", "title"],
];
const browseFilterGroups = [
  { key: "year", label: "Published", options: [
    ["2020", "2020 – now", 2020, 9999],
    ["2010", "2010s", 2010, 2019],
    ["2000", "2000s", 2000, 2009],
    ["1900", "1900s", 1900, 1999],
    ["pre1900", "Before 1900", 0, 1899],
  ] },
  { key: "len", label: "Length", options: [
    ["short", "Short (under 200 pages)", 1, 199],
    ["medium", "Medium (200–399)", 200, 399],
    ["long", "Long (400+)", 400, 99999],
  ] },
  { key: "rating", label: "Rating", options: [
    ["4", "4★ & up", 4, 5],
    ["3", "3★ & up", 3, 5],
    ["2", "2★ & up", 2, 5],
  ] },
];

function countActiveFilters(filters) {
  return browseFilterGroups.filter((group) => filters[group.key]).length + (filters.lang ? 1 : 0);
}

function findFilterRange(key, value) {
  const option = browseFilterGroups.find((group) => group.key === key)?.options.find(([id]) => id === value);
  return option ? [option[2], option[3]] : null;
}

// Client-side filter and sort for result lists that are already loaded.
function applyBrowseControls(books, sort, filters) {
  const year = findFilterRange("year", filters.year);
  const length = findFilterRange("len", filters.len);
  const rating = findFilterRange("rating", filters.rating);
  const inRange = (value, range) => range === null || (Number(value) >= range[0] && Number(value) <= range[1]);
  const visible = books.filter((book) =>
    inRange(book.first_publish_year, year)
    && inRange(book.pages || book.page_count, length)
    && inRange(book.ratings_average, rating));
  console.log("ABC",sort,JSON.stringify(books.map(b=>[b.title,b.first_publish_year])));
  const compare = {
    new: (a, b) => (b.first_publish_year || -1) - (a.first_publish_year || -1),
    old: (a, b) => (a.first_publish_year || 9999) - (b.first_publish_year || 9999),
    rating: (a, b) => (b.ratings_average || 0) - (a.ratings_average || 0),
    popular: (a, b) => (b.popularity || 0) - (a.popularity || 0),
    title: (a, b) => String(a.title || "").localeCompare(String(b.title || "")),
    author: (a, b) => compareText(a.author, b.author) || compareText(a.title, b.title),
    added: (a, b) => String(b.added || b.added_on || "").localeCompare(String(a.added || a.added_on || "")),
    value: (a, b) => Number(b.cost || 0) - Number(a.cost || 0),
  }[sort];
  return compare ? [...visible].sort(compare) : visible;
}

const browseUi = { scope: "", open: "" };

// Sort and filter pills that open one floating panel at a time.
function createBrowseControls({ scope, sort, filters, languages = false, sortOptions = browseSortOptions, onChange }) {
  if (browseUi.scope !== scope) Object.assign(browseUi, { scope, open: "" });
  const bar = document.createElement("section");
  bar.className = "browse-bar browse-popover";
  bar.setAttribute("aria-label", "Sort and filter");
  const main = document.createElement("div");
  main.className = "browse-bar-main";

  const panels = {};
  const toggles = {};
  const syncPanels = () => {
    Object.keys(panels).forEach((key) => {
      panels[key].hidden = browseUi.open !== key;
      toggles[key].setAttribute("aria-expanded", String(browseUi.open === key));
    });
  };
  const addPanel = (key, label) => {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "browse-toggle";
    toggle.textContent = label;
    const panel = document.createElement("div");
    panel.className = "browse-panel";
    toggle.addEventListener("click", () => {
      browseUi.open = browseUi.open === key ? "" : key;
      syncPanels();
    });
    toggles[key] = toggle;
    panels[key] = panel;
    main.append(toggle);
    return panel;
  };
  const chip = (label, active, onClick) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `browse-chip${active ? " active" : ""}`;
    item.setAttribute("aria-pressed", String(active));
    item.textContent = label;
    item.addEventListener("click", onClick);
    return item;
  };

  const sortPanel = addPanel("sort", `Sort: ${sortOptions.find(([value]) => value === sort)?.[1] || sortOptions[0][1]}`);
  const sortChips = document.createElement("div");
  sortChips.className = "browse-options";
  sortOptions.forEach(([value, label]) => sortChips.append(chip(label, value === sort, () => {
    browseUi.open = "";
    onChange({ sort: value, filters });
  })));
  sortPanel.append(sortChips);

  const activeCount = countActiveFilters(filters);
  const panel = addPanel("filters", activeCount ? `Filters (${activeCount})` : "Filters");
  const setFilter = (key, value) => onChange({ sort, filters: { ...filters, [key]: filters[key] === value ? "" : value } });
  const groups = browseFilterGroups.map((group) => ({
    key: group.key,
    label: group.label,
    options: group.options.map(([id, label]) => [id, label]),
  }));
  if (languages) {
    groups.unshift({
      key: "lang",
      label: "Language",
      options: [...openLibraryLanguages.map(([code, name]) => [code, name]), ["all", "Any language"]],
    });
  }
  groups.forEach((group) => {
    const fieldset = document.createElement("div");
    fieldset.className = "browse-group";
    const legend = document.createElement("p");
    legend.className = "browse-group-label";
    legend.textContent = group.label;
    const options = document.createElement("div");
    options.className = "browse-options";
    group.options.forEach(([id, label]) => options.append(chip(label, filters[group.key] === id, () => setFilter(group.key, id))));
    fieldset.append(legend, options);
    panel.append(fieldset);
  });
  if (activeCount) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "text-btn browse-clear";
    clear.textContent = "Clear filters";
    clear.addEventListener("click", () => onChange({ sort, filters: {} }));
    panel.append(clear);
  }
  bar.append(main, sortPanel, panel);
  syncPanels();

  const closeAll = () => {
    browseUi.open = "";
    syncPanels();
  };
  const stop = () => {
    document.removeEventListener("pointerdown", onOutside);
    document.removeEventListener("keydown", onKey);
  };
  const onOutside = (event) => {
    if (!bar.isConnected) return stop();
    if (!bar.contains(event.target)) closeAll();
  };
  const onKey = (event) => {
    if (!bar.isConnected) return stop();
    if (event.key === "Escape") closeAll();
  };
  document.addEventListener("pointerdown", onOutside);
  document.addEventListener("keydown", onKey);
  return bar;
}

const genreSizeOptions = [25, 50, 75, 100];
const genrePageSizeKey = "librito-genre-page-size";
const searchPageSizeKey = "librito-search-page-size";

function getStoredSearchPageSize() {
  const size = Number(localStorage.getItem(searchPageSizeKey));
  return genreSizeOptions.includes(size) ? size : 25;
}
const genrePreviewStoreKey = "librito-genre-previews-v1";
const genrePreviewTtl = 24 * 60 * 60 * 1000;
const genrePageCache = new Map();
let genreCatalogPending = 0;

function getStoredGenrePageSize() {
  const size = Number(localStorage.getItem(genrePageSizeKey));
  return genreSizeOptions.includes(size) ? size : 25;
}

function readGenrePreviewStore() {
  try {
    return JSON.parse(localStorage.getItem(genrePreviewStoreKey) || "{}") || {};
  } catch {
    return {};
  }
}

function writeGenrePreview(genre, result) {
  try {
    const store = readGenrePreviewStore();
    store[genre.toLowerCase()] = { savedAt: Date.now(), total: result.total, books: result.books };
    localStorage.setItem(genrePreviewStoreKey, JSON.stringify(store));
  } catch (error) {
    console.warn("Could not save genre previews", error);
  }
}

function readGenrePreview(genre) {
  const entry = readGenrePreviewStore()[genre.toLowerCase()];
  return entry && Date.now() - entry.savedAt < genrePreviewTtl && Array.isArray(entry.books) ? entry : null;
}

// The single place that pulls a page of a genre's catalog. Home previews and genre pages share its cache.
function fetchGenreCatalogPage(genre, { sort = "", page = 1, size = 25, background = false, filters = {} } = {}) {
  const cacheKey = `${genre.toLowerCase()}|${sort}|${size}|${page}|${JSON.stringify(filters)}`;
  if (genrePageCache.has(cacheKey)) return genrePageCache.get(cacheKey);
  const load = async () => {
    const language = filters.lang === "all" ? "" : filters.lang || getDefaultBookLanguage();
    const clauses = [`subject:${JSON.stringify(genre)}`, language && `language:${language}`, "cover_i:[1 TO *]"];
    const yearRange = findFilterRange("year", filters.year);
    const lengthRange = findFilterRange("len", filters.len);
    const ratingRange = findFilterRange("rating", filters.rating);
    if (yearRange) clauses.push(`first_publish_year:[${yearRange[0]} TO ${yearRange[1]}]`);
    if (lengthRange) clauses.push(`number_of_pages_median:[${lengthRange[0]} TO ${lengthRange[1]}]`);
    if (ratingRange) clauses.push(`ratings_average:[${ratingRange[0]} TO *]`);
    const params = new URLSearchParams({
      q: clauses.filter(Boolean).join(" "),
      fields: "key,title,author_name,isbn,cover_i,subject,number_of_pages_median,first_publish_year",
      limit: String(size),
      offset: String((page - 1) * size),
    });
    const apiSort = browseSortOptions.find(([value]) => value === sort)?.[2];
    if (apiSort) params.set("sort", apiSort);
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const data = await fetchOpenLibrarySearch(params, 15000);
        const docs = Array.isArray(data.docs) ? data.docs : [];
        const seen = new Set();
        return {
          total: Number(data.numFound) || 0,
          books: docs.flatMap((work) => {
            if (!work.title || !work.author_name?.length || !work.cover_i) return [];
            const book = {
              title: work.title,
              author: work.author_name[0],
              genre,
              subjects: Array.isArray(work.subject) ? work.subject : [],
              isbn: Array.isArray(work.isbn) ? work.isbn[0] || "" : "",
              cover_i: work.cover_i,
              pages: work.number_of_pages_median,
              page_count: work.number_of_pages_median,
              first_publish_year: work.first_publish_year,
            };
            const key = getRecommendationKey(book);
            if (seen.has(key)) return [];
            seen.add(key);
            return [book];
          }),
        };
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
    }
    try {
      const fallback = await fetchGoogleCatalogBooks("", { genre, language: getDefaultBookLanguage(), max: size, startIndex: (page - 1) * size });
      const books = fallback.books.filter((book) => book.cover_url);
      if (books.length) return { total: fallback.total, books };
    } catch (error) {
      console.warn("Google Books genre fallback failed", error);
    }
    throw lastError;
  };
  // Background work (home previews) shares a small queue; a genre page the user opened never waits in it.
  const promise = (background ? runOpenLibraryTask(load) : load()).then((result) => {
    if (!sort && page === 1 && size === 25) writeGenrePreview(genre, result);
    return result;
  }, (error) => {
    genrePageCache.delete(cacheKey);
    throw error;
  });
  genrePageCache.set(cacheKey, promise);
  return promise;
}

function createGenrePager(page, totalPages, onGo) {
  const nav = document.createElement("nav");
  nav.className = "genre-pager";
  nav.setAttribute("aria-label", "Genre pages");
  const button = (label, target, { current = false, disabled = false, aria = "" } = {}) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `genre-pager-btn${current ? " active" : ""}`;
    item.textContent = label;
    item.disabled = disabled;
    if (aria) item.setAttribute("aria-label", aria);
    if (current) item.setAttribute("aria-current", "page");
    item.addEventListener("click", () => onGo(target));
    return item;
  };
  nav.append(button("‹ Prev", page - 1, { disabled: page <= 1, aria: "Previous page" }));
  const numbers = new Set([1, totalPages]);
  for (let number = page - 2; number <= page + 2; number += 1) {
    if (number >= 1 && number <= totalPages) numbers.add(number);
  }
  let previous = 0;
  [...numbers].sort((first, second) => first - second).forEach((number) => {
    if (number - previous > 1) {
      const gap = document.createElement("span");
      gap.className = "genre-pager-gap";
      gap.textContent = "…";
      nav.append(gap);
    }
    nav.append(button(String(number), number, { current: number === page, aria: `Page ${number}` }));
    previous = number;
  });
  nav.append(button("Next ›", page + 1, { disabled: page >= totalPages, aria: "Next page" }));
  return nav;
}

// Prev/next pager plus the per-page selector, shown together on the right above and below results.
function createPagingBar({ page, totalPages, size, onGo, onSize, leading = null }) {
  const bar = document.createElement("div");
  bar.className = "paging-bar";
  if (leading) {
    leading.classList.add("paging-leading");
    bar.append(leading);
  }
  if (totalPages > 1) bar.append(createGenrePager(page, totalPages, onGo));
  const label = document.createElement("label");
  label.className = "genre-size-control";
  label.append("Books per page ");
  const select = document.createElement("select");
  genreSizeOptions.forEach((option) => select.add(new Option(String(option), String(option), false, option === size)));
  select.addEventListener("change", () => onSize(Number(select.value)));
  label.append(select);
  bar.append(label);
  return bar;
}

let genrePageToken = 0;

function showGenrePage(genre, sort = "", page = 1, requestedSize = 0, filters = {}) {
  const token = ++genrePageToken;
  updateActiveNavigation("Discover");
  const view = showPage("genre");
  state.view = "genre";
  const displayGenre = [...getLibraryBooks().map((book) => book.genre), ...allGenres]
    .find((name) => name?.toLowerCase() === genre.toLowerCase()) || genre;
  if (!displayGenre) {
    view.append(createPageHeader("Browse by genre", "Genre not found"));
    return;
  }
  const spotlight = page === 1 && !sort && !countActiveFilters(filters) ? takeSpotlight(`genre:${displayGenre.toLowerCase()}`) : [];
  const size = genreSizeOptions.includes(requestedSize) ? requestedSize : getStoredGenrePageSize();
  const go = (values) => navigateTo("genre", { name: displayGenre, sort, size: String(size), ...filters, ...values });

  const genreControls = createBrowseControls({
    scope: `genre:${displayGenre.toLowerCase()}`,
    sort,
    filters,
    languages: true,
    onChange: (next) => go({ sort: next.sort, year: "", len: "", rating: "", lang: "", ...next.filters, page: "" }),
  });
  view.append(createPageHeader("Browse by genre", displayGenre, "Browse everything in the catalog."));

  const summary = document.createElement("p");
  summary.className = "genre-summary";
  summary.setAttribute("aria-live", "polite");
  const results = document.createElement("div");
  results.className = "genre-results";
  view.append(summary, results);
  results.append(createBookLoader({ message: `Loading ${displayGenre} books…` }));

  const render = (result) => {
    const totalPages = Math.max(1, Math.ceil(result.total / size));
    if (page > totalPages) {
      go({ page: String(totalPages) });
      return;
    }
    const first = (page - 1) * size + 1;
    summary.textContent = result.total
      ? `Showing ${first.toLocaleString()}–${Math.min(page * size, result.total).toLocaleString()} of ${result.total.toLocaleString()} books`
      : "";
    results.replaceChildren();
    if (!result.books.length) {
      const empty = document.createElement("p");
      empty.className = "row-empty-state";
      empty.textContent = countActiveFilters(filters) ? `No ${displayGenre} books match these filters.` : `No ${displayGenre} books found.`;
      const bar = document.createElement("div");
      bar.className = "paging-bar";
      genreControls.classList.add("paging-leading");
      bar.append(genreControls);
      results.append(bar, empty);
      return;
    }
    const library = getLibraryBooks();
    const grid = document.createElement("div");
    grid.className = "card-row expanded genre-browse-grid";
    withSpotlight(result.books, spotlight).slice(0, Math.max(size, result.books.length)).forEach((book) => grid.append(createBookCard(book, {
      recommendation: !library.some((owned) => isSameBookWork(owned, book)),
    })));
    const barOptions = {
      page,
      totalPages,
      size,
      onGo: (target) => go({ page: target > 1 ? String(target) : "" }),
      onSize: (nextSize) => {
        localStorage.setItem(genrePageSizeKey, String(nextSize));
        go({ size: String(nextSize), page: "" });
      },
    };
    results.append(createPagingBar({ ...barOptions, leading: genreControls }), grid, createPagingBar(barOptions));
  };

  const load = async () => {
    try {
      const result = await fetchGenreCatalogPage(displayGenre, { sort, page, size, filters });
      if (token !== genrePageToken) return;
      render(result);
      view.scrollIntoView({ block: "start" });
    } catch (error) {
      if (token !== genrePageToken) return;
      console.error(`Could not load ${displayGenre} books`, error);
      const failed = document.createElement("div");
      failed.className = "genre-error";
      const message = document.createElement("p");
      message.textContent = "Could not load books. Check your connection and try again.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary-btn";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => {
        results.replaceChildren(createBookLoader({ message: `Loading ${displayGenre} books…` }));
        load();
      });
      failed.append(message, retry);
      results.replaceChildren(failed);
    }
  };
  load();
}

function createPageHeader(kicker, title, description = "") {
  const header = document.createElement("header");
  header.className = "page-header";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "text-btn page-back";
  back.textContent = "‹ Home";
  back.addEventListener("click", () => navigateTo("home"));
  const heading = document.createElement("h1");
  heading.textContent = title;
  header.append(back);
  if (kicker && kicker.trim().toLowerCase() !== title.trim().toLowerCase()) {
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = kicker;
    header.append(eyebrow);
  }
  header.append(heading);
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
      const nextName = (await showAppPrompt("Rename shelf", {
        title: "Rename shelf",
        value: shelf.name,
        placeholder: "Shelf name",
      }))?.trim();
      if (!nextName || nextName === shelf.name) return;
      await renameShelf(shelf, nextName);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary-btn";
    remove.textContent = "Delete shelf";
    remove.addEventListener("click", async () => {
      const confirmed = await showAppConfirm(`Delete “${shelf.name}”? Books will stay in your library.`, {
        title: "Delete shelf",
        confirmLabel: "Delete shelf",
        danger: true,
      });
      if (confirmed) await deleteShelf(shelf);
    });
    toolbar.append(rename, remove);
  }
  const shelfBrowser = shelfName !== "Currently Reading" && shelfName !== "Completed Books" && books.length
    ? createShelfBrowser(books)
    : null;
  if (shelfName === "Currently Reading") {
    page.append(header, toolbar, createCurrentlyReadingList(books));
    return;
  }
  if (shelfName === "Completed Books") {
    page.append(header, createCompletedBooksList(books));
    return;
  }
  page.append(header, toolbar, shelfBrowser || createBookTable(books));
}

const shelfSortOptions = [
  ["added", "Recently added"],
  ["title", "Title: A to Z"],
  ["author", "Author: A to Z"],
  ["value", "Highest value"],
  ["new", "Newest published"],
  ["old", "Oldest published"],
  ["rating", "Top rated"],
];

function readBookMeta() {
  if (!bookMetaStore) {
    try {
      bookMetaStore = JSON.parse(localStorage.getItem(bookMetaKey) || "{}") || {};
    } catch {
      bookMetaStore = {};
    }
  }
  return bookMetaStore;
}

function applyBookMeta(book, meta) {
  if (!meta) return false;
  let changed = false;
  [["first_publish_year", meta.year], ["ratings_average", meta.rating], ["page_count", meta.pages]].forEach(([field, value]) => {
    if (value && !book[field] && !(field === "page_count" && book.pages)) {
      book[field] = value;
      changed = true;
    }
  });
  return changed;
}

function lookupBookMeta(key, book) {
  const store = readBookMeta();
  if (store[key]) return Promise.resolve();
  if (bookMetaPending.has(key)) return bookMetaPending.get(key);
  const task = (async () => {
    try {
      const isbn = String(book.isbn || "").replace(/[^0-9Xx]/g, "");
      const query = isbn ? `isbn:${isbn}` : `title:"${book.title}" author:"${String(book.author || "").split(",")[0]}"`;
      const params = new URLSearchParams({ q: query, limit: "1", fields: "first_publish_year,ratings_average,number_of_pages_median" });
      let doc = (await fetchOpenLibrarySearch(params)).docs?.[0];
      if (!doc && isbn) {
        params.set("q", `title:"${book.title}"`);
        doc = (await fetchOpenLibrarySearch(params)).docs?.[0];
      }
      store[key] = {
        year: doc?.first_publish_year || 0,
        rating: doc?.ratings_average ? Math.round(doc.ratings_average * 100) / 100 : 0,
        pages: doc?.number_of_pages_median || 0,
      };
    } catch {
      // Leave it unresolved so a later visit can retry.
    } finally {
      bookMetaPending.delete(key);
    }
  })();
  bookMetaPending.set(key, task);
  return task;
}

// Library rows don't store publish year or rating, so look them up once and remember them.
async function enrichLibraryBooks(books) {
  const missing = [];
  for (const book of books) {
    const key = getBookKey(book);
    if (!readBookMeta()[key]) missing.push([key, book]);
  }
  for (let i = 0; i < missing.length; i += 4) {
    await Promise.all(missing.slice(i, i + 4).map(([key, book]) => lookupBookMeta(key, book)));
  }
  if (!missing.length) return false;
  try {
    localStorage.setItem(bookMetaKey, JSON.stringify(readBookMeta()));
  } catch {
    // Storage full or unavailable; the lookup just repeats next session.
  }
  return true;
}

const shelfBrowse = { scope: "", sort: "added", filters: {}, page: 1 };

function createShelfBrowser(books, scope = `shelf:${state.currentShelf}`, extraLeading = null) {
  if (shelfBrowse.scope !== scope) {
    Object.assign(shelfBrowse, { scope, sort: "added", filters: {}, page: 1 });
  }
  const section = document.createElement("section");
  section.className = "search-result-group";
  const render = () => {
    const visible = applyBrowseControls(books, shelfBrowse.sort, shelfBrowse.filters);
    const size = getStoredSearchPageSize();
    const totalPages = Math.max(1, Math.ceil(visible.length / size));
    shelfBrowse.page = Math.min(Math.max(1, shelfBrowse.page), totalPages);
    const start = (shelfBrowse.page - 1) * size;
    const pageBooks = visible.slice(start, start + size);

    const controls = createBrowseControls({
      scope,
      sort: shelfBrowse.sort,
      filters: shelfBrowse.filters,
      sortOptions: shelfSortOptions,
      onChange: ({ sort, filters }) => {
        Object.assign(shelfBrowse, { sort, filters, page: 1 });
        render();
      },
    });
    const summary = document.createElement("p");
    summary.className = "genre-summary";
    summary.setAttribute("aria-live", "polite");
    summary.textContent = pageBooks.length
      ? `Showing ${start + 1}–${start + pageBooks.length} of ${visible.length} books`
      : "No books match these filters. Books missing year, page, or rating data are hidden when filtering by them.";
    const leading = document.createElement("div");
    leading.className = "browse-leading";
    if (extraLeading) leading.append(extraLeading);
    leading.append(controls);
    const bar = (lead = null) => createPagingBar({
      leading: lead,
      page: shelfBrowse.page,
      totalPages,
      size,
      onGo: (target) => {
        shelfBrowse.page = target;
        render();
        section.scrollIntoView({ block: "start" });
      },
      onSize: (next) => {
        localStorage.setItem(searchPageSizeKey, String(next));
        shelfBrowse.page = 1;
        render();
      },
    });
    const grid = document.createElement("div");
    grid.className = "card-row expanded genre-browse-grid";
    pageBooks.forEach((book) => grid.append(createBookCard(book)));
    section.replaceChildren(summary, bar(leading));
    if (pageBooks.length) section.append(grid);
    if (totalPages > 1) section.append(bar());
  };
  render();
  enrichLibraryBooks(books).then((changed) => {
    if (!changed || !section.isConnected) return;
    books.forEach((book) => applyBookMeta(book, readBookMeta()[getBookKey(book)]));
    render();
  });
  return section;
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
      ? `Bookmarked page ${book.current_page || 0} of ${pageCount}`
      : `Bookmarked page ${book.current_page || 0}`;
    const bookmarkedAt = document.createElement("span");
    bookmarkedAt.className = "currently-reading-bookmark-time";
    bookmarkedAt.textContent = formatBookmarkTimestamp(book.bookmarked_at);
    details.append(title, author, progress, bookmarkedAt);

    const controls = createCurrentlyReadingControls(book);
    row.append(coverButton, details, controls);
    list.append(row);
  });
  return list;
}

function createCurrentlyReadingControls(book) {
  const controls = document.createElement("div");
  controls.className = "currently-reading-controls";
  const pageCount = Number(book.page_count || book.pages);
  const pageInput = document.createElement("input");
  pageInput.type = "number";
  pageInput.min = "0";
  if (Number.isInteger(pageCount) && pageCount > 0) pageInput.max = String(pageCount);
  pageInput.step = "1";
  pageInput.value = String(book.current_page || 0);
  pageInput.className = "current-page-input";
  pageInput.setAttribute("aria-label", `Bookmarked page for ${book.title}`);
  const pageLabel = document.createElement("label");
  pageLabel.className = "bookmarked-page-field";
  const pageLabelText = document.createElement("span");
  pageLabelText.textContent = "Bookmarked page";
  pageLabel.append(pageLabelText, pageInput);
  const bookmarkPage = document.createElement("button");
  bookmarkPage.type = "button";
  bookmarkPage.className = "secondary-btn";
  bookmarkPage.textContent = "Bookmark page";
  bookmarkPage.addEventListener("click", () => saveCurrentPage(
    book,
    pageInput.value.trim() ? Number(pageInput.value) : Number.NaN
  ));
  const finishedReading = document.createElement("button");
  finishedReading.type = "button";
  finishedReading.className = "action-btn";
  finishedReading.textContent = "Finished reading";
  finishedReading.addEventListener("click", () => markBookAsRead(book));
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "secondary-btn";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove ${book.title} from Currently Reading`);
  remove.addEventListener("click", () => setReadingStatus(book, ""));
  const bookmarkedAt = document.createElement("span");
  bookmarkedAt.className = "currently-reading-bookmark-time";
  bookmarkedAt.textContent = formatBookmarkTimestamp(book.bookmarked_at);
  controls.append(pageLabel, bookmarkedAt, bookmarkPage, finishedReading, remove);
  return controls;
}

function showShelvesPage() {
  updateActiveNavigation("Your shelves");
  const page = showPage("shelves");
  const header = createPageHeader("", "Your shelves", "Your books, gathered into collections.");
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
      name: "Library",
      count: libraryBooks.filter((book) => !getBookShelfNames(book).length).length,
      color: "#8b5e3c",
      book: libraryBooks.find((book) => !getBookShelfNames(book).length),
    },
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

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base", numeric: true });
}

function showLibraryPage() {
  updateActiveNavigation("Your Library");
  const page = showPage("library");
  const header = createPageHeader("", "Your Library", "Every book you've added, all in one place.");
  const search = document.createElement("input");
  search.type = "search";
  search.className = "library-search";
  search.placeholder = "Search title, author, or genre…";
  search.setAttribute("aria-label", "Search your library");
  search.value = state.library.query;
  const results = document.createElement("div");
  results.className = "library-results";

  const build = () => {
    const query = state.library.query.trim().toLowerCase();
    const books = getLibraryBooks()
      .filter((book) => !query || [book.title, book.author, book.genre].some((v) => String(v || "").toLowerCase().includes(query)));
    results.replaceChildren();
    if (!books.length) {
      results.append(search);
      const empty = document.createElement("p");
      empty.className = "row-empty-state";
      empty.textContent = query ? "No books match your search." : "Books you add will appear here.";
      results.append(empty);
      return;
    }
    results.append(createShelfBrowser(books, "library", search));
  };
  page.append(header, results);
  search.addEventListener("input", () => {
    state.library.query = search.value;
    shelfBrowse.page = 1;
    build();
  });
  build();
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
  const breadcrumb = document.createElement("nav");
  breadcrumb.className = "book-breadcrumb";
  breadcrumb.setAttribute("aria-label", "Breadcrumb");
  const homeLink = document.createElement("button");
  homeLink.type = "button";
  homeLink.textContent = "Home";
  homeLink.addEventListener("click", () => navigateTo("home"));
  const separator = document.createElement("span");
  separator.setAttribute("aria-hidden", "true");
  separator.textContent = "›";
  const currentCrumb = document.createElement("span");
  currentCrumb.textContent = book.title || "Book";
  currentCrumb.setAttribute("aria-current", "page");
  breadcrumb.append(homeLink, separator, currentCrumb);

  const layout = document.createElement("div");
  layout.className = "book-detail-layout";
  const cover = createBookCover(book, "book-detail-cover");
  const intro = document.createElement("div");
  intro.className = "book-profile-intro";
  const heading = document.createElement("h1");
  heading.className = "book-profile-title";
  heading.textContent = book.title || "Untitled";
  const author = document.createElement("p");
  author.className = "book-profile-author";
  author.textContent = book.author || "Unknown author";
  const rating = document.createElement("div");
  rating.className = "book-profile-rating";
  rating.setAttribute("aria-live", "polite");
  rating.textContent = "Loading ratings…";
  const description = document.createElement("p");
  description.className = "book-profile-description";
  description.textContent = getBookProfileDescription(book) || "Looking up the book description…";
  const readMore = document.createElement("button");
  readMore.type = "button";
  readMore.className = "book-profile-read-more";
  readMore.textContent = "Read more";
  readMore.setAttribute("aria-expanded", "false");
  readMore.hidden = description.textContent.length <= 260;
  readMore.addEventListener("click", () => {
    const expanded = description.classList.toggle("is-expanded");
    readMore.setAttribute("aria-expanded", String(expanded));
    readMore.textContent = expanded ? "Read less" : "Read more";
  });
  const genres = document.createElement("div");
  genres.className = "book-profile-genres";
  renderBookGenreTags(genres, book.genre ? [book.genre] : []);
  intro.append(heading, author, rating, description, readMore, genres);

  const content = document.createElement("div");
  content.className = "book-detail-content";
  const metadata = document.createElement("div");
  metadata.className = "book-detail-metadata";
  const details = [
    ["Genre", book.genre || "—"],
    ["ISBN", book.isbn || "—"],
    ["Publication date", formatCatalogDate(book.publish_date || book.first_publish_year)],
    ["Pages", book.page_count || book.pages || "—"],
  ];
  details.forEach(([label, value], index) => {
    const field = document.createElement("div");
    field.className = "book-detail-field";
    const icon = document.createElement("span");
    icon.className = "book-metadata-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = ["◈", "▣", "▦", "▤"][index];
    const strong = document.createElement("strong");
    strong.textContent = label;
    const valueNode = document.createElement("span");
    valueNode.className = "book-detail-value";
    valueNode.textContent = Array.isArray(value) ? value[0] || "—" : String(value || "—");
    field.append(icon, strong, valueNode);
    metadata.append(field);
  });
  content.append(metadata);

  const actions = document.createElement("div");
  actions.className = "page-actions";
  const ownedBook = state.books.find((item) => getBookKey(item) === getBookKey(book));
  const isActiveLibraryBook = Boolean(ownedBook && !ownedBook.disposition);
  const isCurrentlyReading = ownedBook?.reading_status === "reading";
  const moreMenu = createBookMoreMenu(book, ownedBook);
  if (isActiveLibraryBook) {
    const currentlyReading = document.createElement("button");
    currentlyReading.type = "button";
    currentlyReading.className = `currently-reading-button${isCurrentlyReading ? " is-reading" : ""}`;
    currentlyReading.setAttribute("aria-pressed", String(isCurrentlyReading));
    const readingIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    readingIcon.setAttribute("viewBox", "0 0 24 24");
    readingIcon.setAttribute("aria-hidden", "true");
    readingIcon.classList.add("currently-reading-icon");
    const iconPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    iconPath.setAttribute("d", "M12 6.2C9.6 4.8 6.7 4.5 3.5 5.4v13.1c3.2-.9 6.1-.6 8.5.8m0-13.1c2.4-1.4 5.3-1.7 8.5-.8v13.1c-3.2-.9-6.1-.6-8.5.8m0-13.1v13.1");
    iconPath.setAttribute("fill", "none");
    iconPath.setAttribute("stroke", "currentColor");
    iconPath.setAttribute("stroke-linecap", "round");
    iconPath.setAttribute("stroke-linejoin", "round");
    iconPath.setAttribute("stroke-width", "1.7");
    readingIcon.append(iconPath);
    const toggleText = document.createElement("span");
    toggleText.textContent = isCurrentlyReading ? "Currently reading" : "Start reading";
    currentlyReading.append(readingIcon, toggleText);
    currentlyReading.addEventListener("click", () => setReadingStatus(
      ownedBook,
      isCurrentlyReading ? "" : "reading"
    ));
    actions.append(currentlyReading);
  } else {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "action-btn";
    add.textContent = ownedBook?.disposition ? "In Completed Books" : "＋ Mark as owned";
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
    actions.append(add);
  }
  const like = document.createElement("button");
  like.type = "button";
  like.className = "secondary-btn";
  like.textContent = ownedBook?.liked ? "♥ Liked" : "♡ Like";
  like.setAttribute("aria-pressed", String(Boolean(ownedBook?.liked)));
  like.addEventListener("click", () => {
    if (ownedBook) toggleBookLike(ownedBook);
    else showToast("Add this book to your library before liking it.");
  });
  actions.append(like);
  if (!isActiveLibraryBook) actions.append(moreMenu);
  content.append(actions);
  if (isActiveLibraryBook) {
    const readingActions = document.createElement("div");
    readingActions.className = "reading-actions";
    const pageCount = Number(ownedBook.page_count || ownedBook.pages);
    if (isCurrentlyReading && Number.isInteger(pageCount) && pageCount > 0) {
      readingActions.append(createBookReadingProgress(book, ownedBook, pageCount));
    }
    if (isCurrentlyReading) {
      const continueButton = document.createElement("button");
      continueButton.type = "button";
      continueButton.className = "action-btn book-continue-reading";
      continueButton.textContent = Number(ownedBook.current_page) > 0 ? "Move bookmark" : "Set bookmark";
      continueButton.addEventListener("click", () => setBookBookmark(ownedBook));
      readingActions.append(continueButton);
    }
    readingActions.append(createBookShelfMenu(ownedBook), moreMenu);
    content.append(readingActions);
  }
  layout.append(cover, intro, content);
  page.append(breadcrumb, layout);
  const below = document.createElement("div");
  below.className = "book-profile-below";
  const editions = createBookEditionPicker(book);
  const audiobook = createBookAudiobookPanel(book);
  const recommendations = document.createElement("div");
  recommendations.className = "book-profile-recommendations";
  const moreByAuthor = createProfileRecommendationSection(
    `More by ${book.author || "this author"}`,
    "Looking for more books by this author…"
  );
  const readersEnjoyed = createProfileRecommendationSection(
    "Readers also enjoyed",
    "Finding similar books…"
  );
  recommendations.append(moreByAuthor.section, readersEnjoyed.section);
  below.append(editions, audiobook, recommendations);
  page.append(below);
  loadBookProfileCatalog(book, { page, rating, description, readMore, editions });
  loadBookProfileAudiobook(book, audiobook);
  loadBookProfileRecommendations(book, moreByAuthor, readersEnjoyed);
}

function createBookEditionPicker(book) {
  const section = document.createElement("section");
  section.className = "edition-picker";
  const header = document.createElement("div");
  header.className = "edition-picker-heading";
  const copy = document.createElement("div");
  copy.className = "edition-picker-copy";
  const heading = document.createElement("h2");
  heading.textContent = "Choose your edition";
  const description = document.createElement("p");
  description.className = "page-description";
  description.textContent = "Compare available editions and choose the cover you prefer.";
  copy.append(heading, description);
  const loadButton = document.createElement("button");
  loadButton.type = "button";
  loadButton.className = "secondary-btn edition-picker-button";
  loadButton.textContent = "Refresh editions";
  header.append(copy, loadButton);
  const status = document.createElement("div");
  status.className = "edition-picker-status";
  status.setAttribute("role", "status");
  const choices = document.createElement("div");
  choices.className = "edition-cover-choices";
  setBookProfileLoadingStatus(status, "Finding available editions…");

  const languageFinder = document.createElement("div");
  languageFinder.className = "edition-language-finder";
  const languageLabel = document.createElement("div");
  languageLabel.className = "edition-language-label";
  languageLabel.textContent = "Find in another language";
  const languageSelect = document.createElement("select");
  languageSelect.className = "edition-language-select";
  languageSelect.add(new Option("Choose a language", ""));
  const allLanguagesGroup = document.createElement("optgroup");
  allLanguagesGroup.label = "Any language";
  allLanguagesGroup.append(new Option("All languages", "all"));
  const specificLanguagesGroup = document.createElement("optgroup");
  specificLanguagesGroup.label = "Specific language";
  openLibraryLanguages.forEach(([code, name]) => specificLanguagesGroup.append(new Option(name, code)));
  languageSelect.append(allLanguagesGroup, specificLanguagesGroup);
  languageSelect.hidden = true;
  languageSelect.tabIndex = -1;

  const languageMenu = document.createElement("div");
  languageMenu.className = "edition-language-menu";
  const languageTrigger = document.createElement("button");
  languageTrigger.type = "button";
  languageTrigger.className = "edition-language-trigger";
  languageTrigger.setAttribute("aria-haspopup", "listbox");
  languageTrigger.setAttribute("aria-expanded", "false");
  const languageTriggerText = document.createElement("span");
  languageTrigger.append(languageTriggerText);
  const languageList = document.createElement("div");
  languageList.className = "edition-language-list";
  languageList.setAttribute("role", "listbox");
  languageList.hidden = true;

  const languageOptionButtons = [];
  const addLanguageGroup = (title, items) => {
    if (title) {
      const groupTitle = document.createElement("div");
      groupTitle.className = "edition-language-group";
      groupTitle.textContent = title;
      languageList.append(groupTitle);
    }
    items.forEach(([code, name]) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "edition-language-option";
      option.setAttribute("role", "option");
      option.dataset.value = code;
      option.textContent = name;
      languageOptionButtons.push(option);
      languageList.append(option);
    });
  };
  addLanguageGroup("Any language", [["all", "All languages"]]);
  addLanguageGroup("Specific language", openLibraryLanguages);

  const syncLanguageMenu = () => {
    const selected = languageSelect.selectedOptions[0];
    languageTriggerText.textContent = selected ? selected.textContent : "Choose a language";
    languageOptionButtons.forEach((option) => {
      option.setAttribute("aria-selected", String(option.dataset.value === languageSelect.value));
    });
  };
  const setLanguageMenuOpen = (open) => {
    languageList.hidden = !open;
    languageTrigger.setAttribute("aria-expanded", String(open));
    if (open) {
      const current = languageList.querySelector('[aria-selected="true"]');
      if (current) current.scrollIntoView({ block: "nearest" });
    }
  };
  languageTrigger.addEventListener("click", () => setLanguageMenuOpen(languageList.hidden));
  languageList.addEventListener("click", (event) => {
    const option = event.target.closest(".edition-language-option");
    if (!option) return;
    languageSelect.value = option.dataset.value;
    languageSelect.dispatchEvent(new Event("change"));
    setLanguageMenuOpen(false);
    languageTrigger.focus();
  });
  languageMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !languageList.hidden) {
      setLanguageMenuOpen(false);
      languageTrigger.focus();
    }
  });
  const closeOnOutsideClick = (event) => {
    if (!languageMenu.isConnected) {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
    } else if (!languageMenu.contains(event.target)) {
      setLanguageMenuOpen(false);
    }
  };
  document.addEventListener("pointerdown", closeOnOutsideClick);
  languageSelect.addEventListener("change", syncLanguageMenu);
  syncLanguageMenu();
  languageMenu.append(languageTrigger, languageList, languageSelect);
  languageLabel.append(languageMenu);
  languageSelect.addEventListener("change", () => {
    if (languageSelect.value) loadBookProfileEditionsInLanguage(book, section, languageSelect.value);
  });
  languageFinder.append(languageLabel);
  section.append(header, languageFinder, status, choices);

  loadButton.addEventListener("click", () => {
    languageSelect.value = "";
    syncLanguageMenu();
    loadBookProfileEditions(book, section);
  });
  section.dataset.status = "loading";
  return section;
}

function createBookAudiobookPanel(book) {
  const section = document.createElement("section");
  section.className = "book-audiobook-panel";
  const heading = document.createElement("h2");
  heading.textContent = "Listen to the audiobook";
  const status = document.createElement("p");
  status.className = "audiobook-status";
  status.setAttribute("role", "status");
  status.textContent = "Checking for audiobook editions…";
  section.append(heading, status);
  return section;
}

function createProfileRecommendationSection(title, message) {
  const wrapper = document.createElement("section");
  wrapper.className = "book-profile-recommendation";
  wrapper.dataset.status = "loading";
  const header = document.createElement("div");
  header.className = "book-profile-recommendation-heading";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const status = document.createElement("div");
  status.className = "book-recommendation-status";
  status.setAttribute("role", "status");
  setBookProfileLoadingStatus(status, message);
  header.append(heading);
  wrapper.append(header, status);
  return { section: wrapper, status };
}

function updateBookPageDetails(book, { clearMissingPageCount = false } = {}) {
  state.currentBook = book;
  const page = document.getElementById("pageView");
  const heading = page.querySelector(".book-profile-title");
  if (heading) heading.textContent = book.title || "Untitled";
  const breadcrumb = page.querySelector(".book-breadcrumb [aria-current='page']");
  if (breadcrumb) breadcrumb.textContent = book.title || "Book";
  const existingCover = page.querySelector(".book-detail-cover");
  if (existingCover) existingCover.replaceWith(createBookCover(book, "book-detail-cover"));
  const values = {
    Genre: book.genre || null,
    ISBN: book.isbn || null,
    "Publication date": book.publish_date || book.first_publish_year
      ? formatCatalogDate(book.publish_date || book.first_publish_year)
      : null,
    Pages: book.page_count || book.pages || (clearMissingPageCount ? "—" : null),
  };
  page.querySelectorAll(".book-detail-field").forEach((field) => {
    const label = field.querySelector("strong")?.textContent.trim();
    if (!label || !(label in values) || values[label] === null) return;
    const value = field.querySelector(".book-detail-value");
    if (value && label === "Genre") renderBookGenreTags(value, String(values[label]).split(","));
    else if (value) value.textContent = values[label];
    else field.replaceChildren(field.querySelector("strong"), document.createTextNode(` ${values[label]}`));
  });
  const introGenres = page.querySelector(".book-profile-genres");
  if (introGenres && book.genre) renderBookGenreTags(introGenres, String(book.genre).split(","));
  updateBookReadingProgress(book);
}

function normalizeBookIsbn(value) {
  return (Array.isArray(value) ? value[0] : value || "").toString().replace(/[^0-9Xx]/g, "");
}

function getBookEditionProgressKey(edition) {
  const isbn = normalizeBookIsbn(edition.isbn);
  if (!isbn) return "";
  const isbn10Valid = /^\d{9}[\dX]$/i.test(isbn)
    && [...isbn.toUpperCase()].reduce((sum, digit, index) =>
      sum + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0) % 11 === 0;
  if (isbn10Valid) {
    const base = `978${isbn.slice(0, 9)}`;
    const checksum = [...base].reduce((sum, digit, index) =>
      sum + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return `isbn:${base}${(10 - checksum % 10) % 10}`;
  }
  return `isbn:${isbn.toUpperCase()}`;
}

function getEditionProgress(book, editionKey = getBookEditionProgressKey(book)) {
  if (!editionKey) return null;
  const isbn = normalizeBookIsbn(book.isbn);
  const legacyIsbnKey = isbn ? `isbn:${isbn.toUpperCase()}` : "";
  const progress = book.edition_progress?.[editionKey]
    || (legacyIsbnKey !== editionKey ? book.edition_progress?.[legacyIsbnKey] : null);
  return progress && typeof progress === "object" ? progress : null;
}

function isCurrentBookEdition(book, details) {
  const bookKey = getBookEditionProgressKey(book);
  return Boolean(bookKey && bookKey === getBookEditionProgressKey(details));
}

function createBookReadingProgress(book, ownedBook, pageCount) {
  const currentPage = Math.min(pageCount, Math.max(0, Number(ownedBook.current_page) || 0));
  const percentage = Math.round(currentPage / pageCount * 100);
  const progress = document.createElement("div");
  progress.className = "book-reading-progress";
  const progressLabel = document.createElement("span");
  progressLabel.className = "book-reading-progress-label";
  progressLabel.textContent = "Page progress";
  const progressCopy = document.createElement("span");
  progressCopy.className = "book-reading-progress-copy";
  progressCopy.textContent = `${currentPage} of ${pageCount} pages`;
  const progressTrack = document.createElement("div");
  progressTrack.className = "book-reading-progress-track";
  progressTrack.setAttribute("role", "progressbar");
  progressTrack.setAttribute("aria-label", `Reading progress for ${book.title}`);
  progressTrack.setAttribute("aria-valuemin", "0");
  progressTrack.setAttribute("aria-valuemax", String(pageCount));
  progressTrack.setAttribute("aria-valuenow", String(currentPage));
  const progressFill = document.createElement("span");
  progressFill.style.width = `${percentage}%`;
  progressTrack.append(progressFill);
  const progressPercent = document.createElement("span");
  progressPercent.className = "book-reading-progress-percent";
  progressPercent.textContent = `${percentage}%`;
  progress.append(progressLabel, progressCopy, progressTrack, progressPercent);
  return progress;
}

function updateBookReadingProgress(book, catalogPageCount = null) {
  const page = document.getElementById("pageView");
  const readingActions = page.querySelector(".reading-actions");
  if (!readingActions) return;
  const progress = readingActions.querySelector(".book-reading-progress");
  const ownedBook = state.books.find((item) => getBookKey(item) === getBookKey(book));
  const pageCount = Number(catalogPageCount || ownedBook?.page_count || ownedBook?.pages
    || book.page_count || book.pages);
  if (!ownedBook || ownedBook.disposition || ownedBook.reading_status !== "reading"
    || !Number.isInteger(pageCount) || pageCount <= 0) {
    progress?.remove();
    return;
  }
  const updatedProgress = createBookReadingProgress(book, ownedBook, pageCount);
  if (progress) progress.replaceWith(updatedProgress);
  else readingActions.prepend(updatedProgress);
}

function renderBookGenreTags(container, genres) {
  container.replaceChildren();
  const uniqueGenres = [...new Set(genres.filter(Boolean))].slice(0, 4);
  if (!uniqueGenres.length) {
    const missing = document.createElement("span");
    missing.textContent = "—";
    container.append(missing);
    return;
  }
  uniqueGenres.forEach((genre) => {
    const tag = document.createElement("span");
    tag.className = "book-profile-genre";
    tag.textContent = genre;
    container.append(tag);
  });
}

function createBookShelfMenu(book) {
  const menu = document.createElement("details");
  menu.className = "book-shelf-menu";
  const summary = document.createElement("summary");
  summary.className = "secondary-btn";
  summary.textContent = "＋  Add to shelf";
  const panel = document.createElement("div");
  panel.className = "card-add-actions";
  const shelfNames = getBookShelfNames(book);
  state.shelves.forEach((shelf) => {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = shelfNames.includes(shelf.name) ? `✓ ${shelf.name}` : shelf.name;
    option.disabled = shelfNames.includes(shelf.name);
    option.addEventListener("click", () => {
      menu.open = false;
      addBookToShelf(book, shelf);
    });
    panel.append(option);
  });
  const create = document.createElement("button");
  create.type = "button";
  create.textContent = "＋ New shelf";
  create.addEventListener("click", () => {
    menu.open = false;
    openShelfDrawer();
  });
  panel.append(create);
  menu.append(summary, panel);
  wireCardPopover(menu, summary, panel);
  return menu;
}

function createBookMoreMenu(book, ownedBook) {
  const menu = document.createElement("details");
  menu.className = "book-more-menu";
  const summary = document.createElement("summary");
  summary.textContent = "•••";
  summary.setAttribute("aria-label", "More book actions");
  const panel = document.createElement("div");
  panel.className = "book-more-menu-panel";
  if (ownedBook?.reading_status === "reading") {
    const finished = document.createElement("button");
    finished.type = "button";
    finished.textContent = "Mark as finished";
    finished.addEventListener("click", () => markBookAsRead(ownedBook));
    panel.append(finished);
  }
  if (ownedBook) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-action";
    remove.textContent = "Remove from library";
    remove.addEventListener("click", () => removeBookFromLibrary(ownedBook));
    panel.append(remove);
  } else {
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add to my library";
    add.addEventListener("click", () => markBookAsOwned(book));
    panel.append(add);
  }
  menu.append(summary, panel);
  return menu;
}

function getBookProfileDescription(book) {
  if (typeof book.description === "string") return book.description.trim();
  if (typeof book.description?.value === "string") return book.description.value.trim();
  return "";
}

function formatCatalogDate(value) {
  if (!value) return "—";
  if (/^\d{4}$/.test(String(value))) return String(value);
  const isoDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = isoDate
    ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function bookProfileIsActive(book, page) {
  return state.view === "book" && state.currentBook === book && page.isConnected;
}

function getBookProfileQuery(book, isbnOnly = false) {
  const isbn = normalizeBookIsbn(book.isbn);
  if (isbnOnly && isbn) return `isbn:${isbn}`;
  return [
    book.title && `intitle:${JSON.stringify(book.title)}`,
    book.author && `inauthor:${JSON.stringify(book.author)}`,
  ].filter(Boolean).join(" ");
}

async function fetchGoogleBookVolumes(query) {
  const params = new URLSearchParams({ q: query, maxResults: "20", printType: "books" });
  const payload = await fetchJsonCached(`https://www.googleapis.com/books/v1/volumes?${params}`);
  return Array.isArray(payload.items) ? payload.items : [];
}

function googleVolumeToBook(volume, genre = "") {
  const info = volume.volumeInfo || {};
  if (!info.title) return null;
  const identifiers = info.industryIdentifiers || [];
  const isbnList = identifiers.map((item) => item.identifier).filter(Boolean);
  const thumbnail = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "";
  return {
    title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title,
    author: info.authors?.[0] || "Unknown author",
    author_name: info.authors || [],
    isbn: isbnList.find((value) => value.length === 13) || isbnList[0] || "",
    isbnList,
    cover_url: thumbnail.replace(/^http:/, "https:").replace("&edge=curl", ""),
    subjects: info.categories || [],
    genre: genre || info.categories?.[0] || "",
    language: info.language || "",
    pages: info.pageCount || undefined,
    page_count: info.pageCount || undefined,
    first_publish_year: Number.parseInt(info.publishedDate, 10) || undefined,
  };
}

// Google Books tolerates misspellings, so it backs up Open Library when that is slow, down, or finds nothing.
async function fetchGoogleCatalogBooks(query, { genre = "", language = "", max = 40, startIndex = 0 } = {}) {
  const params = new URLSearchParams({
    q: genre ? `subject:${JSON.stringify(genre)}` : query,
    maxResults: String(Math.min(max, 40)),
    startIndex: String(startIndex),
    printType: "books",
  });
  if (language && language.length === 3) {
    const twoLetter = { eng: "en", spa: "es", fre: "fr", ger: "de", ita: "it", por: "pt" }[language];
    if (twoLetter) params.set("langRestrict", twoLetter);
  }
  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Google Books responded with ${response.status}`);
  const payload = await response.json();
  const seen = new Set();
  return {
    total: Number(payload.totalItems) || 0,
    books: (Array.isArray(payload.items) ? payload.items : []).flatMap((volume) => {
      const book = googleVolumeToBook(volume, genre);
      if (!book) return [];
      const key = `${normalizeBookText(book.title)}|${normalizeBookText(book.author)}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [book];
    }),
  };
}

function editDistance(a, b) {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

function fuzzyTermMatches(term, words) {
  const allowed = term.length <= 3 ? 0 : term.length <= 6 ? 1 : 2;
  return words.some((word) => word.includes(term) || (allowed > 0 && editDistance(term, word) <= allowed));
}

async function fetchBookProfileVolumes(book) {
  const queries = [getBookProfileQuery(book, true), getBookProfileQuery(book)]
    .filter((query, index, all) => query && all.indexOf(query) === index);
  const results = await Promise.allSettled(queries.map(fetchGoogleBookVolumes));
  const volumes = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") volumes.push(...result.value);
    else console.error("Could not load Google Books catalog results", result.reason);
  });
  if (!results.some((result) => result.status === "fulfilled")) {
    throw new Error("Google Books catalog lookup failed.");
  }
  const title = normalizeBookText(book.title);
  const author = normalizeBookText(book.author);
  const isbn = normalizeBookIsbn(book.isbn);
  const uniqueVolumes = [...new Map(volumes.map((volume) => [volume.id, volume])).values()];
  return uniqueVolumes.filter((volume) => {
    const info = volume.volumeInfo || {};
    const titleMatch = normalizeBookText(info.title).includes(title)
      || title.includes(normalizeBookText(info.title));
    const authorMatch = !author || (info.authors || []).some((name) =>
      normalizeBookText(name).includes(author) || author.includes(normalizeBookText(name))
    );
    const isbnMatch = isbn && (info.industryIdentifiers || []).some((identifier) =>
      normalizeBookIsbn(identifier.identifier) === isbn
    );
    return Boolean(isbnMatch || (title && titleMatch && authorMatch));
  });
}

function normalizeBookText(value) {
  return (value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

async function fetchOpenLibraryBookDetails(book) {
  const params = new URLSearchParams({
    q: [book.title, book.author].filter(Boolean).join(" "),
    fields: "key,title,author_name,ratings_average,ratings_count,first_publish_year,number_of_pages_median,first_sentence",
    limit: "10",
  });
  const payload = await fetchOpenLibrarySearch(params);
  const title = normalizeBookText(book.title);
  const author = normalizeBookText(book.author);
  const match = (payload.docs || []).find((doc) =>
    normalizeBookText(doc.title) === title
    && (!author || (doc.author_name || []).some((name) => normalizeBookText(name).includes(author)))
    && /^\/works\/[^/]+$/.test(doc.key || "")
  );
  if (!match) throw new Error("No matching Open Library work was found.");

  const [workResult, ratingsResult] = await Promise.allSettled([
    fetch(`https://openlibrary.org${match.key}.json`).then(async (workResponse) => {
      if (!workResponse.ok) throw new Error(`Open Library work responded with ${workResponse.status}`);
      return workResponse.json();
    }),
    fetch(`https://openlibrary.org${match.key}/ratings.json`).then(async (ratingsResponse) => {
      if (!ratingsResponse.ok) throw new Error(`Open Library ratings responded with ${ratingsResponse.status}`);
      return ratingsResponse.json();
    }),
  ]);
  if (workResult.status === "rejected") console.error("Could not load Open Library work details", workResult.reason);
  if (ratingsResult.status === "rejected") console.error("Could not load Open Library ratings", ratingsResult.reason);

  const work = workResult.status === "fulfilled" ? workResult.value : {};
  const description = typeof work.description === "string"
    ? work.description
    : work.description?.value || (Array.isArray(match.first_sentence) ? match.first_sentence[0] : "");
  const ratingSummary = ratingsResult.status === "fulfilled" ? ratingsResult.value.summary : null;
  const categories = (Array.isArray(work.subjects) ? work.subjects : [])
    .filter((subject) => !subject.includes(":"))
    .sort((first, second) =>
      Number(second.toLowerCase() === "fiction") - Number(first.toLowerCase() === "fiction")
    );
  return {
    title: match.title || book.title,
    description,
    categories,
    average_rating: Number(ratingSummary?.average ?? match.ratings_average) || 0,
    ratings_count: Number(ratingSummary?.count ?? match.ratings_count) || 0,
    publish_date: match.first_publish_year ? String(match.first_publish_year) : "",
    page_count: Number(match.number_of_pages_median) || null,
  };
}

function getBestGoogleBookVolume(book, volumes) {
  const title = normalizeBookText(book.title);
  const author = normalizeBookText(book.author);
  const isbn = normalizeBookIsbn(book.isbn);
  return volumes.slice().sort((first, second) => {
    const score = (volume) => {
      const info = volume.volumeInfo || {};
      const titleMatch = normalizeBookText(info.title) === title;
      const authorMatch = (info.authors || []).some((name) => normalizeBookText(name) === author);
      const isbnMatch = (info.industryIdentifiers || []).some((identifier) =>
        normalizeBookIsbn(identifier.identifier) === isbn && isbn
      );
      return Number(isbnMatch) * 8 + Number(titleMatch) * 4 + Number(authorMatch) * 3
        + Number(Boolean(info.averageRating)) + Number(Boolean(info.description));
    };
    return score(second) - score(first);
  })[0] || null;
}

function getGoogleBookDetails(volume) {
  const info = volume?.volumeInfo || {};
  const identifiers = info.industryIdentifiers || [];
  const isbn = identifiers.find((identifier) => identifier.type === "ISBN_13")?.identifier
    || identifiers.find((identifier) => identifier.type === "ISBN_10")?.identifier
    || "";
  const image = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "";
  return {
    title: info.title || "",
    author: (info.authors || []).join(", "),
    isbn,
    cover_url: image.replace(/^http:/, "https:"),
    page_count: Number(info.pageCount) || null,
    publish_date: formatCatalogDate(info.publishedDate),
    publisher: info.publisher || "",
    language: info.language || "",
    categories: Array.isArray(info.categories) ? info.categories : [],
    description: info.description
      ? new DOMParser().parseFromString(info.description, "text/html").body.textContent.trim()
      : "",
    average_rating: Number(info.averageRating) || 0,
    ratings_count: Number(info.ratingsCount) || 0,
    preview_url: info.previewLink || "",
    info_url: info.infoLink || "",
    format: volume.saleInfo?.isEbook ? "eBook" : info.physical_format || "Print edition",
    price: volume.saleInfo?.retailPrice?.amount ?? volume.saleInfo?.listPrice?.amount ?? null,
    currency: volume.saleInfo?.retailPrice?.currencyCode || volume.saleInfo?.listPrice?.currencyCode || "",
  };
}

function getEditionLanguageName(code) {
  if (!code) return "";
  if (code.length === 3 && openLibraryLanguages.some(([known]) => known === code)) return getOpenLibraryLanguageName(code);
  try {
    return new Intl.DisplayNames([navigator.language], { type: "language" }).of(code) || code;
  } catch {
    return code;
  }
}

function getBookEditionCoverUrl(book, details, size = "M") {
  if (details.cover_url) return details.cover_url;
  if (details.isbn) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(details.isbn)}-${size}.jpg?default=false`;
  }
  return book.cover_url || "";
}

function renderBookRating(container, details, book) {
  container.replaceChildren();
  const average = details?.average_rating || 0;
  const count = details?.ratings_count || 0;
  if (average && count) {
    const stars = document.createElement("span");
    stars.className = "book-rating-stars";
    const filledStars = Math.min(5, Math.max(0, Math.round(average)));
    stars.textContent = `${"★".repeat(filledStars)}${"☆".repeat(5 - filledStars)}`;
    stars.setAttribute("role", "img");
    stars.setAttribute("aria-label", `${average.toFixed(1)} out of 5 stars`);
    const score = document.createElement("span");
    score.textContent = `${average.toFixed(1)} (${count.toLocaleString()} ratings)`;
    container.append(stars, score);
  } else {
    const unavailable = document.createElement("span");
    unavailable.className = "book-rating-unavailable";
    unavailable.textContent = "Ratings unavailable";
    container.append(unavailable);
  }
  const reviews = document.createElement("a");
  reviews.href = `https://www.goodreads.com/search?q=${encodeURIComponent(`${book.title || ""} ${book.author || ""}`.trim())}`;
  reviews.target = "_blank";
  reviews.rel = "noopener noreferrer";
  reviews.textContent = "See reviews →";
  container.append(reviews);
}

function renderBookProfileDescription(container, button, text) {
  const clean = text.trim();
  container.textContent = clean || "A description is not available from the catalog yet.";
  container.classList.remove("is-expanded");
  button.hidden = clean.length <= 260;
  button.textContent = "Read more";
  button.setAttribute("aria-expanded", "false");
}

function renderBookProfileEditions(book, section, volumes, { groupByLanguage: grouped = false } = {}) {
  const status = section.querySelector(".edition-picker-status");
  const choices = section.querySelector(".edition-cover-choices");
  choices.replaceChildren();
  const seenEditionIsbns = new Set();
  const editions = volumes.map((volume) => ({ volume, details: getGoogleBookDetails(volume) }))
    .filter(({ details }) => details.cover_url || details.isbn)
    .filter(({ details }) => {
      const isbnKey = getBookEditionProgressKey(details);
      if (!isbnKey) return true;
      if (seenEditionIsbns.has(isbnKey)) return false;
      seenEditionIsbns.add(isbnKey);
      return true;
    });
  const languageGroups = grouped
    ? groupByLanguage(editions, ({ details }) => details.language)
      .map(([label, group]) => [label, group.slice(0, 8)])
    : [["", editions.slice(0, 8)]];
  const visibleCount = languageGroups.reduce((total, [, group]) => total + group.length, 0);
  if (!visibleCount) {
    status.textContent = "No editions with covers are available in the catalog.";
    section.dataset.status = "empty";
    return;
  }
  status.textContent = grouped
    ? `${visibleCount} edition${visibleCount === 1 ? "" : "s"} in ${languageGroups.length} language${languageGroups.length === 1 ? "" : "s"}. Select one to update your book.`
    : `${visibleCount} available edition${visibleCount === 1 ? "" : "s"}. Select one to update your book.`;
  section.dataset.status = "loaded";
  languageGroups.forEach(([groupLabel, group]) => {
    if (grouped) {
      const heading = document.createElement("h3");
      heading.className = "edition-language-heading";
      heading.textContent = groupLabel;
      choices.append(heading);
    }
    group.forEach(({ volume, details }) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "edition-cover-choice";
      const selected = isCurrentBookEdition(book, details);
      choice.setAttribute("aria-pressed", String(selected));
      choice.setAttribute("aria-label", `Select ${details.format} edition of ${details.title || book.title}`);
      choice.append(createBookCover({
        title: details.title || book.title,
        cover_url: getBookEditionCoverUrl(book, details),
      }, "edition-cover-choice-cover"));
      const copy = document.createElement("span");
      copy.className = "edition-cover-copy";
      const format = document.createElement("span");
      format.className = "edition-format";
      format.textContent = details.format;
      const title = document.createElement("strong");
      title.textContent = details.title || book.title || "Untitled";
      const metadata = document.createElement("span");
      metadata.textContent = [
        details.author || book.author || "",
        details.publisher,
        details.publish_date,
        details.page_count && `${details.page_count} pages`,
        details.isbn && `ISBN ${details.isbn}`,
      ].filter(Boolean).join(" · ");
      const price = document.createElement("span");
      price.className = "edition-price";
      price.textContent = details.price === null
        ? "Price not listed"
        : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: details.currency || "USD",
        }).format(details.price);
      const selectedLabel = document.createElement("span");
      selectedLabel.className = "edition-select-label";
      selectedLabel.textContent = selected ? "✓ Current edition" : "View edition details";
      copy.append(format, title, metadata, price, selectedLabel);
      choice.append(copy);
      choice.addEventListener("click", () => openBookEditionDetails(book, details, section, volumes, choice));
      choices.append(choice);
    });
  });
}

function ensureEditionDialog() {
  if (editionDialogOverlay) return editionDialogOverlay;
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay hidden edition-dialog-overlay";
  const dialog = document.createElement("section");
  dialog.className = "dialog-card edition-dialog-card";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const header = document.createElement("div");
  header.className = "dialog-head";
  const title = document.createElement("h2");
  title.className = "edition-dialog-title";
  title.id = "editionDialogTitle";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn";
  close.setAttribute("aria-label", "Close edition details");
  close.textContent = "✕";
  close.addEventListener("click", () => closeBookEditionDialog());
  header.append(title, close);
  const content = document.createElement("div");
  content.className = "edition-dialog-content";
  dialog.append(header, content);
  overlay.append(dialog);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeBookEditionDialog();
  });
  document.body.append(overlay);
  editionDialogOverlay = overlay;
  return overlay;
}

function ensureAppDialog() {
  if (appDialogOverlay) return appDialogOverlay;
  const overlay = document.createElement("div");
  overlay.className = "dialog-overlay hidden app-dialog-overlay";
  const dialog = document.createElement("section");
  dialog.className = "dialog-card app-dialog-card";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  const header = document.createElement("div");
  header.className = "dialog-head";
  const title = document.createElement("h2");
  title.className = "app-dialog-title";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "icon-btn";
  close.setAttribute("aria-label", "Cancel");
  close.textContent = "✕";
  close.addEventListener("click", () => settleAppDialog(null));
  header.append(title, close);
  const message = document.createElement("p");
  message.className = "app-dialog-message";
  const form = document.createElement("form");
  form.className = "app-dialog-form";
  const input = document.createElement("input");
  input.className = "app-dialog-input";
  input.type = "text";
  input.autocomplete = "off";
  input.hidden = true;
  form.append(input);
  const actions = document.createElement("div");
  actions.className = "app-dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary-btn";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => settleAppDialog(null));
  const confirm = document.createElement("button");
  confirm.type = "submit";
  confirm.className = "action-btn";
  actions.append(cancel, confirm);
  form.append(actions);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    settleAppDialog(input.hidden ? true : input.value);
  });
  dialog.append(header, message, form);
  overlay.append(dialog);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) settleAppDialog(null);
  });
  document.body.append(overlay);
  appDialogOverlay = overlay;
  return overlay;
}

function settleAppDialog(result) {
  if (!appDialogOverlay) return;
  const resolver = appDialogResolver;
  const returnFocus = appDialogReturnFocus;
  appDialogResolver = null;
  appDialogReturnFocus = null;
  appDialogOverlay.classList.add("hidden");
  appDialogOverlay.querySelector(".app-dialog-form").reset();
  if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
  resolver?.(result);
}

function showAppDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  input = null,
}) {
  if (appDialogResolver) settleAppDialog(null);
  const overlay = ensureAppDialog();
  const dialog = overlay.querySelector("[role='dialog']");
  const heading = overlay.querySelector(".app-dialog-title");
  const messageNode = overlay.querySelector(".app-dialog-message");
  const form = overlay.querySelector(".app-dialog-form");
  const inputNode = overlay.querySelector(".app-dialog-input");
  const cancel = form.querySelector(".secondary-btn");
  const confirm = form.querySelector(".action-btn");
  heading.textContent = title;
  messageNode.textContent = message;
  dialog.setAttribute("aria-labelledby", `appDialogTitle`);
  heading.id = "appDialogTitle";
  cancel.textContent = cancelLabel;
  confirm.textContent = confirmLabel;
  confirm.classList.toggle("danger-action", danger);
  inputNode.hidden = !input;
  inputNode.value = input?.value || "";
  inputNode.placeholder = input?.placeholder || "";
  appDialogReturnFocus = document.activeElement;
  overlay.classList.remove("hidden");
  (input ? inputNode : confirm).focus();
  return new Promise((resolve) => {
    appDialogResolver = resolve;
  });
}

async function showAppConfirm(message, options = {}) {
  return (await showAppDialog({ message, ...options })) === true;
}

async function showAppPrompt(message, options = {}) {
  const result = await showAppDialog({ message, ...options, input: options });
  return typeof result === "string" ? result : null;
}

function openBookEditionDialog(titleText, content, returnFocus) {
  const overlay = ensureEditionDialog();
  const heading = overlay.querySelector(".edition-dialog-title");
  const dialog = overlay.querySelector("[role='dialog']");
  const body = overlay.querySelector(".edition-dialog-content");
  heading.textContent = titleText;
  dialog.setAttribute("aria-labelledby", heading.id);
  body.replaceChildren(content);
  editionDialogReturnFocus = returnFocus instanceof HTMLElement ? returnFocus : document.activeElement;
  overlay.classList.remove("hidden");
  overlay.querySelector(".icon-btn").focus();
}

function closeBookEditionDialog(restoreFocus = true) {
  if (!editionDialogOverlay) return;
  editionDialogOverlay.classList.add("hidden");
  editionDialogOverlay.querySelector(".edition-dialog-content").replaceChildren();
  if (restoreFocus && editionDialogReturnFocus instanceof HTMLElement && editionDialogReturnFocus.isConnected) {
    editionDialogReturnFocus.focus();
  }
  editionDialogReturnFocus = null;
}

function createEditionMetadataList(details, book) {
  const list = document.createElement("dl");
  list.className = "edition-detail-list";
  const metadata = [
    ["Format", details.format],
    ["Publisher", details.publisher],
    ["Publication date", details.publish_date],
    ["Pages", details.page_count],
    ["ISBN", details.isbn],
  ].filter(([, value]) => value && value !== "—");
  metadata.forEach(([label, value]) => {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = String(value);
    row.append(term, description);
    list.append(row);
  });
  const catalogPrice = document.createElement("p");
  catalogPrice.className = "edition-catalog-price";
  catalogPrice.textContent = details.price === null
    ? "Catalog price unavailable. Check retailers for current pricing."
    : `Catalog price: ${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: details.currency || "USD",
    }).format(details.price)}`;
  const byline = book.author ? `Edition of ${book.title || details.title}` : "";
  list.setAttribute("aria-label", byline ? `${byline} details` : "Edition details");
  const metadataGroup = document.createElement("div");
  metadataGroup.append(list, catalogPrice);
  return metadataGroup;
}

function openBookEditionDetails(book, details, section, volumes, returnFocus) {
  const isCurrentEdition = isCurrentBookEdition(book, details);
  const content = document.createElement("div");
  content.className = "edition-detail-profile";
  const summary = document.createElement("div");
  summary.className = "edition-detail-summary";
  summary.append(createBookCover({
    title: details.title || book.title,
    cover_url: getBookEditionCoverUrl(book, details, "L"),
  }, "edition-detail-cover"));
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = details.title || book.title || "Untitled";
  const author = document.createElement("p");
  author.textContent = details.author || book.author || "Unknown author";
  copy.append(title, author);
  summary.append(copy);
  content.append(summary, createEditionMetadataList(details, book));
  if (details.description) {
    const synopsis = document.createElement("p");
    synopsis.className = "edition-detail-description";
    synopsis.textContent = details.description;
    content.append(synopsis);
  }
  const actions = document.createElement("div");
  actions.className = "edition-dialog-actions";
  if (isCurrentEdition) {
    const currentNotice = document.createElement("p");
    currentNotice.className = "edition-current-notice";
    currentNotice.setAttribute("role", "status");
    currentNotice.textContent = "This is the edition currently in use.";
    actions.append(currentNotice);
  } else if (!normalizeBookIsbn(details.isbn)) {
    const isbnNotice = document.createElement("p");
    isbnNotice.className = "edition-current-notice";
    isbnNotice.setAttribute("role", "status");
    isbnNotice.textContent = "This edition has no ISBN, so it cannot be tracked separately.";
    actions.append(isbnNotice);
  } else {
    const useEdition = document.createElement("button");
    useEdition.type = "button";
    useEdition.className = "action-btn";
    useEdition.textContent = "Use this edition";
    useEdition.addEventListener("click", async () => {
      const format = details.format || "book";
      const confirmed = await showAppConfirm(
        `Use this ${format.toLowerCase()} edition of “${details.title || book.title}”?`,
        { title: "Use this edition", confirmLabel: "Use edition" }
      );
      if (!confirmed) return;
      useEdition.disabled = true;
      const fields = {
        title: details.title || book.title,
        isbn: details.isbn || "",
        cover_url: getBookEditionCoverUrl(book, details, "L"),
        page_count: details.page_count,
      };
      const ownedBook = state.books.find((item) =>
        (book.id && item.id === book.id) || getBookKey(item) === getBookKey(book)
      );
      const progressOwner = ownedBook || book;
      const editionProgress = { ...(progressOwner.edition_progress || {}) };
      const currentEditionKey = getBookEditionProgressKey(progressOwner);
      const selectedEdition = { ...progressOwner, ...fields };
      const selectedEditionKey = getBookEditionProgressKey(selectedEdition);
      if (currentEditionKey) {
        editionProgress[currentEditionKey] = {
          current_page: Number(progressOwner.current_page || 0),
          page_count: progressOwner.page_count || progressOwner.pages
            || book.page_count || book.pages || null,
          reading_status: progressOwner.reading_status || "",
        };
      }
      const selectedProgress = getEditionProgress({ edition_progress: editionProgress }, selectedEditionKey);
      const pageCount = Number(details.page_count || selectedProgress?.page_count) || null;
      fields.page_count = pageCount;
      fields.current_page = Number(selectedProgress?.current_page) || 0;
      fields.reading_status = selectedProgress?.reading_status || "";
      if (Number.isInteger(pageCount) && pageCount > 0) {
        fields.current_page = fields.reading_status === "completed"
          ? pageCount
          : Math.min(fields.current_page, pageCount);
      }
      if (selectedEditionKey) {
        editionProgress[selectedEditionKey] = {
          current_page: fields.current_page,
          page_count: pageCount,
          reading_status: fields.reading_status,
        };
      }
      fields.edition_progress = editionProgress;
      if (ownedBook && !await updateBookFields(ownedBook, fields)) {
        useEdition.disabled = false;
        return;
      }
      if (!section.isConnected || state.view !== "book" || state.currentBook !== book) {
        closeBookEditionDialog();
        return;
      }
      Object.assign(book, fields);
      if (ownedBook && ownedBook !== book) {
        Object.assign(ownedBook, fields);
        delete ownedBook.cover_i;
        delete ownedBook.pages;
      }
      if (ownedBook === book) delete ownedBook.pages;
      delete book.pages;
      delete book.cover_i;
      if (!state.session) localStorage.setItem(storageKey, JSON.stringify(state.books));
      closeBookEditionDialog(false);
      renderBookPage(book);
      showToast(ownedBook ? "Edition updated" : "Edition selected");
    });
    actions.append(useEdition);
  }
  const shopEdition = document.createElement("button");
  shopEdition.type = "button";
  shopEdition.className = "secondary-btn";
  shopEdition.textContent = "Shop for this edition";
  shopEdition.addEventListener("click", () =>
    openEditionShopping(book, details, editionDialogReturnFocus)
  );
  actions.append(shopEdition);
  content.append(actions);
  openBookEditionDialog("Edition details", content, returnFocus);
}

function openEditionShopping(book, details, returnFocus) {
  const content = document.createElement("div");
  content.className = "edition-shopping-content";
  const summary = document.createElement("div");
  summary.className = "edition-detail-summary";
  summary.append(createBookCover({
    title: details.title || book.title,
    cover_url: getBookEditionCoverUrl(book, details, "L"),
  }, "edition-shopping-cover"));
  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = details.title || book.title || "Untitled";
  const byline = document.createElement("p");
  byline.textContent = [
    details.author || book.author || "Unknown author",
    details.format,
    getEditionLanguageName(details.language),
  ].filter(Boolean).join(" · ");
  copy.append(title, byline);
  summary.append(copy);
  const identifier = document.createElement("p");
  identifier.className = "edition-shopping-identifier";
  identifier.textContent = details.isbn ? `ISBN ${details.isbn}` : "Retailer listings may include other editions.";
  const catalogPrice = document.createElement("p");
  catalogPrice.className = "edition-catalog-price";
  catalogPrice.textContent = details.price === null
    ? "Google Books price unavailable. Check each retailer for current pricing."
    : `Catalog price: ${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: details.currency || "USD",
    }).format(details.price)} (Google Books; retailer prices may differ).`;
  const isbn = normalizeBookIsbn(details.isbn);
  const searchTerm = isbn || [
    details.title || book.title,
    details.author || book.author,
    details.format,
    isbn ? "" : getEditionLanguageName(details.language),
    details.publisher,
    details.publish_date,
  ].filter(Boolean).join(" ");
  const encodedSearch = encodeURIComponent(searchTerm);
  const searchDescription = isbn
    ? `Search ISBN ${isbn}`
    : "Search by title and author; confirm the edition";
  const retailers = [
    ["Amazon", "Shop new and used editions", `https://www.amazon.com/s?k=${encodedSearch}&i=stripbooks`],
    ["Bookshop.org", "Support independent bookstores", `https://bookshop.org/search?keywords=${encodedSearch}`],
    ["Barnes & Noble", "Browse books and editions", `https://www.barnesandnoble.com/s/${encodedSearch}`],
    ["ThriftBooks", "Find pre-owned copies", `https://www.thriftbooks.com/browse/?b.search=${encodedSearch}`],
    ["Better World Books", "Shop new and used books", `https://www.betterworldbooks.com/search/results?q=${encodedSearch}`],
  ];
  const list = document.createElement("div");
  list.className = "edition-retailer-list";
  retailers.forEach(([name, description, url]) => {
    const link = createBookExternalLink(name, url, "edition-retailer-link");
    const note = document.createElement("span");
    note.textContent = `${description} · ${searchDescription}`;
    const price = document.createElement("span");
    price.className = "edition-retailer-price";
    price.textContent = details.price === null
      ? "Price unavailable · check retailer"
      : `Google Books: ${new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: details.currency || "USD",
      }).format(details.price)} · check retailer`;
    link.replaceChildren();
    const linkCopy = document.createElement("span");
    const retailer = document.createElement("strong");
    retailer.textContent = name;
    linkCopy.append(retailer, note);
    link.append(linkCopy, price);
    list.append(link);
  });
  const disclosure = document.createElement("p");
  disclosure.className = "edition-shopping-disclosure";
  disclosure.textContent = isbn
    ? "Retailer searches use this edition's ISBN, but search results can include other editions. Confirm the ISBN and format on the retailer's page. Google Books prices are references, not retailer quotes; retailer prices, shipping, and availability can change. These links are not affiliate links."
    : "This edition has no ISBN, so retailer searches may show other editions. Confirm the cover and format on the retailer's page. Google Books prices are references, not retailer quotes; retailer prices, shipping, and availability can change. These links are not affiliate links.";
  content.append(summary, identifier, catalogPrice, list, disclosure);
  openBookEditionDialog("Shop for this edition", content, returnFocus);
}

async function loadBookProfileEditions(book, section, knownVolumes = null) {
  const status = section.querySelector(".edition-picker-status");
  const button = section.querySelector(".edition-picker-button");
  const choices = section.querySelector(".edition-cover-choices");
  section.languageRequestId = (section.languageRequestId || 0) + 1;
  button.disabled = true;
  setBookProfileLoadingStatus(status, "Finding available editions…");
  section.dataset.status = "loading";
  try {
    let volumes = knownVolumes;
    if (!volumes?.length) volumes = await fetchBookProfileVolumes(book);
    if (!volumes.length) throw new Error("No catalog editions were returned.");
    renderBookProfileEditions(book, section, volumes);
    loadBookProfilePrintFormats(book, section, volumes);
  } catch (error) {
    console.error("Could not load book editions", error);
    try {
      const editions = await getOpenLibraryEditionsForBook(book);
      if (editions.length) {
        const fallbackVolumes = editions.map((edition) => ({
          id: `${edition.isbn}:${edition.coverUrl}`,
          volumeInfo: {
            title: edition.title,
            authors: [book.author || "Unknown author"],
            industryIdentifiers: edition.isbn ? [{ type: "ISBN_13", identifier: edition.isbn }] : [],
            imageLinks: { thumbnail: edition.coverUrl },
            pageCount: edition.pageCount || undefined,
            publishedDate: edition.publishDate || "",
            publisher: edition.publisher || "",
            printType: "BOOK",
          },
          saleInfo: {},
        }));
        renderBookProfileEditions(book, section, fallbackVolumes);
      } else {
        status.textContent = "Could not find editions. Try refreshing, or check your connection.";
        section.dataset.status = "error";
      }
    } catch (fallbackError) {
      console.error("Could not load Open Library edition fallback", fallbackError);
      status.textContent = "Could not find editions. Try refreshing, or check your connection.";
      section.dataset.status = "error";
    }
  } finally {
    button.disabled = false;
  }
}

const editionLanguageResults = new Map();

// Fetches editions once per book+language; in-flight requests are shared so switching back to a pending language reuses it.
function fetchBookEditionsInLanguage(book, language) {
  const key = `${normalizeBookIsbn(book.isbn) || `${book.title}|${book.author}`}|${language}`;
  const entry = editionLanguageResults.get(key) || { editions: null, promise: null };
  editionLanguageResults.set(key, entry);
  const refresh = () => {
    if (!entry.promise) {
      entry.promise = getOpenLibraryEditionsForBook(book, language)
        .then((editions) => { entry.editions = editions; return editions; })
        .finally(() => { entry.promise = null; });
    }
    return entry.promise;
  };
  return { cached: entry.editions, refresh };
}

async function loadBookProfileEditionsInLanguage(book, section, language) {
  if (!language) return;
  const status = section.querySelector(".edition-picker-status");
  const buttons = section.querySelectorAll(".edition-picker-button");
  const requestId = (section.languageRequestId = (section.languageRequestId || 0) + 1);
  const isCurrent = () => section.languageRequestId === requestId
    && state.view === "book" && state.currentBook === book && section.isConnected;
  const languageName = language === "all" ? "all-language" : getOpenLibraryLanguageName(language);
  const editionSignature = (editions) => editions.map((edition) => `${edition.isbn}:${edition.coverUrl}`).join("|");
  const show = (editions) => {
    if (!editions.length) {
      section.querySelector(".edition-cover-choices").replaceChildren();
      status.textContent = `No ${languageName} editions with covers were found for this book. Try another language.`;
      section.dataset.status = "empty";
      return;
    }
    const volumes = editions.map((edition) => ({
      id: `ol:${language}:${edition.isbn}:${edition.coverUrl}`,
      volumeInfo: {
        title: edition.title,
        authors: [book.author || "Unknown author"],
        industryIdentifiers: edition.isbn ? [{ type: "ISBN_13", identifier: edition.isbn }] : [],
        imageLinks: { thumbnail: edition.coverUrl },
        pageCount: edition.pageCount || undefined,
        publishedDate: edition.publishDate || "",
        publisher: edition.publisher || "",
        physical_format: edition.format || "",
        language: edition.language,
      },
      saleInfo: {},
    }));
    renderBookProfileEditions(book, section, volumes, { groupByLanguage: language === "all" });
    if (language !== "all" && section.dataset.status === "loaded") {
      const count = section.querySelectorAll(".edition-cover-choice").length;
      status.textContent = `${count} ${languageName} edition${count === 1 ? "" : "s"}. Select one to update your book.`;
    }
  };

  const { cached, refresh } = fetchBookEditionsInLanguage(book, language);
  if (cached) show(cached);
  else {
    buttons.forEach((button) => { button.disabled = true; });
    setBookProfileLoadingStatus(status, `Finding ${languageName} editions…`);
    section.dataset.status = "loading";
  }
  try {
    const editions = await refresh();
    if (!isCurrent()) return;
    if (!cached || editionSignature(cached) !== editionSignature(editions)) show(editions);
  } catch (error) {
    if (!isCurrent() || cached) return;
    console.error("Could not load editions in another language", error);
    status.textContent = `Could not search for ${languageName} editions. Try again.`;
    section.dataset.status = "error";
  } finally {
    if (isCurrent()) buttons.forEach((button) => { button.disabled = false; });
  }
}

async function loadBookProfileCatalog(book, { page, rating, description, readMore, editions }) {
  try {
    const volumes = await fetchBookProfileVolumes(book);
    if (!bookProfileIsActive(book, page)) return;
    if (!volumes.length) throw new Error("No catalog volumes were returned.");
    const primary = getGoogleBookDetails(getBestGoogleBookVolume(book, volumes));
    if (!primary.title) throw new Error("No matching book details were found.");
    if (primary.preview_url) book.preview_url = primary.preview_url;
    if (!book.genre && primary.categories.length) book.genre = primary.categories.join(", ");
    if (!book.publish_date && primary.publish_date !== "—") book.publish_date = primary.publish_date;
    if (!book.page_count && primary.page_count) book.page_count = primary.page_count;
    renderBookRating(rating, primary, book);
    if (!getBookProfileDescription(book)) {
      renderBookProfileDescription(description, readMore, primary.description);
    }
    renderBookProfileEditions(book, editions, volumes);
    const genreField = page.querySelector(".book-detail-content .book-detail-field:first-child .book-detail-value");
    if (genreField && primary.categories.length) {
      genreField.replaceChildren();
      renderBookGenreTags(genreField, primary.categories);
      const introGenres = page.querySelector(".book-profile-genres");
      if (introGenres) renderBookGenreTags(introGenres, primary.categories);
    }
    const publishedField = [...page.querySelectorAll(".book-detail-field")]
      .find((field) => field.querySelector("strong")?.textContent === "Publication date");
    if (publishedField && primary.publish_date) {
      const value = publishedField.querySelector(".book-detail-value");
      if (value) value.textContent = primary.publish_date;
    }
    const pagesField = [...page.querySelectorAll(".book-detail-field")]
      .find((field) => field.querySelector("strong")?.textContent === "Pages");
    if (pagesField && primary.page_count) {
      const value = pagesField.querySelector(".book-detail-value");
      if (value) value.textContent = String(primary.page_count);
    }
    updateBookReadingProgress(book, primary.page_count);
  } catch (error) {
    console.error("Could not load book catalog details", error);
    if (!bookProfileIsActive(book, page)) return;
    try {
      const fallback = await fetchOpenLibraryBookDetails(book);
      if (!bookProfileIsActive(book, page)) return;
      if (!book.genre && fallback.categories.length) book.genre = fallback.categories.join(", ");
      if (!book.publish_date && fallback.publish_date) book.publish_date = fallback.publish_date;
      if (!book.page_count && fallback.page_count) book.page_count = fallback.page_count;
      renderBookRating(rating, fallback, book);
      if (!getBookProfileDescription(book)) {
        renderBookProfileDescription(description, readMore, fallback.description);
      }
      const genreField = page.querySelector(".book-detail-content .book-detail-field:first-child .book-detail-value");
      if (genreField && fallback.categories.length) {
        renderBookGenreTags(genreField, fallback.categories);
        const introGenres = page.querySelector(".book-profile-genres");
        if (introGenres) renderBookGenreTags(introGenres, fallback.categories);
      }
      const publishedField = [...page.querySelectorAll(".book-detail-field")]
        .find((field) => field.querySelector("strong")?.textContent === "Publication date");
      if (publishedField && fallback.publish_date) {
        const value = publishedField.querySelector(".book-detail-value");
        if (value) value.textContent = fallback.publish_date;
      }
      const pagesField = [...page.querySelectorAll(".book-detail-field")]
        .find((field) => field.querySelector("strong")?.textContent === "Pages");
      if (pagesField && fallback.page_count) {
        const value = pagesField.querySelector(".book-detail-value");
        if (value) value.textContent = String(fallback.page_count);
      }
      updateBookReadingProgress(book, fallback.page_count);
    } catch (fallbackError) {
      console.error("Could not load Open Library book details", fallbackError);
      if (!bookProfileIsActive(book, page)) return;
      renderBookRating(rating, null, book);
      const catalogError = document.createElement("span");
      catalogError.className = "book-catalog-error";
      catalogError.textContent = "Catalog details could not be loaded.";
      rating.prepend(catalogError);
      if (!getBookProfileDescription(book)) {
        renderBookProfileDescription(description, readMore, "");
      }
    }
    await loadBookProfileEditions(book, editions);
  }
}

async function loadBookProfilePrintFormats(book, section, googleVolumes) {
  try {
    const openLibraryEditions = await getOpenLibraryEditionsForBook(book);
    if (state.view !== "book" || state.currentBook !== book || !section.isConnected || !openLibraryEditions.length) return;
    const openLibraryVolumes = openLibraryEditions.map((edition) => ({
      id: `ol:${edition.isbn}:${edition.coverUrl}`,
      volumeInfo: {
        title: edition.title,
        authors: [book.author || "Unknown author"],
        industryIdentifiers: edition.isbn
          ? [{ type: "ISBN_13", identifier: edition.isbn }]
          : [],
        imageLinks: { thumbnail: edition.coverUrl },
        pageCount: edition.pageCount || undefined,
        publishedDate: edition.publishDate || "",
        publisher: edition.publisher || "",
        physical_format: edition.format || "",
      },
      saleInfo: {},
    }));
    const merged = [...googleVolumes];
    openLibraryVolumes.forEach((volume) => {
      const details = getGoogleBookDetails(volume);
      const matching = merged.find((candidate) => {
        const candidateDetails = getGoogleBookDetails(candidate);
        return getBookEditionProgressKey(details)
          && getBookEditionProgressKey(candidateDetails) === getBookEditionProgressKey(details);
      });
      if (matching) {
        matching.volumeInfo.physical_format = details.format;
        if (details.cover_url) matching.volumeInfo.imageLinks = { thumbnail: details.cover_url };
        return;
      }
      merged.push(volume);
    });
    renderBookProfileEditions(book, section, merged);
  } catch (error) {
    console.error("Could not load print format details", error);
    if (section.isConnected && section.dataset.status === "loaded") {
      const status = section.querySelector(".edition-picker-status");
      status.textContent = `${status.textContent} Print formats could not be verified.`;
    }
  }
}

async function loadBookProfileAudiobook(book, section) {
  const status = section.querySelector(".audiobook-status");
  const query = [book.title, book.author].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    term: query,
    media: "audiobook",
    entity: "audiobook",
    limit: "10",
  });
  try {
    const response = await fetch(`https://itunes.apple.com/search?${params}`);
    if (!response.ok) throw new Error(`Apple Books responded with ${response.status}`);
    const payload = await response.json();
    if (!section.isConnected || state.currentBook !== book) return;
    const results = Array.isArray(payload.results) ? payload.results : [];
    const title = normalizeBookText(book.title);
    const matchingResults = results.filter((item) =>
      normalizeBookText(item.collectionName || item.trackName).includes(title)
    );
    const authorName = normalizeBookText(book.author);
    const result = matchingResults.find((item) =>
      normalizeBookText(item.artistName).includes(authorName)
    ) || matchingResults[0];
    if (!result) {
      status.textContent = "No audiobook listing was found. Search Audible for available audio editions.";
      status.classList.add("is-empty");
      status.append(createBookExternalLink(
        "Find audiobook",
        `https://www.audible.com/search?${new URLSearchParams({ keywords: query })}`,
        "book-audiobook-find"
      ));
      return;
    }
    const details = document.createElement("div");
    details.className = "audiobook-details";
    const artwork = document.createElement("img");
    artwork.className = "audiobook-cover";
    artwork.src = (result.artworkUrl100 || "").replace("100x100", "300x300");
    artwork.alt = `${result.collectionName || book.title} audiobook artwork`;
    artwork.loading = "lazy";
    const copy = document.createElement("div");
    copy.className = "audiobook-copy";
    const titleNode = document.createElement("strong");
    titleNode.textContent = result.collectionName || result.trackName || book.title;
    const byline = document.createElement("span");
    byline.textContent = `By ${result.artistName || book.author || "Unknown author"}`;
    const duration = document.createElement("span");
    const durationHours = Number(result.trackTimeMillis) > 0
      ? `${Math.floor(result.trackTimeMillis / 3600000)}h ${Math.round(result.trackTimeMillis % 3600000 / 60000)}m`
      : "";
    duration.textContent = durationHours || "Audiobook";
    copy.append(titleNode, byline, duration);
    details.append(artwork, copy);
    const links = document.createElement("div");
    links.className = "audiobook-links";
    if (result.previewUrl) {
      const sample = document.createElement("button");
      sample.type = "button";
      sample.className = "secondary-btn audiobook-sample-button";
      sample.textContent = "▶  Sample";
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.preload = "none";
      audio.src = result.previewUrl;
      audio.hidden = true;
      audio.setAttribute("aria-label", `Audiobook sample for ${book.title}`);
      sample.addEventListener("click", async () => {
        audio.hidden = false;
        try {
          await audio.play();
        } catch (error) {
          console.error("Could not play audiobook sample", error);
          showToast("Could not play the sample. Use the audio controls to try again.");
        }
      });
      links.append(sample, audio);
    }
    if (result.collectionViewUrl) {
      links.append(createBookExternalLink("Find audiobook", result.collectionViewUrl, "book-audiobook-find"));
    } else {
      links.append(createBookExternalLink(
        "Find audiobook",
        `https://www.audible.com/search?${new URLSearchParams({ keywords: query })}`,
        "book-audiobook-find"
      ));
    }
    section.replaceChildren(section.querySelector("h2"), details, links);
  } catch (error) {
    console.error("Could not load audiobook listings", error);
    if (!section.isConnected || state.currentBook !== book) return;
    status.textContent = "Audiobook listings are temporarily unavailable.";
    status.classList.add("is-error");
    status.append(createBookExternalLink(
      "Search for an audiobook",
      `https://www.audible.com/search?${new URLSearchParams({ keywords: query })}`,
      "book-audiobook-find"
    ));
  }
}

function createBookExternalLink(label, url, className = "") {
  const link = document.createElement("a");
  link.className = className;
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

const RETAILER_ICONS = {
  Amazon: '<span class="retailer-glyph retailer-glyph-amazon">a</span>',
  "Bookshop.org": '<span class="retailer-glyph">B</span>',
  "Barnes & Noble": '<span class="retailer-glyph retailer-glyph-bn">BN</span>',
  ThriftBooks: '<svg class="retailer-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h4v16H4zM9 6h4v14H9zM14.2 5.2l3.8-1 3 14.6-3.8 1z"/></svg>',
};
const EXTERNAL_LINK_ICON = '<svg class="retailer-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const OPEN_BOOK_ICON = '<svg viewBox="0 0 48 40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><path d="M24 9C19 5 11 4 4 6v27c7-2 15-1 20 3 5-4 13-5 20-3V6c-7-2-15-1-20 3zM24 9v27"/></svg>';

function createRetailerFallback(searchTerm) {
  const encoded = encodeURIComponent(searchTerm);
  const section = document.createElement("section");
  section.className = "retailer-fallback";
  const intro = document.createElement("p");
  intro.textContent = "Not in the Open Library catalog? Try searching these retailers:";
  const list = document.createElement("div");
  list.className = "retailer-chip-list";
  [
    ["Amazon", `https://www.amazon.com/s?k=${encoded}&i=stripbooks`],
    ["Bookshop.org", `https://bookshop.org/search?keywords=${encoded}`],
    ["Barnes & Noble", `https://www.barnesandnoble.com/s/${encoded}`],
    ["ThriftBooks", `https://www.thriftbooks.com/browse/?b.search=${encoded}`],
  ].forEach(([name, url]) => {
    const link = createBookExternalLink("", url, "retailer-chip");
    link.innerHTML = `${RETAILER_ICONS[name]}<span>${name}</span>${EXTERNAL_LINK_ICON}`;
    list.append(link);
  });
  section.append(intro, list);
  return section;
}

function createSearchHeader(query) {
  const header = document.createElement("header");
  header.className = "search-header";
  const crumbs = document.createElement("nav");
  crumbs.className = "search-breadcrumb";
  crumbs.setAttribute("aria-label", "Breadcrumb");
  const home = document.createElement("a");
  home.href = "#/";
  home.textContent = "Home";
  home.addEventListener("click", (event) => {
    event.preventDefault();
    navigateTo("home");
  });
  const separator = document.createElement("span");
  separator.className = "search-breadcrumb-sep";
  separator.textContent = "›";
  const current = document.createElement("span");
  current.textContent = "Discover";
  crumbs.append(home, separator, current);
  const heading = document.createElement("h1");
  heading.textContent = `Search results for “${query}”`;
  const language = document.createElement("p");
  language.className = "search-language-note";
  const selectedLanguage = resolveSearchLanguage(state.searchLanguage);
  language.textContent = selectedLanguage
    ? `Showing ${getOpenLibraryLanguageName(selectedLanguage)} editions`
    : "Showing editions in all languages, grouped by language";
  header.append(crumbs, heading, language);
  return header;
}

const loaderClassics = [
  { title: "Pride and Prejudice", author: "Jane Austen", cover_i: 14348537 },
  { title: "Moby-Dick", author: "Herman Melville", cover_i: 10544254 },
  { title: "1984", author: "George Orwell", cover_i: 8745958 },
  { title: "The Great Gatsby", author: "F. Scott Fitzgerald", cover_i: 10590366 },
  { title: "To Kill a Mockingbird", author: "Harper Lee", cover_i: 14351077 },
  { title: "Jane Eyre", author: "Charlotte Brontë", cover_i: 8235363 },
  { title: "Frankenstein", author: "Mary Shelley", cover_i: 12356249 },
  { title: "Dracula", author: "Bram Stoker", cover_i: 12216503 },
  { title: "Wuthering Heights", author: "Emily Brontë", cover_i: 12818862 },
  { title: "The Odyssey", author: "Homer", cover_i: 12474938 },
  { title: "Little Women", author: "Louisa May Alcott", cover_i: 8775559 },
];

const loaderPhrases = [
  "Dusting off the shelves…",
  "Flipping to the good part…",
  "Sniffing that old-book smell…",
  "Alphabetizing the universe…",
  "Convincing the librarian to hurry…",
  "Smoothing out dog-eared pages…",
  "Hunting for a cozy reading nook…",
  "Wrangling stray bookmarks…",
  "Skimming the last chapter (no spoilers)…",
  "Stacking the to-read pile…",
  "Shushing the noisy footnotes…",
  "Fetching a fresh pot of tea…",
];

// Universal loading animation: covers bounce in random order, each paired with a random quip.
// Warm the HTTP/service-worker caches for loader covers; references keep decoded images in memory.
const preloadedLoaderCovers = [];
function preloadLoaderCovers() {
  if (preloadedLoaderCovers.length) return;
  loaderClassics.forEach((book) => {
    const image = new Image();
    image.src = `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg?default=false`;
    preloadedLoaderCovers.push(image);
  });
}
preloadLoaderCovers();

function createBookLoader({ message = "Loading…", compact = false, mini = false } = {}) {
  const loader = document.createElement("div");
  loader.className = `book-loader${compact ? " book-loader-compact" : ""}${mini ? " book-loader-mini" : ""}`;
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-live", "polite");
  const stage = document.createElement("div");
  stage.className = "book-loader-stage";
  stage.setAttribute("aria-hidden", "true");
  const slot = document.createElement("span");
  slot.className = "book-loader-slot";
  stage.append(slot);
  const text = document.createElement("p");
  text.className = "book-loader-message";
  text.textContent = message;
  loader.append(stage, text);

  let order = [];
  let lastBook = null;
  let lastPhrase = "";
  const showNext = () => {
    // Reshuffle each pass, avoiding an immediate repeat across the seam.
    if (!order.length) {
      order = shuffleBooks(loaderClassics);
      if (order.length > 1 && order[order.length - 1] === lastBook) order.unshift(order.pop());
    }
    lastBook = order.pop();
    slot.replaceChildren(createBookCover(lastBook, "book-loader-art"));
    if (!mini) {
      const phrases = loaderPhrases.filter((phrase) => phrase !== lastPhrase);
      lastPhrase = phrases[Math.floor(Math.random() * phrases.length)];
      text.textContent = lastPhrase;
    }
  };
  showNext();
  // Each animation iteration is three bounces; swap the book when it ends.
  slot.addEventListener("animationiteration", () => {
    if (!loader.isConnected) return;
    showNext();
  });
  return loader;
}

function setBookProfileLoadingStatus(status, message, showText = false) {
  const loader = createBookLoader({ message, mini: true });
  loader.setAttribute("aria-hidden", "true");
  const announcement = document.createElement("span");
  announcement.className = showText ? "scan-loading-text" : "visually-hidden";
  announcement.textContent = message;
  status.replaceChildren(loader, announcement);
}

function createSearchLoading() {
  const status = document.createElement("div");
  status.className = "search-loading";
  const loader = createBookLoader({ message: "Searching the book catalog…" });
  const copy = document.createElement("p");
  copy.className = "search-loading-copy";
  copy.textContent = "We're looking through thousands of books to find your results.";
  status.append(loader, copy);
  return status;
}

function createSearchEmptyState(query) {
  const card = document.createElement("section");
  card.className = "search-empty-card";
  const icon = document.createElement("span");
  icon.className = "search-empty-icon";
  icon.innerHTML = OPEN_BOOK_ICON;
  const heading = document.createElement("h2");
  heading.textContent = `No results found for “${query}”`;
  const copy = document.createElement("p");
  copy.textContent = "Try checking your spelling or searching for a different title, author, or genre.";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "search-empty-back";
  back.innerHTML = '<span aria-hidden="true">←</span> Back to Discover';
  back.addEventListener("click", () => navigateTo("search"));
  card.append(icon, heading, copy, back);
  return card;
}

function mapGoogleVolumeToBook(volume) {
  const details = getGoogleBookDetails(volume);
  return {
    title: details.title || "Untitled",
    author: details.author || "Unknown author",
    isbn: details.isbn,
    cover_url: details.cover_url,
    page_count: details.page_count,
    pages: details.page_count,
    genre: details.categories[0] || "",
    description: details.description,
  };
}

async function loadBookProfileRecommendations(book, moreByAuthor, readersEnjoyed) {
  const queryForAuthor = book.author ? `inauthor:${JSON.stringify(book.author)}` : "";
  const googleRequests = await Promise.allSettled([
    queryForAuthor ? fetchGoogleBookVolumes(queryForAuthor) : Promise.resolve([]),
    book.genre ? fetchGoogleBookVolumes(`subject:${JSON.stringify(book.genre)}`) : Promise.resolve([]),
  ]);
  if (state.view !== "book" || state.currentBook !== book) return;

  const uniqueBooks = (books) => [...new Map(books
    .filter((item) => item.title !== "Untitled" && item.author && !isSameBookWork(item, book))
    .map((item) => [getRecommendationKey(item), item])).values()].slice(0, 8);
  const googleBooks = googleRequests.map((result) => result.status === "fulfilled"
    ? result.value.map(mapGoogleVolumeToBook)
    : []);
  const normalizedAuthor = normalizeBookText(book.author);
  let authorBooks = uniqueBooks(googleBooks[0].filter((item) =>
    normalizeBookText(item.author).split(", ").some((name) => name === normalizedAuthor)
  ));
  let relatedBooks = uniqueBooks(googleBooks[1]);
  let authorError = googleRequests[0].status === "rejected" ? googleRequests[0].reason : null;
  let relatedError = googleRequests[1].status === "rejected" ? googleRequests[1].reason : null;

  if (!authorBooks.length && book.author) {
    try {
      authorBooks = uniqueBooks(await fetchOpenLibraryRecommendations({ author: book.author }));
      authorError = null;
    } catch (error) {
      authorError = error;
      console.error("Could not load author recommendations", error);
    }
  }
  if (state.view !== "book" || state.currentBook !== book) return;
  if (!relatedBooks.length) {
    try {
      let subjects = [...(Array.isArray(book.subjects) ? book.subjects : []), book.genre].filter(Boolean);
      const broadSubjects = new Set([
        "fiction",
        "nonfiction",
        "literature",
        "juvenile fiction",
        "juvenile nonfiction",
        "new york times bestseller",
      ]);
      if (!subjects.some((subject) => !broadSubjects.has(normalizeBookText(subject)))) {
        try {
          const details = await fetchOpenLibraryBookDetails(book);
          if (state.view !== "book" || state.currentBook !== book) return;
          subjects.push(...details.categories);
        } catch (error) {
          if (!subjects.length) throw error;
          console.error("Could not load related-book subjects", error);
        }
      }
      const specificSubjects = subjects.filter((subject) =>
        !broadSubjects.has(normalizeBookText(subject)) && !subject.includes(":")
      );
      const recommendationSubjects = specificSubjects.length
        ? specificSubjects
        : subjects.length ? subjects : ["Fiction"];
      const subjectResults = await Promise.allSettled(
        [...new Set(recommendationSubjects)].slice(0, 3)
          .map((genre) => fetchOpenLibraryRecommendations({ genre }))
      );
      const openLibraryBooks = subjectResults.flatMap((result) => {
        if (result.status === "rejected") {
          relatedError = result.reason;
          console.error("Could not load related-book recommendations", result.reason);
          return [];
        }
        return result.value;
      });
      if (subjectResults.some((result) => result.status === "fulfilled")) relatedError = null;
      relatedBooks = uniqueBooks(openLibraryBooks);
      if (!relatedBooks.length && !subjectResults.some((result) => result.status === "fulfilled")) {
        throw relatedError || new Error("No related-book subjects could be loaded.");
      }
    } catch (error) {
      relatedError = error;
      console.error("Could not load related-book recommendations", error);
    }
  }
  if (state.view !== "book" || state.currentBook !== book) return;
  renderProfileRecommendationResults(moreByAuthor, authorBooks, authorError
    ? "Could not load author recommendations. Check your connection and try again."
    : "No other books by this author were found.");
  renderProfileRecommendationResults(readersEnjoyed, relatedBooks, relatedError
    ? "Could not load recommendations. Check your connection and try again."
    : "No similar books were found in the catalog.");
}

function renderProfileRecommendationResults(target, books, emptyMessage) {
  const section = target.section;
  const status = target.status;
  status.remove();
  const cards = books.map((book) => ({ type: "book", book }));
  section.dataset.status = cards.length ? "loaded" : "empty";
  if (!cards.length) {
    const message = document.createElement("p");
    message.className = "book-recommendation-status";
    message.textContent = emptyMessage;
    section.append(message);
    return;
  }
  const row = createCardRow(section.querySelector("h2").textContent, cards);
  row.querySelector(".section-heading-row")?.remove();
  section.append(row);
}

async function getOpenLibraryEditionsForBook(book, language = getDefaultBookLanguage()) {
  let workKeys = [];
  const isbn = normalizeBookIsbn(book.isbn);
  if (isbn) {
    const result = await fetchJsonCached(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`);
    const editionKey = result[`ISBN:${isbn}`]?.key;
    if (editionKey && /^\/books\/[^/]+$/.test(editionKey)) {
      const edition = await fetchJsonCached(`https://openlibrary.org${editionKey}.json`);
      workKeys = (edition.works || []).map((work) => work.key).filter((key) => /^\/works\/[^/]+$/.test(key));
    }
  }

  if (!workKeys.length) {
    const params = new URLSearchParams({
      q: `${book.title || ""} ${book.author || ""} ${language === getDefaultBookLanguage() ? `language:${language}` : ""}`.trim(),
      fields: "key,title,author_name",
      limit: "10",
    });
    const result = await fetchOpenLibrarySearch(params);
    const works = Array.isArray(result.docs) ? result.docs : [];
    const normalizedAuthor = (book.author || "").toLowerCase();
    const matchingWork = works.find((work) =>
      (work.author_name || []).some((author) => author.toLowerCase() === normalizedAuthor)
    ) || works[0];
    if (matchingWork?.key && /^\/works\/[^/]+$/.test(matchingWork.key)) workKeys = [matchingWork.key];
  }

  const results = await Promise.all(workKeys.map(async (workKey) => {
    const payload = await fetchJsonCached(`https://openlibrary.org${workKey}/editions.json?limit=100`);
    return Array.isArray(payload.entries) ? payload.entries : [];
  }));
  const choices = results.flat().flatMap((edition) => {
    const languages = (edition.languages || []).map((entry) => entry.key.split("/").pop());
    if (language !== "all" && !languages.includes(language)) return [];
    const editionLanguage = language === "all" ? languages[0] || "" : language;
    const isbn = [...(edition.isbn_13 || []), ...(edition.isbn_10 || [])][0] || "";
    return (edition.covers || [])
      .filter((coverId) => Number.isInteger(coverId) && coverId > 0)
      .map((coverId) => ({
        title: edition.title || book.title || "Untitled",
        isbn,
        language: editionLanguage,
        coverUrl: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`,
        publisher: edition.publishers?.[0] || "",
        publishDate: edition.publish_date || "",
        pageCount: Number(edition.number_of_pages) || null,
        format: edition.physical_format || "",
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
  page.classList.toggle("search-page", Boolean(query));
  if (query) page.append(createSearchHeader(query));
  else page.append(createPageHeader("Discover", "Browse by genre"));
  if (!query) {
    state.searchResults = null;
    state.searchMessage = "";
    state.searchLoading = false;
    const libraryBooks = getLibraryBooks();
    const genres = [...new Set([...libraryBooks.map((book) => book.genre).filter(Boolean), ...allGenres])];
    const tiles = genres.map((genre, index) => ({
      title: genre,
      count: libraryBooks.filter((book) => bookMatchesGenre(book, genre)).length,
      books: getGenreBooks(genre, libraryBooks, getBookRecommendations(libraryBooks)),
      color: ["#8050a8", "#bf613f", "#3f7772", "#536c9e"][index % 4],
    }));
    page.append(createCardRow("Explore genres", tiles.map((genre) => ({ type: "genre", ...genre }))));
    return;
  }

  const matches = state.searchResults || findLocalSearchMatches(query);
  if (state.searchMessage) {
    const message = document.createElement("p");
    message.className = "search-message";
    message.textContent = state.searchMessage;
    page.append(message);
  }
  if (state.searchLoading) {
    page.append(createSearchLoading());
  }
  const terms = normalizeSearchText(query).toLowerCase().split(/\s+/).filter(Boolean);
  const shelves = state.shelves.filter((shelf) => terms.every((term) => shelf.name.toLowerCase().includes(term)));
  if (!matches.length && !shelves.length) {
    if (state.searchLoading) return;
    page.append(createRetailerFallback(query), createSearchEmptyState(query));
    return;
  }
  const books = document.createElement("section");
  books.className = "search-result-group";
  const visibleMatches = applyBrowseControls(matches, state.searchSort, state.searchFilters);
  const pageSize = getStoredSearchPageSize();
  const totalPages = Math.max(1, Math.ceil(visibleMatches.length / pageSize));
  const currentPage = Math.min(Math.max(1, state.searchPage || 1), totalPages);
  state.searchPage = currentPage;
  const pageMatches = visibleMatches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const library = getLibraryBooks();
  const rerender = () => showSearchPage(state.searchQuery);

  const summary = document.createElement("p");
  summary.className = "genre-summary";
  summary.setAttribute("aria-live", "polite");
  if (visibleMatches.length) {
    const first = (currentPage - 1) * pageSize + 1;
    summary.textContent = `Showing ${first}–${first + pageMatches.length - 1} of ${visibleMatches.length} books`;
  } else if (matches.length) {
    summary.textContent = "No books match these filters. Books missing year, page, or rating data are hidden when filtering by them.";
  }
  const controls = createBrowseControls({
    scope: "search",
    sort: state.searchSort,
    filters: state.searchFilters,
    onChange: ({ sort, filters }) => {
      state.searchSort = sort;
      state.searchFilters = filters;
      state.searchPage = 1;
      rerender();
    },
  });
  const barOptions = {
    page: currentPage,
    totalPages,
    size: pageSize,
    onGo: (target) => {
      state.searchPage = target;
      rerender();
      document.querySelector(".search-page")?.scrollIntoView({ block: "start" });
    },
    onSize: (nextSize) => {
      localStorage.setItem(searchPageSizeKey, String(nextSize));
      state.searchPage = 1;
      rerender();
    },
  };
  books.append(summary, createPagingBar({ ...barOptions, leading: controls }));

  const bookGroups = state.searchLanguage === "all"
    ? groupByLanguage(pageMatches, (book) => book.language)
    : [["Books", pageMatches]];
  bookGroups.forEach(([label, group]) => {
    if (bookGroups.length > 1) {
      const heading = document.createElement("h2");
      heading.textContent = label;
      books.append(heading);
    }
    const grid = document.createElement("div");
    grid.className = "card-row expanded genre-browse-grid";
    group.forEach((book) => grid.append(createBookCard(book, {
      recommendation: !library.some((owned) => isSameBookWork(owned, book)),
    })));
    books.append(grid);
  });
  if (pageMatches.length) books.append(createPagingBar(barOptions));
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
  const exact = candidates.filter((book) => {
    const searchable = [book.title, book.author, book.genre, ...(book.subjects || [])]
      .filter(Boolean).join(" ").toLowerCase();
    if (parsed.genre && !searchable.includes(parsed.genre) && !searchable.includes(parsed.genre.replace("science fiction", "sci-fi"))) return false;
    if (parsed.mood && (book.mood || book.subjects?.length)
      && !searchable.includes(parsed.mood)
      && !book.mood?.toLowerCase().includes(parsed.mood)) return false;
    if (parsed.pageLimit && (!book.pages || Number(book.pages) > parsed.pageLimit)) return false;
    return !parsed.cleaned || parsed.cleaned.split(/\s+/).every((term) => searchable.includes(term));
  });
  if (exact.length || !parsed.cleaned) return exact;
  const terms = parsed.cleaned.split(/\s+/).filter(Boolean);
  return candidates.filter((book) => {
    const words = normalizeBookText([book.title, book.author].filter(Boolean).join(" ")).split(" ");
    return terms.every((term) => fuzzyTermMatches(term, words));
  });
}

async function runNaturalSearch(query, { updateHistory = true, language = globalSearchLanguage.value } = {}) {
  const languageValue = language && language !== "default" ? language : "";
  if (updateHistory) {
    navigateTo("search", { q: query.trim(), lang: languageValue });
    return;
  }
  globalSearchLanguage.value = languageValue || "default";
  if (globalSearchLanguage.value !== (languageValue || "default")) globalSearchLanguage.value = "default";
  syncGlobalSearchLanguageMenu();
  state.searchLanguage = globalSearchLanguage.value;
  const selectedLanguage = resolveSearchLanguage(state.searchLanguage);
  const languageName = selectedLanguage ? getOpenLibraryLanguageName(selectedLanguage) : "any language";
  if (state.searchQuery !== query.trim()) {
    state.searchPage = 1;
    state.searchSort = "";
    state.searchFilters = {};
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
  const searchGenre = parsed.genre
    || [...getLibraryBooks().map((book) => book.genre), ...allGenres]
      .find((genre) => genre?.toLowerCase() === state.searchQuery.toLowerCase())
    || "";
  state.searchLoading = true;
  showSearchPage(state.searchQuery);
  const searchTerms = [...new Set(parsed.queryTerms)];
  try {
    const catalogQuery = searchGenre
      ? `subject:${JSON.stringify(searchGenre)}`
      : searchTerms.join(" ") || state.searchQuery;
    const offset = searchGenre ? Math.floor(Math.random() * 10) * 24 : 0;
    const fetchWorks = async (searchOffset) => {
      const params = new URLSearchParams({
        q: selectedLanguage ? `${catalogQuery} language:${selectedLanguage}` : catalogQuery,
        fields: `key,title,author_name,isbn,cover_i,subject,language,number_of_pages_median,first_publish_year,ratings_average,readinglog_count,${OPEN_LIBRARY_EDITION_FIELDS}`,
        limit: "100",
        offset: String(searchOffset),
      });
      if (selectedLanguage) params.set("lang", selectedLanguage);
      const data = await fetchOpenLibrarySearch(params, 20000);
      return Array.isArray(data.docs) ? data.docs : [];
    };
    let works = [];
    let catalogFailed = false;
    try {
      works = await fetchWorks(offset);
      if (!works.length && offset) works = await fetchWorks(0);
    } catch (error) {
      catalogFailed = true;
      console.warn("Open Library search failed; trying Google Books.", error);
    }
    let externalBooks = [];
    let editionLookupFailures = 0;
    if (searchGenre) {
      externalBooks = shuffleBooks(works).flatMap((work) => {
        const book = {
          title: work.title || "Untitled",
          author: work.author_name?.[0] || "Unknown author",
          author_name: work.author_name || [],
          isbn: work.isbn?.[0] || "",
          cover_i: work.cover_i,
          subjects: work.subject || [],
          genre: searchGenre,
          language: selectedLanguage || pickResultLanguage(work.language),
          pages: work.number_of_pages_median,
          page_count: work.number_of_pages_median,
          first_publish_year: work.first_publish_year,
          ratings_average: work.ratings_average,
          popularity: work.readinglog_count,
        };
        return !parsed.pageLimit || (book.pages && book.pages <= parsed.pageLimit) ? [book] : [];
      });
    } else if (!selectedLanguage) {
      const editionResults = await Promise.allSettled(works.slice(0, 8).map(async (work) => {
        if (!work.key) return [];
        const editions = await getBestEditionsByLanguage(work.key);
        return editions.map((edition) => {
          const isbnList = [...(edition.isbn_13 || []), ...(edition.isbn_10 || [])];
          const pages = Number(edition.number_of_pages) || work.number_of_pages_median;
          return {
            title: edition.title || work.title || "Untitled",
            author: work.author_name?.[0] || "Unknown author",
            author_name: work.author_name || [],
            isbn: isbnList[0] || "",
            isbnList,
            cover_i: edition.covers?.find((id) => Number.isInteger(id) && id > 0),
            subjects: work.subject || [],
            genre: work.subject?.[0] || "",
            language: edition.language,
            pages,
            page_count: pages,
            first_publish_year: work.first_publish_year,
            ratings_average: work.ratings_average,
            popularity: work.readinglog_count,
          };
        });
      }));
      externalBooks = editionResults.flatMap((result) => {
        if (result.status === "rejected") {
          editionLookupFailures += 1;
          console.error(result.reason);
          return [];
        }
        return result.value.filter((book) => !parsed.pageLimit || (book.pages && book.pages <= parsed.pageLimit));
      });
    } else {
      const editionResults = await Promise.allSettled(works.map(async (work) => {
        if (!work.key) return null;
        const edition = getEmbeddedOpenLibraryEdition(work, selectedLanguage);
        if (!edition) return null;
        const isbnList = edition.isbn;
        return {
          title: edition.title || work.title || "Untitled",
          author: work.author_name?.[0] || "Unknown author",
          author_name: work.author_name || [],
          isbn: isbnList[0] || "",
          isbnList,
          cover_i: edition.cover_i || work.cover_i,
          subjects: work.subject || [],
          genre: work.subject?.[0] || "",
          language: selectedLanguage,
          pages: work.number_of_pages_median,
          page_count: work.number_of_pages_median,
          first_publish_year: work.first_publish_year,
          ratings_average: work.ratings_average,
          popularity: work.readinglog_count,
        };
      }));
      externalBooks = editionResults.flatMap((result) => {
        if (result.status === "rejected") {
          editionLookupFailures += 1;
          console.error(result.reason);
          return [];
        }
        const book = result.value;
        return book && (!parsed.pageLimit || (book.pages && book.pages <= parsed.pageLimit)) ? [book] : [];
      });
    }
    if (!externalBooks.length) {
      try {
        const fallback = await fetchGoogleCatalogBooks(searchTerms.join(" ") || state.searchQuery, {
          genre: searchGenre,
          language: selectedLanguage,
        });
        externalBooks = fallback.books.filter((book) => !parsed.pageLimit || (book.pages && book.pages <= parsed.pageLimit));
        if (externalBooks.length && !searchGenre) state.searchMessage = "Showing closest matches.";
      } catch (error) {
        console.warn("Google Books fallback failed", error);
        if (catalogFailed) throw error;
      }
    }
    state.searchResults = [...state.searchResults, ...externalBooks]
      .filter((book, index, all) =>
        all.findIndex((candidate) =>
          isSameBookWork(candidate, book) && (candidate.language || "") === (book.language || "")) === index);
    if (editionLookupFailures && !externalBooks.length) {
      state.searchMessage = `Some matching ${languageName} editions could not be checked; showing verified editions only.`;
    }
    if (!state.searchResults.length && parsed.pageLimit) {
      state.searchMessage = `No results with a verified page count under ${parsed.pageLimit} pages.`;
    } else if (!state.searchResults.length && searchGenre) {
      state.searchMessage = `No books found for ${searchGenre} in ${languageName}.`;
    } else if (!state.searchResults.length && works.length && !externalBooks.length && !editionLookupFailures) {
      state.searchMessage = `No matching editions found in ${languageName}.`;
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
  const byline = document.createElement("p");
  byline.className = "page-description";
  byline.textContent = author || "Unknown author";
  details.append(byline);
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
  else if (state.view === "library") showLibraryPage();
  else if (state.view === "suggested-shelf") restoreRouteFromLocation();
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
  updateEntryModeSwitch("");
  bookEntryChoice.classList.remove("hidden");
  bookLookupFlow.classList.add("hidden");
  bookDetailsPanel.classList.add("hidden");
}

const entryModeSwitch = document.getElementById("entryModeSwitch");

function updateEntryModeSwitch(mode) {
  entryModeSwitch.classList.toggle("hidden", !mode);
  entryModeSwitch.querySelectorAll("[data-entry-mode]").forEach((btn) => {
    const active = btn.dataset.entryMode === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

entryModeSwitch.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-entry-mode]");
  if (!btn) return;
  stopCameraScan();
  if (btn.dataset.entryMode === "manual") startManualEntry();
  else startBookLookup(btn.dataset.entryMode);
});

function startBookLookup(tab = "search") {
  bookEntryMode = "lookup";
  bookEntryChoice.classList.add("hidden");
  bookLookupFlow.classList.remove("hidden");
  bookDetailsPanel.classList.add("hidden");
  setLookupTab(tab);
  updateEntryModeSwitch(tab);
  if (tab === "scan") startCameraScan();
  else lookupTitleInput.focus();
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
  updateEntryModeSwitch("manual");
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

function fillBookDetails({ title, authors = [], isbn = "", publishDate = "", genre = "", coverUrl = "", price = null }) {
  bookForm.elements.title.value = title || "";
  bookForm.elements.author.value = authors.join(", ");
  bookForm.elements.genre.value = genre;
  if (isbn) isbnInput.value = isbn;
  bookForm.elements.cover_url.value = coverUrl;
  bookForm.elements.notes.value = publishDate ? `Published ${publishDate}` : "";
  bookForm.elements.added.value = new Date().toISOString().slice(0, 10);
  showBookDetails();
  if (!isbnLookupPanel.classList.contains("hidden")) applyScannedPrice(price);
  else document.getElementById("costHint").classList.add("hidden");
}

function applyScannedPrice(price) {
  const costInput = bookForm.elements.cost;
  const hint = document.getElementById("costHint");
  if (price !== null) {
    costInput.value = price.toFixed(2);
    hint.textContent = "Price captured from the barcode. Edit it if you paid something different.";
  } else {
    costInput.value = "";
    hint.textContent = "No price found on the barcode. Enter what you paid for this book.";
    costInput.focus();
  }
  hint.classList.remove("hidden");
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

const OPEN_LIBRARY_EDITION_FIELDS = "editions,editions.key,editions.title,editions.language,editions.isbn,editions.cover_i,editions.publish_date";

function getEmbeddedOpenLibraryEdition(work, selectedLanguage) {
  const edition = work.editions?.docs?.[0];
  if (!edition) return null;
  if (selectedLanguage && edition.language && !edition.language.includes(selectedLanguage)) return null;
  return {
    title: edition.title,
    isbn: edition.isbn || [],
    cover_i: edition.cover_i,
    language: edition.language || [],
    publish_date: edition.publish_date?.[0],
  };
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

async function getBestEditionsByLanguage(workKey) {
  const response = await fetch(`https://openlibrary.org${workKey}/editions.json?limit=100`);
  if (!response.ok) throw new Error(`Open Library editions responded with ${response.status}`);
  const payload = await response.json();
  const score = (edition) => Number(Boolean(edition.covers?.length)) * 2 + Number(Boolean(edition.isbn_13?.length));
  const best = new Map();
  (Array.isArray(payload.entries) ? payload.entries : []).forEach((edition) => {
    const code = edition.languages?.[0]?.key?.split("/").pop() || "";
    if (!best.has(code) || score(edition) > score(best.get(code))) best.set(code, edition);
  });
  return [...best.entries()].map(([language, edition]) => ({ ...edition, language }));
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
    fields: `key,title,author_name,first_publish_year,first_sentence,subject,${OPEN_LIBRARY_EDITION_FIELDS}`,
  });
  if (selectedLanguage) params.set("lang", selectedLanguage);
  scanStatus.textContent = "Searching books…";
  titleSearchResults = [];
  selectedTitleResult = null;
  titleLookupResults.replaceChildren();
  renderSelectedBookConfirmation();

  try {
    const payload = await fetchOpenLibrarySearch(params, 20000);
    const works = Array.isArray(payload.docs) ? payload.docs : [];
    const editionResults = await Promise.allSettled(works.map(async (work) => {
      if (!work.key) return null;
      const edition = getEmbeddedOpenLibraryEdition(work, selectedLanguage);
      if (!edition) return null;
      const { editions, ...workDetails } = work;
      return {
        ...workDetails,
        title: edition.title || work.title,
        isbn: edition.isbn,
        cover_i: edition.cover_i || work.cover_i,
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
      titleLookupResults.append(createRetailerFallback(searchTerms));
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

// Book barcodes can carry a 5-digit add-on: first digit is the currency (5 = USD), the rest is the price in cents.
function parseBarcodePrice(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length !== 18 || !/^97[89]/.test(digits)) return null;
  const addon = digits.slice(13);
  if (addon[0] !== "5" || addon === "59999") return null;
  const price = Number(addon.slice(1)) / 100;
  return price > 0 ? price : null;
}

async function lookupBookByIsbn(isbn, scannedPrice = null) {
  const rawIsbn = String(isbn || "");
  const barcodePrice = scannedPrice ?? parseBarcodePrice(rawIsbn);
  const normalized = rawIsbn.replace(/[^0-9Xx]/g, "").slice(0, 13).trim();
  if (!normalized) {
    showToast("Enter an ISBN first.");
    return;
  }

  scanStatus.parentElement.querySelector(".retailer-fallback")?.remove();
  setBookProfileLoadingStatus(scanStatus, `ISBN ${normalized} captured. Looking up your book…`, true);
  try {
    let bookData = null;

    try {
      const response = await fetch(`/api/scan?isbn=${encodeURIComponent(normalized)}`, { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const payload = await response.json();
        bookData = payload.data;
      }
    } catch (error) {
      console.warn("Local API lookup failed, falling back to Open Library", error);
    }

    if (!bookData) {
      const openLibraryResponse = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(normalized)}&format=json&jscmd=data`, { signal: AbortSignal.timeout(15000) });
      if (!openLibraryResponse.ok) throw new Error("Lookup failed");
      const openLibraryPayload = await openLibraryResponse.json();
      bookData = openLibraryPayload[`ISBN:${normalized}`] || null;
    }

    if (!bookData) {
      scanStatus.textContent = "No metadata found for that ISBN. You can enter the details manually.";
      scanStatus.parentElement.querySelector(".retailer-fallback")?.remove();
      scanStatus.after(createRetailerFallback(normalized));
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
      price: barcodePrice,
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
            stopCameraScan();
            await lookupBookByIsbn(value);
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
        reader.reset();
        stopCameraScan();
        await lookupBookByIsbn(value);
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

    let knownUserId = session?.user?.id || null;
    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      updateAuthButton();
      const nextUserId = session?.user?.id || null;
      // Supabase re-emits SIGNED_IN on tab refocus and TOKEN_REFRESHED on renewal; only reload on a real user change.
      if (nextUserId === knownUserId) return;
      knownUserId = nextUserId;
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
        state.shelves = loadLocalShelves();
        state.shelves = loadLocalShelves();
        render();
      }
    });

    if (!session) {
      state.loading = false;
      state.books = loadBooks();
      state.shelves = loadLocalShelves();
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
  if (state.shelves.some((shelf) => shelf.name.toLowerCase() === name.toLowerCase())) {
    showToast("A shelf with that name already exists.");
    return;
  }
  if (!state.session || !state.supabase) {
    const shelf = {
      id: `local:${crypto.randomUUID()}`,
      name,
      color: shelfColorInput?.value || "#8b5e3c",
    };
    state.shelves = [shelf, ...state.shelves];
    localStorage.setItem(shelvesStorageKey, JSON.stringify(state.shelves));
    newShelfInput.value = "";
    if (shelfColorInput) shelfColorInput.value = "#8b5e3c";
    render();
    closeShelfDrawer();
    showToast("Shelf created");
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
    edition_progress: book.edition_progress && typeof book.edition_progress === "object"
      ? book.edition_progress
      : {},
    bookmarked_at: book.bookmarked_at || null,
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
    edition_progress: book.edition_progress || {},
    bookmarked_at: book.bookmarked_at || null,
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

globalSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = globalSearchInput.value.trim();
  await runNaturalSearch(query, { language: globalSearchLanguage.value });
});

document.getElementById("topHomeBtn").addEventListener("click", () => {
  navigateTo("home");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.getElementById("libraryNavBtn").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 899px)").matches) setLibraryDrawerOpen(false);
  navigateTo("library");
});

document.getElementById("sidebarAddBookBtn").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 899px)").matches) setLibraryDrawerOpen(false);
  openDialog();
});
document.getElementById("sidebarCreateShelfBtn").addEventListener("click", openShelfDrawer);

window.addEventListener("popstate", restoreRouteFromLocation);
window.addEventListener("scroll", trackRecommendationScroll, { capture: true, passive: true });

document.addEventListener("click", (event) => {
  const target = event.target;
  const activeMenu = target instanceof Element
    ? target.closest(".card-add-menu, .card-menu, .book-shelf-menu")
    : null;
  document.querySelectorAll(".card-add-menu[open], .card-menu[open], .book-shelf-menu[open]").forEach((menu) => {
    if (menu !== activeMenu) menu.open = false;
  });
});

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
    if (appDialogOverlay && !appDialogOverlay.classList.contains("hidden")) settleAppDialog(null);
    else if (editionDialogOverlay && !editionDialogOverlay.classList.contains("hidden")) closeBookEditionDialog();
    else if (!shelfDrawerOverlay.classList.contains("hidden")) closeShelfDrawer();
    else if (!authOverlay.classList.contains("hidden")) closeAuthModal();
    else if (!dialogOverlay.classList.contains("hidden")) closeDialog();
    else if (!bookProfileOverlay.classList.contains("hidden")) closeBookProfile();
    else if (document.body.classList.contains("library-drawer-open")) setLibraryDrawerOpen(false);
    else document.querySelectorAll(".card-add-menu[open], .card-menu[open], .account-menu[open]").forEach((menu) => { menu.open = false; });
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

scanBookOptionBtn.addEventListener("click", () => {
  startBookLookup("scan");
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
    state.shelves = loadLocalShelves();
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
