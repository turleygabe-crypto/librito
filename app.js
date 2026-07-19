import { createSupabaseClient } from "./lib/supabase-client.js";

const storageKey = "librito-library-v1";
const defaultBooks = [
  {
    id: crypto.randomUUID(),
    title: "The Midnight Library",
    author: "Matt Haig",
    shelf: "Currently Reading",
    cost: 18.99,
    added: "2026-07-11",
    notes: "A warm, reflective pick for rainy evenings.",
  },
  {
    id: crypto.randomUUID(),
    title: "Piranesi",
    author: "Susanna Clarke",
    shelf: "Favorites",
    cost: 14.5,
    added: "2026-07-08",
    notes: "Dreamlike architecture and lingering wonder.",
  },
  {
    id: crypto.randomUUID(),
    title: "Braiding Sweetgrass",
    author: "Robin Wall Kimmerer",
    shelf: "Mindful Reads",
    cost: 22.0,
    added: "2026-06-27",
    notes: "A grounding gift for slow afternoons.",
  },
];

const state = {
  books: [],
  shelves: [],
  session: null,
  profile: null,
  supabase: null,
};

const bookForm = document.getElementById("bookForm");
const dialogOverlay = document.getElementById("dialogOverlay");
const scanButton = document.getElementById("scanButton");
const openModalBtn = document.getElementById("openModalBtn");
const closeDialogBtn = document.getElementById("closeDialogBtn");
const toast = document.getElementById("toast");
const scanIsbnBtn = document.getElementById("scanIsbnBtn");
const lookupIsbnBtn = document.getElementById("lookupIsbnBtn");
const isbnInput = document.getElementById("isbnInput");
const scannerVideo = document.getElementById("scannerVideo");
const scanStatus = document.getElementById("scanStatus");
const authButton = document.getElementById("authButton");
const authOverlay = document.getElementById("authOverlay");
const closeAuthBtn = document.getElementById("closeAuthBtn");
const googleAuthBtn = document.getElementById("googleAuthBtn");
const profileForm = document.getElementById("profileForm");
const displayNameInput = document.getElementById("displayNameInput");
const newShelfInput = document.getElementById("newShelfInput");
const shelfColorInput = document.getElementById("shelfColorInput");
const createShelfBtn = document.getElementById("createShelfBtn");
const shelfDrawerOverlay = document.getElementById("shelfDrawerOverlay");
const closeShelfDrawerBtn = document.getElementById("closeShelfDrawerBtn");
const shelfForm = document.getElementById("shelfForm");
const bookProfileOverlay = document.getElementById("bookProfileOverlay");
const closeBookProfileBtn = document.getElementById("closeBookProfileBtn");
const bookProfileContent = document.getElementById("bookProfileContent");
let cameraStream = null;
let barcodeLoopTimer = null;
let selectedBook = null;

function loadBooks() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn("Could not read saved library", error);
  }
  return defaultBooks;
}

