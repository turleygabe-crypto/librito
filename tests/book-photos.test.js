import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { PGlite } from "@electric-sql/pglite";
import { translate } from "../translations.js";
import {
  BOOK_PHOTO_BUCKET, BOOK_PHOTO_MAX_BYTES, listBookPhotos, uploadBookPhoto,
  downloadBookPhoto, removeBookPhotos, removeAccountBookPhotos,
} from "../lib/book-photos.js";

const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const book = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherBook = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const name = "cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg";

function clientWith(bucket) {
  return { storage: { from(id) { assert.equal(id, BOOK_PHOTO_BUCKET); return bucket; } } };
}

test("photo uploads validate type, signature, and the exact 5 MB boundary; never overwrite covers", async () => {
  const uploads = [];
  const client = clientWith({
    upload: async (...args) => { uploads.push(args); return { data: {} }; },
  });
  const photo = (size, type = "image/jpeg", signature = [255, 216, 255]) => ({
    type, size, slice: () => new Blob([new Uint8Array(signature)]),
  });
  const path = await uploadBookPhoto(client, user, book, photo(BOOK_PHOTO_MAX_BYTES));
  assert.match(path, new RegExp(`^${user}/${book}/[0-9a-f-]{36}\\.jpg$`));
  assert.deepEqual(uploads[0][2], { contentType: "image/jpeg", cacheControl: "0", upsert: false });
  for (const [type, signature, extension] of [
    ["image/png", [137, 80, 78, 71, 13, 10, 26, 10], "png"],
    ["image/webp", [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], "webp"],
  ]) {
    assert.ok((await uploadBookPhoto(client, user, book, photo(100, type, signature))).endsWith(`.${extension}`));
  }
  for (const invalid of [
    photo(BOOK_PHOTO_MAX_BYTES + 1), photo(0), photo(10, "image/svg+xml"),
    photo(10, "image/jpeg", [60, 115, 118, 103]), photo(10, "__proto__"),
  ]) {
    await assert.rejects(uploadBookPhoto(client, user, book, invalid), /photo/);
  }
  assert.equal(uploads.length, 3);
  await assert.rejects(uploadBookPhoto(clientWith({
    upload: async () => ({ error: new Error("permission denied") }),
  }), user, otherBook, photo(10)), /permission denied/);
});

test("listing paginates and downloads stay authenticated without public or signed URLs", async () => {
  const offsets = [];
  const blob = new Blob(["private"]);
  const client = clientWith({
    async list(prefix, options) {
      assert.equal(prefix, `${user}/${book}`);
      offsets.push(options.offset);
      return { data: Array.from({ length: options.offset === 0 ? 100 : 1 }, (_, i) => ({
        name: `${options.offset + i}.jpg`,
      })) };
    },
    download: async (path) => { assert.equal(path, `${user}/${book}/0.jpg`); return { data: blob }; },
  });
  const photos = await listBookPhotos(client, user, book);
  assert.equal(photos.length, 101);
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(await downloadBookPhoto(client, photos[0].path), blob);
  await assert.rejects(listBookPhotos(clientWith({
    list: async () => ({ error: new Error("offline") }),
  }), user, book), /offline/);
});

test("account cleanup traverses private book folders and propagates failures", async () => {
  const removed = [];
  const client = clientWith({
    list: async (prefix) => ({ data: [{ name: prefix === user ? book : name }] }),
    remove: async (paths) => { removed.push(...paths); return { data: [] }; },
  });
  await removeAccountBookPhotos(client, user);
  assert.deepEqual(removed, [`${user}/${book}/${name}`]);
  await assert.rejects(removeBookPhotos(clientWith({
    remove: async () => ({ error: new Error("cleanup failed") }),
  }), removed), /cleanup failed/);
});

