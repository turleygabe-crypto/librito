import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MARKETPLACE_PHOTO_BUCKET,
  createMarketplacePhotoUrl,
  removeAccountMarketplaceListingPhotos,
  uploadMarketplaceListingPhoto,
} from "../lib/marketplace-photos.js";

function jpeg() {
  return new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" });
}

test("marketplace photos use a separate bucket and are associated with their physical listing", async () => {
  const calls = [];
  const client = {
    storage: {
      from(bucket) {
        calls.push(["bucket", bucket]);
        return {
          upload: async (path, file, options) => {
            calls.push(["upload", path, file, options]);
            return { data: { path }, error: null };
          },
          createSignedUrl: async (path, seconds) => ({
            data: { signedUrl: `https://storage.example/${path}?expires=${seconds}` }, error: null,
          }),
        };
      },
    },
    from(table) {
      return {
        insert: async (record) => {
          calls.push(["insert", table, record]);
          return { data: null, error: null };
        },
      };
    },
  };
  const path = await uploadMarketplaceListingPhoto(
    client, "seller-id", "listing-id", jpeg(), 2,
  );
  assert.match(path, /^seller-id\/listing-id\/[0-9a-f-]{36}\.jpg$/);
  assert.ok(calls.some(([kind, bucket]) => kind === "bucket" && bucket === MARKETPLACE_PHOTO_BUCKET));
  assert.ok(calls.some(([kind, table, record]) => kind === "insert"
    && table === "marketplace_listing_photos"
    && record.seller_id === "seller-id"
    && record.listing_id === "listing-id"
    && record.storage_path === path
    && record.position === 2));
  assert.equal(await createMarketplacePhotoUrl(client, path), `https://storage.example/${path}?expires=300`);
});

test("marketplace photo uploads reject unsupported and forged image data", async () => {
  let uploaded = false;
  const client = {
    storage: { from: () => ({ upload: async () => { uploaded = true; return { error: null }; } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  };
  await assert.rejects(uploadMarketplaceListingPhoto(
    client, "seller-id", "listing-id", new Blob(["not an image"], { type: "image/jpeg" }),
  ), /not a supported photo/);
  await assert.rejects(uploadMarketplaceListingPhoto(
    client, "seller-id", "listing-id", new Blob(["text"], { type: "text/plain" }),
  ), /Choose a JPEG/);
  assert.equal(uploaded, false);
});

test("failed photo association removes the just-uploaded object", async () => {
  const removed = [];
  const client = {
    storage: {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        remove: async (paths) => { removed.push(paths); return { data: [], error: null }; },
      }),
    },
    from: () => ({ insert: async () => ({ data: null, error: new Error("metadata failed") }) }),
  };
  await assert.rejects(uploadMarketplaceListingPhoto(client, "seller-id", "listing-id", jpeg()), /metadata failed/);
  assert.equal(removed.length, 1);
  assert.match(removed[0][0], /^seller-id\/listing-id\//);
});

test("account marketplace photo cleanup paginates metadata and removes objects in bounded batches", async () => {
  const removed = [];
  const ranges = [];
  const photos = Array.from({ length: 101 }, (_, index) => ({ storage_path: `seller/${index}.jpg` }));
  const client = {
    from(table) {
      assert.equal(table, "marketplace_listing_photos");
      const query = {
        select(columns) { assert.equal(columns, "storage_path"); return query; },
        eq(column, userId) { assert.equal(column, "seller_id"); assert.equal(userId, "seller"); return query; },
        range(start, end) {
          ranges.push([start, end]);
          return Promise.resolve({ data: photos.slice(start, end + 1), error: null });
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, MARKETPLACE_PHOTO_BUCKET);
        return { remove: async (paths) => { removed.push(paths); return { data: [], error: null }; } };
      },
    },
  };
  await removeAccountMarketplaceListingPhotos(client, "seller");
  assert.deepEqual(ranges, [[0, 99], [100, 199]]);
  assert.deepEqual(removed.map((paths) => paths.length), [100, 1]);
  assert.equal(removed.flat().length, 101);
});
