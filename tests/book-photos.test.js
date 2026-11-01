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
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
}

async function galleryHarness({ loadError = false } = {}) {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const gallerySource = source.slice(source.indexOf("function createPrivateBookPhotoGallery("),
    source.indexOf("\nfunction createBookEditionPicker("));
  let start;
  let observe;
  const revoked = [];
  const writes = [];
  const state = { session: { user: { id: user } }, supabase: {}, books: [{ id: book }], view: "book" };
  const context = {
    state, t: translate,
    document: {
      createElement: () => new Element(), createTextNode: (text) => text,
      getElementById: () => new Element(),
    },
    MutationObserver: class {
      constructor(callback) { observe = callback; }
      observe() {}
      disconnect() {}
    },
    URL: { createObjectURL: () => "blob:private", revokeObjectURL: (url) => revoked.push(url) },
    queueMicrotask: (callback) => { start = callback; },
    console: { error() {} }, showToast() {}, showAppConfirm: async () => true,
    listBookPhotos: async () => {
      if (loadError) throw new Error("offline");
      return [{ path: `${user}/${book}/${name}` }];
    },
    downloadBookPhoto: async () => new Blob(["private"]),
    uploadBookPhoto: async (...args) => writes.push(["upload", ...args]),
    removeBookPhotos: async (...args) => writes.push(["remove", ...args]),
  };
  const create = runInNewContext(`${gallerySource}\ncreatePrivateBookPhotoGallery`, context);
  const section = create({ id: book, title: "My book" });
  await start();
  return { section, state, writes, revoked, observe: () => observe(), context };
}

test("gallery loads private photos, supports uploads and deletion, and revokes images when accounts change", async () => {
  const { section, state, writes, revoked, observe } = await galleryHarness();
  const [, , label, status, , grid] = section.children;
  assert.equal(grid.children.length, 1);
  assert.equal(grid.children[0].children[0].src, "blob:private");
  const input = label.children[1];
  input.files = [{ type: "image/jpeg" }];
  await input.events.change();
  assert.equal(writes[0][0], "upload");
  assert.equal(writes[0][2], user);
  assert.equal(writes[0][3], book);
  assert.equal(status.textContent, "Your private photos");
  await grid.children[0].children[1].events.click();
  assert.equal(writes[1][0], "remove");
  state.session = { user: { id: other } };
  observe();
  assert.equal(section.children.length, 0);
  assert.equal(revoked.length, 3);
  await input.events.change();
  assert.equal(writes.length, 2);
});

test("failed gallery loads surface a retry, and removing a library book prevents further uploads", async () => {
  const { section, state, writes } = await galleryHarness({ loadError: true });
  const [, , label, status, retry, grid] = section.children;
  assert.equal(retry.hidden, false);
  assert.match(status.textContent, /Could not load/);
  assert.equal(grid.children.length, 0);
  state.books = [];
  const input = label.children[1];
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
  const retry = harness.section.children[4];
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