test("Supabase policies enforce owner-only reads and library-only uploads, including after book removal", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$select nullif(current_setting('test.user_id', true), '')::uuid$$;
      create schema storage;
      create table storage.buckets (
        id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql as
        $$select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1]$$;
      create function storage.filename(text) returns text language sql as
        $$select (string_to_array($1, '/'))[array_length(string_to_array($1, '/'), 1)]$$;
      create table public.books (id uuid primary key, user_id uuid);
      alter table public.books enable row level security;
      create policy books_own on public.books using (user_id = auth.uid());
      alter table storage.objects enable row level security;
      grant usage on schema storage, auth, public to authenticated, anon;
      grant select, insert, delete on storage.objects to authenticated, anon;
      grant select on public.books to authenticated, anon;
      insert into public.books values ('${book}', '${user}'), ('${otherBook}', '${other}');
    `);
    const migration = await readFile(new URL("../supabase/migrations/20261101160000_private_book_photos.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const bucket = (await db.query("select * from storage.buckets")).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), BOOK_PHOTO_MAX_BYTES);
    assert.deepEqual(bucket.allowed_mime_types, ["image/jpeg", "image/png", "image/webp"]);
    await db.exec(`set test.user_id = '${user}'; set role authenticated;`);
    const insert = (path) => db.query("insert into storage.objects(bucket_id, name) values ($1, $2)", [BOOK_PHOTO_BUCKET, path]);
    await insert(`${user}/${book}/${name}`);
    for (const path of [
      `${other}/${otherBook}/${name}`, `${user}/${otherBook}/${name}`,
      `${user}/dddddddd-dddd-4ddd-8ddd-dddddddddddd/${name}`,
      `${user}/${book}/extra/${name}`, `${user}/${book}/payload.svg`,
    ]) {
      await assert.rejects(insert(path), /row-level security/);
    }
    assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
    await db.exec(`set test.user_id = '${other}'`);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    assert.equal((await db.query("delete from storage.objects returning *")).rows.length, 0);
    await db.exec("set role anon; set test.user_id = '';");
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    await assert.rejects(insert(`${user}/${book}/${name}`), /row-level security/);
    await db.exec(`reset role; delete from public.books where id = '${book}';
      set role authenticated; set test.user_id = '${user}';`);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    await assert.rejects(insert(`${user}/${book}/${name}`), /row-level security/);
    assert.equal((await db.query("delete from storage.objects returning *")).rows.length, 0);
    await db.exec("reset role");
    assert.equal((await db.query("delete from storage.objects returning *")).rows.length, 1);
  } finally {
    await db.close();
  }
});

class Element {
  children = [];
  events = {};
  attributes = {};
  isConnected = true;
  classes = new Set();
  classList = {
    add: (name) => this.classes.add(name),
    remove: (name) => this.classes.delete(name),
  };
  constructor(tagName = "div") { this.tagName = tagName.toUpperCase(); }
  append(...children) {
    children.forEach((child) => { if (child instanceof Element) child.parent = this; });
    this.children.push(...children);
  }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  replaceWith(child) {
    const index = this.parent.children.indexOf(this);
    child.parent = this.parent;
    this.parent.children[index] = child;
  }
  removeAttribute(name) { delete this.attributes[name]; if (name === "src") delete this.src; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  contains(element) { return this === element || this.children.some((child) => child instanceof Element && child.contains(element)); }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => child instanceof Element
      ? [...(selector === "button" && child.tagName === "BUTTON" ? [child] : []), ...child.querySelectorAll(selector)]
      : []);
  }
}

async function galleryHarness({ loadError = false, empty = false } = {}) {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const gallerySource = source.slice(source.indexOf("function createPrivateBookPhotoGallery("),
    source.indexOf("\nfunction createBookEditionPicker("));
  let start;
  let observe;
  const revoked = [];
  let urlCount = 0;
  const writes = [];
  let files = empty ? [] : [{ path: `${user}/${book}/${name}` }];
  const state = { session: { user: { id: user } }, supabase: {}, books: [{ id: book }], view: "book" };
  const context = {
    state, t: translate,
    getLibraryBooks: () => state.books.filter((item) => item.ownership_status !== "wishlist"),
    document: {
      body: new Element(),
      createElement: (tag) => new Element(tag), createTextNode: (text) => text,
      getElementById: () => new Element(),
    },
    MutationObserver: class {
      constructor(callback) { observe = callback; }
      observe() {}
      disconnect() {}
    },
    URL: {
      createObjectURL: () => urlCount++ === 0 ? "blob:private" : `blob:private-${urlCount}`,
      revokeObjectURL: (url) => revoked.push(url),
    },
    queueMicrotask: (callback) => { start = callback; },
    createBookCover: (record, className) => {
      const cover = new Element();
      cover.className = className;
      cover.book = record;
      return cover;
    },
    console: { error() {} }, showToast() {}, showAppConfirm: async () => true,
    listBookPhotos: async () => {
      if (loadError) throw new Error("offline");
      return files;
    },
    downloadBookPhoto: async () => new Blob(["private"]),
    uploadBookPhoto: async (...args) => {
      writes.push(["upload", ...args]);
      const path = `${user}/${book}/new-photo.jpg`;
      files = [...files, { path }];
      return path;
    },
    removeBookPhotos: async (...args) => {
      writes.push(["remove", ...args]);
      files = files.filter((file) => !args[1].includes(file.path));
    },
  };
  const create = runInNewContext(`${gallerySource}\ncreatePrivateBookPhotoGallery`, context);
  const section = create({ id: book, title: "My book" });
  await start();
  const [stage, grid, addPhotos, remove, status, retry] = section.children;
  addPhotos.events.click();
  const uploadDialog = context.document.body.children.at(-1);
  const [uploadHeader, dropZone, , uploadStatus, uploadPreviews] = uploadDialog.children;
  const uploadOptions = dropZone.children[1];
  const closeUpload = uploadHeader.children[2];
  closeUpload.events.click();
  const [label, cameraLabel] = uploadOptions.children;
  const [primary, uploaded, badge, navigation, expand] = stage.children;
  return {
    section, state, writes, revoked, observe: () => observe(), context,
    stage, primary, uploaded, badge, navigation, input: label.children[2], label,
    cameraLabel, cameraInput: cameraLabel.children[1], grid, remove, status, retry,
    addPhotos, uploadOptions, expand,
    uploadDialog, dropZone, uploadStatus, uploadPreviews, closeUpload,
  };
}

test("gallery loads private photos, supports uploads and deletion, and revokes images when accounts change", async () => {
  const { section, state, writes, revoked, observe, grid, input, status, remove, uploaded, badge, primary } = await galleryHarness();
  assert.equal(grid.children.length, 2);
  assert.equal(grid.children[1].children[0].src, "blob:private");
  assert.equal(primary.hidden, false);
  assert.equal(badge.hidden, true);
  input.files = [{ type: "image/jpeg" }];
  await input.events.change();
  assert.equal(writes[0][0], "upload");
  assert.equal(writes[0][2], user);
  assert.equal(writes[0][3], book);
  assert.equal(status.textContent, "");
  assert.equal(primary.hidden, true);
  assert.equal(uploaded.hidden, false);
  assert.equal(badge.hidden, false);
  assert.equal(grid.children[2].attributes["aria-pressed"], "true");
  await remove.events.click();
  assert.equal(writes[1][0], "remove");
  assert.equal(writes[1][2][0], `${user}/${book}/new-photo.jpg`);
  assert.equal(primary.hidden, false);
  assert.equal(badge.hidden, true);
  state.session = { user: { id: other } };
  observe();
  assert.equal(section.children.length, 0);
  assert.equal(revoked.length, 4);
  await input.events.change();
  assert.equal(writes.length, 2);
});

test("cover thumbnails and arrow controls cycle with wraparound and a badge only on private images", async () => {
  const { grid, primary, uploaded, badge, navigation, section } = await galleryHarness();
  const [previous, position, next] = navigation.children;
  assert.equal(navigation.hidden, false);
  assert.equal(position.children.at(-1), "1 / 2");
  assert.equal(grid.children[0].attributes["aria-pressed"], "true");
  next.events.click();
  assert.equal(primary.hidden, true);
  assert.equal(uploaded.hidden, false);
  assert.equal(badge.hidden, false);
  assert.equal(badge.textContent, "Your photo");
  assert.equal(position.children.at(-1), "2 / 2");
  assert.equal(position.children.length, 2);
  assert.equal(position.children[0].className, "book-photo-icon");
  assert.equal(position.title, "Your photo");
  assert.equal(grid.children[1].attributes["aria-pressed"], "true");
  next.events.click();
  assert.equal(primary.hidden, false);
  assert.equal(badge.hidden, true);
  assert.equal(position.children.length, 1);
  previous.events.click();
  assert.equal(badge.hidden, false);
  grid.children[0].events.click();
  assert.equal(badge.hidden, true);
  grid.children[1].events.click();
  assert.equal(badge.hidden, false);
  let prevented = false;
  section.events.keydown({
    target: next, key: "ArrowRight", preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(badge.hidden, true);
});

test("edition cover updates preserve the chosen private image and update both primary cover surfaces", async () => {
  const harness = await galleryHarness();
  harness.grid.children[1].events.click();
  const edition = { title: "Another edition", cover_url: "https://example.test/edition.jpg" };
  harness.section.events["book-cover-update"]({ detail: edition });
  const primary = harness.stage.children[0];
  assert.equal(primary.book, edition);
  assert.equal(harness.grid.children[0].children[0].book, edition);
  assert.equal(primary.hidden, true);
  assert.equal(harness.badge.hidden, false);
  harness.grid.children[0].events.click();
  assert.equal(primary.hidden, false);
  assert.equal(harness.badge.hidden, true);
  assert.equal(harness.uploaded.src, undefined);
});

test("catalog detail updates notify the inline gallery instead of replacing its private display", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const updateSource = source.slice(source.indexOf("function updateBookPageDetails("),
    source.indexOf("\nfunction normalizeBookIsbn("));
  const harness = await galleryHarness();
  const bookUpdate = { title: "Updated cover", cover_url: "https://example.test/updated.jpg" };
  harness.grid.children[1].events.click();
  const page = {
    querySelector(selector) { return selector === ".book-cover-gallery" ? {
      dispatchEvent(event) { harness.section.events[event.type](event); },
    } : null; },
    querySelectorAll: () => [],
  };
  const context = {
    state: harness.state,
    document: { getElementById: () => page },
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options.detail; }
    },
    updateBookReadingProgress() {},
  };
  const update = runInNewContext(`${updateSource}\nupdateBookPageDetails`, context);
  update(bookUpdate);
  assert.equal(harness.stage.children[0].book, bookUpdate);
  assert.equal(harness.stage.children[0].hidden, true);
  assert.equal(harness.badge.hidden, false);
});

test("deleting the last upload restores the primary cover and hides the empty thumbnail strip", async () => {
  const harness = await galleryHarness();
  harness.grid.children[1].events.click();
  await harness.remove.events.click();
  assert.equal(harness.grid.children.length, 1);
  assert.equal(harness.grid.hidden, true);
  assert.equal(harness.navigation.hidden, true);
  assert.equal(harness.primary.hidden, false);
  assert.equal(harness.remove.hidden, true);
  assert.equal(harness.badge.hidden, true);
});

test("books without private photos show only the primary cover and compact upload option", async () => {
  const harness = await galleryHarness({ empty: true });
  assert.equal(harness.label.children[1], "Upload Photos");
  assert.equal(harness.primary.hidden, false);
  assert.equal(harness.uploaded.hidden, true);
  assert.equal(harness.navigation.hidden, true);
  assert.equal(harness.grid.hidden, true);
  assert.equal(harness.badge.hidden, true);
  assert.equal(harness.remove.hidden, true);
  assert.equal(harness.status.textContent, "");
  assert.equal(harness.input.disabled, false);
});

test("failed uploads and deletions surface errors and restore enabled controls without losing the selected photo", async () => {
  const harness = await galleryHarness();
  harness.grid.children[1].events.click();
  harness.context.uploadBookPhoto = async () => { throw new Error("Upload unavailable"); };
  harness.input.files = [{}];
  await harness.input.events.change();
  assert.equal(harness.status.textContent, "Upload unavailable");
  assert.equal(harness.input.disabled, false);
  assert.equal(harness.remove.disabled, false);
  assert.equal(harness.badge.hidden, false);
  harness.context.removeBookPhotos = async () => { throw new Error("Delete unavailable"); };
  await harness.remove.events.click();
  assert.match(harness.status.textContent, /Could not delete/);
  assert.equal(harness.input.disabled, false);
  assert.equal(harness.remove.disabled, false);
  assert.equal(harness.badge.hidden, false);
  assert.equal(harness.primary.hidden, true);
});

test("gallery uses a framed image, side arrows, counter and compact thumbnails at desktop and mobile sizes", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.private-book-photos\s*\{/);
  assert.match(css, /\.book-cover-gallery\s*\{[^}]*width: min\(100%, 11rem\)/);
  assert.match(css, /\.private-book-photo-grid\s*\{[^}]*display: flex;[^}]*overflow-x: auto/);
  assert.match(css, /\.book-photo-thumbnail\s*\{[^}]*height: 3\.5rem/);
  assert.match(css, /\.book-cover-gallery \[hidden\]\s*\{[^}]*display: none/);
  assert.match(css, /@media \(max-width: 1150px\)[\s\S]*?\.book-detail-cover,\s*\.book-cover-gallery\s*\{[^}]*grid-row: span 2/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.book-detail-cover,\s*\.book-cover-gallery\s*\{[^}]*width: min\(58vw, 12rem\);[^}]*grid-row: auto/);
  assert.match(css, /\.book-cover-gallery-stage\s*\{[^}]*border: 3px solid #fffaf3;[^}]*border-radius: 0\.8rem/);
  assert.match(css, /\.book-photo-counter\s*\{[^}]*top: 0\.4rem;[^}]*right: 0\.4rem/);
  assert.match(css, /\.book-photo-navigation button:first-child\s*\{[^}]*left: -1\.15rem/);
});

test("camera and file upload remain separate and use the same private upload flow", async () => {
  const harness = await galleryHarness({ empty: true });
  assert.equal(harness.cameraLabel.children[0], "+ Camera");
  assert.equal(harness.cameraInput.attributes.capture, "environment");
  assert.equal(harness.input.attributes.capture, undefined);
  assert.equal(harness.cameraInput.accept, harness.input.accept);
  const photo = { type: "image/jpeg" };
  harness.cameraInput.files = [photo];
  await harness.cameraInput.events.change();
  assert.equal(harness.writes[0][0], "upload");
  assert.equal(harness.writes[0][2], user);
  assert.equal(harness.writes[0][3], book);
  assert.equal(harness.writes[0][4], photo);
  assert.equal(harness.badge.hidden, false);
  assert.equal(harness.cameraInput.value, "");
  assert.equal(harness.input.disabled, false);
  assert.equal(harness.cameraInput.disabled, false);
});

test("camera uploads disable both pickers while pending and cannot upload after library removal", async () => {
  const harness = await galleryHarness({ empty: true });
  let finish;
  harness.context.uploadBookPhoto = () => new Promise((resolve) => { finish = resolve; });
  harness.cameraInput.files = [{}];
  const pending = harness.cameraInput.events.change();
  assert.equal(harness.cameraInput.disabled, true);
  assert.equal(harness.input.disabled, true);
  harness.input.files = [{}];
  await harness.input.events.change();
  finish("photo-path");
  await pending;
  assert.equal(harness.cameraInput.disabled, false);
  assert.equal(harness.input.disabled, false);
  let writes = 0;
  harness.context.uploadBookPhoto = async () => { writes++; };
  harness.state.books = [];
  await harness.cameraInput.events.change();
  assert.equal(writes, 0);
});

test("camera errors restore both pickers and cancellation does not upload", async () => {
  const harness = await galleryHarness({ empty: true });
  await harness.cameraInput.events.change();
  assert.equal(harness.writes.length, 0);
  harness.cameraInput.files = [{}];
  harness.context.uploadBookPhoto = async () => { throw new Error("Photo exceeds 5 MB"); };
  await harness.cameraInput.events.change();
  assert.equal(harness.status.textContent, "Photo exceeds 5 MB");
  assert.equal(harness.cameraInput.disabled, false);
  assert.equal(harness.input.disabled, false);
});

test("mobile profiles keep decoration behind the compact cover and remove desktop column styling", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  const mobile = css.slice(css.indexOf("@media (max-width: 680px)"));
  assert.match(mobile, /\.book-detail-layout\s*\{[^}]*circle at 50% 5\.5rem/);
  assert.match(mobile, /\.book-detail-content\s*\{[^}]*min-width: 0;[^}]*min-height: 0;[^}]*padding-left: 0;[^}]*border-left: 0/);
  assert.match(mobile, /\.book-profile-title\s*\{[^}]*font-size: clamp\(1\.6rem, 7vw, 2rem\);[^}]*overflow-wrap: anywhere/);
  assert.match(css, /@media \(any-pointer: coarse\), \(max-width: 899px\)\s*\{[\s\S]*?\.book-photo-camera\s*\{[^}]*display: inline-flex/);
  assert.match(css, /\.book-cover-gallery-stage > \.book-detail-cover\s*\{[^}]*position: absolute;[^}]*inset: 0\.35rem/);
});

test("Add Photos opens a modal with camera and file options, not inline controls, and disables while uploading", async () => {
  const harness = await galleryHarness({ empty: true });
  assert.equal(harness.addPhotos.children[1], "Add Photos");
  assert.equal(harness.uploadDialog.open, false);
  assert.equal(harness.section.children.includes(harness.uploadOptions), false);
  harness.addPhotos.events.click();
  assert.equal(harness.uploadDialog.open, true);
  assert.equal(harness.addPhotos.attributes["aria-haspopup"], "dialog");
  harness.closeUpload.events.click();
  assert.equal(harness.uploadDialog.open, false);
  let finish;
  harness.context.uploadBookPhoto = () => new Promise((resolve) => { finish = resolve; });
  harness.input.files = [{}];
  const pending = harness.input.events.change();
  assert.equal(harness.addPhotos.disabled, true);
  harness.addPhotos.events.click();
  assert.equal(harness.uploadDialog.open, false);
  finish("photo-path");
  await pending;
  assert.equal(harness.addPhotos.disabled, false);
});

test("popup supports multiple dropped photos and shows uploaded previews without changing the primary cover", async () => {
  const harness = await galleryHarness({ empty: true });
  harness.addPhotos.events.click();
  assert.equal(harness.input.multiple, true);
  const event = {
    prevented: false,
    preventDefault() { this.prevented = true; },
    dataTransfer: { files: [{ type: "image/jpeg" }, { type: "image/png" }] },
  };
  harness.dropZone.events.dragover(event);
  assert.equal(event.dataTransfer.dropEffect, "copy");
  assert.equal(harness.dropZone.classes.has("is-dragging"), true);
  await harness.dropZone.events.drop(event);
  assert.equal(event.prevented, true);
  assert.equal(harness.writes.length, 2);
  assert.equal(harness.uploadPreviews.children.length, 2);
  assert.match(harness.uploadStatus.textContent, /2 private/);
  assert.equal(harness.dropZone.classes.has("is-dragging"), false);
  assert.equal(harness.uploadDialog.open, true);
  assert.equal(harness.grid.children[0].children[0].book.title, "My book");
});

test("popup reports rejected drops and upload errors, and restores picker controls", async () => {
  const harness = await galleryHarness({ empty: true });
  harness.addPhotos.events.click();
  await harness.dropZone.events.drop({ preventDefault() {}, dataTransfer: { files: [] } });
  assert.match(harness.uploadStatus.textContent, /Drop photo files/);
  harness.context.uploadBookPhoto = async () => { throw new Error("Unsupported photo"); };
  await harness.dropZone.events.drop({ preventDefault() {}, dataTransfer: { files: [{}] } });
  assert.equal(harness.uploadStatus.textContent, "Unsupported photo");
  assert.equal(harness.input.disabled, false);
  assert.equal(harness.cameraInput.disabled, false);
  assert.equal(harness.addPhotos.disabled, false);
});

test("multi-photo upload reports partial completion and preserves successfully uploaded files", async () => {
  const harness = await galleryHarness({ empty: true });
  harness.addPhotos.events.click();
  const upload = harness.context.uploadBookPhoto;
  let count = 0;
  harness.context.uploadBookPhoto = async (...args) => {
    if (count++) throw new Error("Choose a supported photo");
    return upload(...args);
  };
  await harness.dropZone.events.drop({
    preventDefault() {}, dataTransfer: { files: [{ type: "image/jpeg" }, { type: "image/svg+xml" }, {}] },
  });
  assert.equal(count, 2);
  assert.equal(harness.writes.length, 1);
  assert.equal(harness.uploadPreviews.children.length, 1);
  assert.match(harness.uploadStatus.textContent, /1 photo\(s\) were uploaded/);
  assert.match(harness.uploadStatus.textContent, /Choose a supported/);
  assert.equal(harness.input.disabled, false);
});

test("popup prevents duplicate drops while uploading and never accepts uploads after library removal", async () => {
  const harness = await galleryHarness({ empty: true });
  harness.addPhotos.events.click();
  let finish;
  let count = 0;
  harness.context.uploadBookPhoto = () => {
    count++;
    return new Promise((resolve) => { finish = resolve; });
  };
  const event = { preventDefault() {}, dataTransfer: { files: [{}] } };
  const pending = harness.dropZone.events.drop(event);
  await harness.dropZone.events.drop(event);
  assert.equal(count, 1);
  harness.state.books = [];
  harness.observe();
  finish("photo-path");
  await pending;
  await harness.dropZone.events.drop(event);
  assert.equal(count, 1);
  assert.equal(harness.uploadDialog.open, false);
});

test("popup closes on Escape and backdrop, restores focus, and clears private previews on sign-out", async () => {
  const harness = await galleryHarness();
  harness.addPhotos.events.click();
  assert.equal(harness.uploadPreviews.children.length, 1);
  let prevented = false;
  harness.uploadDialog.events.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(harness.uploadDialog.open, false);
  assert.equal(harness.addPhotos.focused, true);
  harness.addPhotos.events.click();
  harness.uploadDialog.events.click({ target: harness.uploadDialog });
  assert.equal(harness.uploadDialog.open, false);
  harness.addPhotos.events.click();
  harness.state.session = null;
  harness.observe();
  assert.equal(harness.uploadDialog.open, false);
  assert.equal(harness.uploadPreviews.children.length, 0);
  assert.equal(harness.section.children.length, 0);
});

test("popup drop area is dashed, responsive and uses modal backdrop styling", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.book-photo-upload-dialog\s*\{[^}]*width: min\(42rem, calc\(100vw - 2rem\)\);[^}]*max-height: calc\(100dvh - 2rem\)/);
  assert.match(css, /\.book-photo-drop-zone\s*\{[^}]*border: 2px dashed/);
  assert.match(css, /\.book-photo-upload-dialog::backdrop/);
});

test("expanded images show the selected upload privately and are cleaned up when signing out", async () => {
  const harness = await galleryHarness();
  harness.grid.children[1].events.click();
  harness.expand.events.click();
  const dialog = harness.context.document.body.children.at(-1);
  assert.equal(dialog.open, true);
  assert.equal(dialog.children[1].src, harness.uploaded.src);
  assert.equal(dialog.children[2].textContent, "Your photo");
  harness.state.session = null;
  harness.observe();
  assert.equal(dialog.open, false);
  assert.equal(dialog.removed, true);
  assert.equal(harness.section.children.length, 0);
});

test("expanded primary images use the selected edition and close on Escape with focus restored", async () => {
  const harness = await galleryHarness();
  const edition = { title: "My edition" };
  harness.section.events["book-cover-update"]({ detail: edition });
  harness.expand.events.click();
  const dialog = harness.context.document.body.children.at(-1);
  assert.equal(dialog.children[1].book, edition);
  let prevented = false;
  dialog.events.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(dialog.removed, true);
  assert.equal(harness.expand.focused, true);
});

test("refreshing photos closes expanded uploads before revoking their private object URLs", async () => {
  const harness = await galleryHarness();
  harness.grid.children[1].events.click();
  harness.expand.events.click();
  const dialog = harness.context.document.body.children.at(-1);
  await harness.retry.events.click();
  assert.equal(dialog.open, false);
  assert.equal(dialog.removed, true);
  assert.deepEqual(harness.revoked, ["blob:private"]);
  assert.equal(harness.badge.hidden, false);
});

test("failed gallery loads surface a retry, and removing a library book prevents further uploads", async () => {
  const { state, writes, status, retry, grid, input, primary } = await galleryHarness({ loadError: true });
  assert.equal(retry.hidden, false);
  assert.match(status.textContent, /Could not load/);
  assert.equal(grid.children.length, 1);
  assert.equal(grid.hidden, true);
  assert.equal(primary.hidden, false);
  state.books = [];
  input.files = [{}];
  await input.events.change();
  assert.equal(writes.length, 0);
});

test("in-flight photos never appear after sign-out, and leaving the book page releases photos", async () => {
  const harness = await galleryHarness();
  let finish;
  let downloading;
  const started = new Promise((resolve) => { downloading = resolve; });
  harness.context.downloadBookPhoto = () => new Promise((resolve) => {
    finish = resolve;
    downloading();
  });
  const retry = harness.retry;
  const pending = retry.events.click();
  await started;
  harness.state.session = null;
  harness.observe();
  finish(new Blob(["private"]));
  await pending;
  assert.equal(harness.section.children.length, 0);
  const next = await galleryHarness();
  next.state.view = "home";
  next.observe();
  assert.equal(next.section.children.length, 0);
  assert.deepEqual(next.revoked, ["blob:private"]);
});

test("library removal cleans up photos before deleting the book and preserves the book on cleanup failure", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const removeSource = source.slice(source.indexOf("async function removeBookFromLibrary("),
    source.indexOf("\nasync function renameShelf("));
  for (const failure of [false, true]) {
    const calls = [];
    const record = { id: book, title: "My book" };
    const state = {
      session: { user: { id: user } }, books: [record], currentBook: null,
      supabase: {
        from(table) {
          assert.equal(table, "books");
          return {
            delete() { calls.push("delete-book"); return this; },
            eq() { return this; },
          };
        },
      },
    };
    const context = {
      state, t: translate, showAppConfirm: async () => true, showToast() {}, render() {},
      console: { error() {} },
      listBookPhotos: async () => [{ path: "private-photo" }],
      removeBookPhotos: async () => {
        calls.push("delete-photos");
        if (failure) throw new Error("offline");
      },
    };
    const remove = runInNewContext(`${removeSource}\nremoveBookFromLibrary`, context);
    await remove(record);
    assert.deepEqual(calls, failure ? ["delete-photos"] : ["delete-photos", "delete-book"]);
    assert.equal(state.books.length, failure ? 1 : 0);
  }
});

test("private storage requests bypass service-worker caches", async () => {
  const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.ok(source.indexOf('pathname.includes("/storage/v1/")') < source.indexOf('event.request.destination === "image"'));
  assert.match(source, /"\/lib\/book-photos.js"/);
  const deployment = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(deployment.builds.some((build) => build.use === "@vercel/static"
    && build.src.startsWith("lib/") && build.src.includes("book-photos")));
});