function saveBooks() {
  localStorage.setItem(storageKey, JSON.stringify(state.books));
  render();
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function updateAuthButton() {
  authButton.textContent = state.session ? "Sign out" : "Sign in";
}

function renderStats() {
  const totalBooks = state.books.length;
  const totalSpent = state.books.reduce((sum, book) => sum + Number(book.cost || 0), 0);
  const shelfCounts = state.books.reduce((acc, book) => {
    acc[book.shelf || "Uncategorized"] = (acc[book.shelf || "Uncategorized"] || 0) + 1;
    return acc;
  }, {});

  document.getElementById("totalBooks").textContent = totalBooks;
  document.getElementById("totalSpent").textContent = formatCurrency(totalSpent);
  document.getElementById("shelvesCount").textContent = `${Object.keys(shelfCounts).length} shelves`;
  document.getElementById("recentBook").textContent = state.books[0]?.title || "No books yet";
}

function renderShelves() {
  const shelfList = document.getElementById("shelfList");
  const shelfCounts = state.books.reduce((acc, book) => {
    const shelfName = book.shelf || "Uncategorized";
    acc[shelfName] = (acc[shelfName] || 0) + 1;
    return acc;
  }, {});
  const spentByShelf = state.books.reduce((acc, book) => {
    const shelfName = book.shelf || "Uncategorized";
    acc[shelfName] = (acc[shelfName] || 0) + Number(book.cost || 0);
    return acc;
  }, {});

  const shelvesToRender = state.shelves.length
    ? state.shelves.map((shelf) => ({
        name: shelf.name,
        count: shelfCounts[shelf.name] || 0,
        spent: spentByShelf[shelf.name] || 0,
      }))
    : Object.entries(shelfCounts).map(([name, count]) => ({ name, count, spent: spentByShelf[name] || 0 }));

  shelfList.innerHTML = shelvesToRender
    .map((shelf) => `
      <div class="shelf-item">
        <strong>${shelf.name}</strong>
        <span>${shelf.count} book${shelf.count === 1 ? "" : "s"} • ${formatCurrency(shelf.spent)}</span>
      </div>
    `)
    .join("");
}

function openBookProfile(book) {
  selectedBook = book;
  bookProfileContent.innerHTML = `
    <div class="profile-field">
      <strong>Title</strong>
      <span>${book.title}</span>
    </div>
    <div class="profile-field">
      <strong>Author</strong>
      <span>${book.author || "Unknown author"}</span>
    </div>
    <div class="profile-field">
      <strong>Shelf</strong>
      <span>${book.shelf || "Uncategorized"}</span>
    </div>
    <div class="profile-field">
      <strong>Cost</strong>
      <span>${formatCurrency(book.cost)}</span>
    </div>
    <div class="profile-field">
      <strong>Date added</strong>
      <span>${formatDate(book.added || book.added_on)}</span>
    </div>
    <div class="profile-field">
      <strong>Notes</strong>
      <span>${book.notes || "No notes yet."}</span>
    </div>
  `;
  bookProfileOverlay.classList.remove("hidden");
}

function closeBookProfile() {
  selectedBook = null;
  bookProfileOverlay.classList.add("hidden");
}

function renderBooks() {
  const bookList = document.getElementById("bookList");
  if (!state.books.length) {
    bookList.innerHTML = '<p>No books yet. Start by adding your first title.</p>';
    return;
  }

  bookList.innerHTML = state.books
    .slice()
    .sort((a, b) => new Date(b.added || b.added_on || 0) - new Date(a.added || a.added_on || 0))
    .map((book) => `
      <article class="book-card" tabindex="0" role="button" data-book-id="${book.id}">
        <div>
          <strong>${book.title}</strong>
          <p>${book.author || "Unknown author"}</p>
          <p>${book.shelf || "Uncategorized"} • Added ${formatDate(book.added || book.added_on)}</p>
          <p>${book.notes || ""}</p>
        </div>
        <div>
          <strong>${formatCurrency(book.cost)}</strong>
        </div>
      </article>
    `)
    .join("");

  bookList.querySelectorAll(".book-card").forEach((card) => {
    card.addEventListener("click", () => {
      const book = state.books.find((item) => item.id === card.dataset.bookId);
      if (book) openBookProfile(book);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const book = state.books.find((item) => item.id === card.dataset.bookId);
        if (book) openBookProfile(book);
      }
    });
  });
}

function render() {
  renderStats();
  renderShelves();
  renderBooks();
}

function openDialog() {
  dialogOverlay.classList.remove("hidden");
  bookForm.elements.title.focus();
}

function closeDialog() {
  dialogOverlay.classList.add("hidden");
  bookForm.reset();
}

function openShelfDrawer() {
  shelfDrawerOverlay.classList.remove("hidden");
  newShelfInput.focus();
}

function closeShelfDrawer() {
  shelfDrawerOverlay.classList.add("hidden");
  shelfForm.reset();
  if (shelfColorInput) shelfColorInput.value = "#8b5e3c";
}

function openAuthModal() {
  authOverlay.classList.remove("hidden");
  displayNameInput.focus();
}

function closeAuthModal() {
  authOverlay.classList.add("hidden");
  profileForm.reset();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 1800);
}

async function lookupBookByIsbn(isbn) {
  const normalized = (isbn || "").replace(/[^0-9Xx]/g, "").trim();
  if (!normalized) {
    showToast("Enter an ISBN first.");
    return;
  }

  scanStatus.textContent = `Looking up ${normalized}…`;
  try {
    const response = await fetch(`/api/scan?isbn=${encodeURIComponent(normalized)}`);
    if (!response.ok) throw new Error("Lookup failed");
    const payload = await response.json();
    const bookData = payload.data;

    if (!bookData) {
      scanStatus.textContent = "No metadata found for that ISBN. You can enter the details manually.";
      return;
    }

    bookForm.elements.title.value = bookData.title || "";
    bookForm.elements.author.value = (bookData.authors || []).map((author) => author.name).join(", ") || "";
    bookForm.elements.notes.value = bookData.publish_date ? `Published ${bookData.publish_date}` : "";
    bookForm.elements.added.value = new Date().toISOString().slice(0, 10);
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
      scanStatus.textContent = "Camera scanning is not supported in this browser. Enter the ISBN manually.";
    }
  } catch (error) {
    console.error(error);
    scanStatus.textContent = "Camera permission was denied. Enter the ISBN manually instead.";
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

function seedMockScan() {
  const samples = [
    { title: "Anxious People", author: "Fredrik Backman", shelf: "Cozy Reads", cost: 16.5, added: new Date().toISOString().slice(0, 10), notes: "A warm, witty story for book club night." },
    { title: "The House of Doors", author: "Tan Twan Eng", shelf: "Currently Reading", cost: 24.0, added: new Date().toISOString().slice(0, 10), notes: "A lush, atmospheric story." },
    { title: "The Light We Carry", author: "Michelle Obama", shelf: "Inspiration", cost: 20.0, added: new Date().toISOString().slice(0, 10), notes: "Perfect for thoughtful evenings." },
  ];

  const sample = samples[Math.floor(Math.random() * samples.length)];
  bookForm.elements.title.value = sample.title;
  bookForm.elements.author.value = sample.author;
  bookForm.elements.shelf.value = sample.shelf;
  bookForm.elements.cost.value = sample.cost;
  bookForm.elements.added.value = sample.added;
  bookForm.elements.notes.value = sample.notes;
}

async function initializeSupabase() {
  try {
    state.supabase = createSupabaseClient();
    const { data: { session } } = await state.supabase.auth.getSession();
    state.session = session;
    updateAuthButton();

    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session;
      updateAuthButton();
      if (session) {
        loadFromSupabase();
      } else {
        state.books = loadBooks();
        render();
      }
    });

    if (!session) {
      state.books = loadBooks();
      render();
      return;
    }

    await loadFromSupabase();
  } catch (error) {
    console.error(error);
    state.books = loadBooks();
    render();
    showToast("Supabase is not configured yet. Using local demo data.");
  }
}

