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
    document: {
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
  const [stage, label, grid, remove, status, retry] = section.children;
  const [primary, uploaded, badge, navigation] = stage.children;
  return {
    section, state, writes, revoked, observe: () => observe(), context,
    stage, primary, uploaded, badge, navigation, input: label.children[1], label, grid, remove, status, retry,
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
  assert.equal(position.textContent, "1 / 2");
  assert.equal(grid.children[0].attributes["aria-pressed"], "true");
  next.events.click();
  assert.equal(primary.hidden, true);
  assert.equal(uploaded.hidden, false);
  assert.equal(badge.hidden, false);
  assert.equal(badge.textContent, "Your photo");
  assert.equal(position.textContent, "2 / 2");
  assert.equal(grid.children[1].attributes["aria-pressed"], "true");
  next.events.click();
  assert.equal(primary.hidden, false);
  assert.equal(badge.hidden, true);
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
  assert.equal(harness.label.children[0], "+ Upload");
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

test("gallery stays frameless and has compact thumbnails at desktop and mobile sizes", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.private-book-photos\s*\{/);
  assert.match(css, /\.book-cover-gallery\s*\{[^}]*width: min\(100%, 11rem\)/);
  assert.match(css, /\.private-book-photo-grid\s*\{[^}]*display: flex;[^}]*overflow-x: auto/);
  assert.match(css, /\.book-photo-thumbnail\s*\{[^}]*height: 3\.5rem/);
  assert.match(css, /\.book-cover-gallery \[hidden\]\s*\{[^}]*display: none/);
  assert.match(css, /@media \(max-width: 1150px\)[\s\S]*?\.book-detail-cover,\s*\.book-cover-gallery\s*\{[^}]*grid-row: span 2/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.book-detail-cover,\s*\.book-cover-gallery\s*\{[^}]*width: min\(58vw, 12rem\);[^}]*grid-row: auto/);
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
    && build.src === "lib/{supabase-client,billing-status,book-photos}.js"));
});