async function ensureProfile(displayName = "", favoriteShelf = "") {
  if (!state.supabase || !state.session) return;
  const user = state.session.user;
  const { data, error } = await state.supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email,
        full_name: displayName || user.user_metadata?.full_name || user.email,
        favorite_shelf: favoriteShelf || null,
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
    return;
  }
  state.shelves = data || [];
  render();
}

async function createShelfInSupabase() {
  const name = newShelfInput.value.trim();
  if (!name) {
    showToast("Name your shelf first.");
    return;
  }
  if (!state.supabase || !state.session) {
    showToast("Sign in to save shelves.");
    return;
  }

  const { data, error } = await state.supabase
    .from("shelves")
    .insert({ name, color: shelfColorInput?.value || "#8b5e3c", user_id: state.session.user.id })
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
  if (!state.supabase || !state.session) return;
  await ensureProfile();
  await loadShelvesFromSupabase();
  const { data, error } = await state.supabase.from("books").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  state.books = (data || []).map((book) => ({
    id: book.id,
    title: book.title,
    author: book.author,
    shelf: book.shelf,
    cost: Number(book.cost || 0),
    added: book.added_on || book.created_at,
    notes: book.notes || "",
  }));
  render();
}

async function saveBookToSupabase(book) {
  if (!state.supabase || !state.session) {
    state.books = [book, ...state.books];
    saveBooks();
    return;
  }

  const payload = {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn || null,
    shelf: book.shelf,
    cost: Number(book.cost || 0),
    added_on: book.added,
    notes: book.notes || null,
    user_id: state.session.user.id,
  };

  const { error } = await state.supabase.from("books").insert(payload);
  if (error) {
    console.error(error);
    showToast("Could not save to Supabase.");
    return;
  }

  showToast("Book saved to Supabase");
  await loadFromSupabase();
}

scanButton.addEventListener("click", () => {
  openDialog();
  seedMockScan();
});

openModalBtn.addEventListener("click", () => {
  openDialog();
});

scanIsbnBtn.addEventListener("click", () => {
  startCameraScan();
});

lookupIsbnBtn.addEventListener("click", () => {
  lookupBookByIsbn(isbnInput.value || "");
});

createShelfBtn.addEventListener("click", () => {
  openShelfDrawer();
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
  if (!state.supabase) {
    await initializeSupabase();
  }
  if (state.session) {
    await state.supabase.auth.signOut();
    state.session = null;
    state.profile = null;
    updateAuthButton();
    showToast("Signed out");
    return;
  }
  openAuthModal();
});

googleAuthBtn.addEventListener("click", async () => {
  if (!state.supabase) {
    await initializeSupabase();
  }

  const { data, error } = await state.supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    showToast("Unable to start Google sign-in");
    return;
  }

  if (data?.url) {
    window.location.assign(data.url);
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.session) {
    showToast("Sign in first");
    return;
  }

  const formData = new FormData(profileForm);
  const displayName = formData.get("displayName").toString().trim();
  const favoriteShelf = formData.get("favoriteShelf").toString().trim();

  if (!displayName) {
    showToast("Add a display name");
    return;
  }

  await ensureProfile(displayName, favoriteShelf);
  closeAuthModal();
  showToast("Profile ready");
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
  };

  if (!book.title || !book.author || !book.shelf || !book.added) {
    showToast("Fill in the essentials first.");
    return;
  }

  state.books = [book, ...state.books];
  saveBooks();
  closeDialog();
  await saveBookToSupabase(book);
});

render();
initializeSupabase();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
}
