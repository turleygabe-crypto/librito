import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20261101180000_membership_marketplace.sql", import.meta.url), "utf8");
const searchMigration = await readFile(new URL("../supabase/migrations/20261101190000_marketplace_search_pagination.sql", import.meta.url), "utf8");
const launchGateMigration = await readFile(new URL("../supabase/migrations/20261101200000_marketplace_admin_launch_gate.sql", import.meta.url), "utf8");

async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema storage;
    grant usage on schema storage to anon, authenticated;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      email text,
      full_name text,
      tier text not null default 'lite_reader' constraint profiles_tier_check
        check (tier in ('lite_reader', 'book_lover')),
      complimentary_book_lover boolean not null default false
    );
    create table public.books (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.profiles(id) on delete cascade
    );
    create table public.shelves (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.profiles(id) on delete cascade
    );
    create table public.liked_books (user_id uuid references public.profiles(id), book_id uuid references public.books(id));
    create table public.billing_environment (id boolean primary key, livemode boolean not null);
    insert into public.billing_environment values (true, false);
    create table public.billing_accounts (
      user_id uuid not null,
      livemode boolean not null default false,
      has_access boolean not null default false,
      subscription_plan text,
      primary key (user_id, livemode)
    );
    create function public.sync_billing_tier() returns trigger
      language plpgsql security definer set search_path = public as $$
      begin update public.profiles set tier = tier where id = new.user_id; return new; end $$;
    create table public.admins (user_id uuid primary key references auth.users(id));
    create function public.is_admin() returns boolean language sql stable as
      $$ select coalesce(current_setting('test.admin', true), 'false') = 'true' $$;
    create table storage.buckets (
      id text primary key, name text not null, public boolean not null,
      file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant select on storage.objects to anon, authenticated;
    create function storage.foldername(path text) returns text[] language sql immutable as
      $$ select string_to_array(regexp_replace(path, '/[^/]*$', ''), '/') $$;
    create function storage.filename(path text) returns text language sql immutable as
      $$ select split_part(path, '/', -1) $$;
    insert into auth.users(id, email) values
      ('00000000-0000-4000-8000-000000000001', 'seller@example.test'),
      ('00000000-0000-4000-8000-000000000002', 'buyer@example.test'),
      ('00000000-0000-4000-8000-000000000003', 'other@example.test'),
      ('00000000-0000-4000-8000-000000000004', 'shop@example.test');
  `);
  await db.exec(migration);
  await db.exec(searchMigration);
  await db.exec(launchGateMigration);
  await db.exec("grant usage on schema storage to anon, authenticated");
  await db.exec(`
    insert into public.profiles(id, email, tier, complimentary_bookshop_pro) values
      ('00000000-0000-4000-8000-000000000001', 'seller@example.test', 'free', false),
      ('00000000-0000-4000-8000-000000000002', 'buyer@example.test', 'free', false),
      ('00000000-0000-4000-8000-000000000003', 'other@example.test', 'free', false),
      ('00000000-0000-4000-8000-000000000004', 'shop@example.test', 'bookshop_pro', true);
  `);
  return db;
}

test("marketplace tables, photos, and quote RPC are admin-only until launch", async () => {
  const db = await createDatabase();
  try {
    const listing = "10000000-0000-4000-8000-000000000011";
    const seller = "00000000-0000-4000-8000-000000000001";
    const photoPath = `${seller}/${listing}/00000000-0000-4000-8000-000000000005.jpg`;
    await insertListing(db, listing, seller);
    await db.query("insert into storage.objects (bucket_id, name) values ('marketplace-listing-photos', $1)", [photoPath]);

    await db.exec("set role anon");
    assert.equal((await db.query("select id from public.marketplace_listings")).rows.length, 0);
    assert.equal((await db.query("select id from public.marketplace_search_listings(null, 0, 24)")).rows.length, 0);
    assert.equal((await db.query("select storage_path from public.marketplace_listing_photos")).rows.length, 0);
    assert.equal((await db.query("select id from storage.objects where bucket_id = 'marketplace-listing-photos'")).rows.length, 0);
    await db.exec("reset role");

    await db.exec("set role authenticated; select set_config('test.admin', 'false', false)");
    assert.equal((await db.query("select id from public.marketplace_listings")).rows.length, 0);
    await assert.rejects(
      db.query(`select public.marketplace_admin_quote('${listing}')`),
      /coming soon/i,
    );
    await assert.rejects(
      db.query(`select public.marketplace_quote('${listing}')`),
      /permission denied/,
    );
    await assert.rejects(
      db.query(`select public.marketplace_admin_create_mock_order(
        '${listing}', gen_random_uuid(), 'Reader', '1 Main', '', 'Town', '', '12345', 'US'
      )`),
      /coming soon/i,
    );
    await db.exec("select set_config('test.admin', 'true', false)");
    assert.equal((await db.query("select id from public.marketplace_listings")).rows.length, 1);
    assert.equal((await db.query("select public.marketplace_admin_quote($1) as quote", [listing])).rows[0].quote.book_price_cents, 2200);
    assert.equal((await db.query("select id from storage.objects where bucket_id = 'marketplace-listing-photos'")).rows.length, 1);
  } finally {
    await db.exec("reset role");
    await db.close();
  }
});

async function insertListing(db, id, sellerId, quantity = 1, title = "The Test Book") {
  await db.query(
    `insert into public.seller_profiles (user_id, seller_type, display_name)
     values ($1, $2, $3) on conflict (user_id) do nothing`,
    [sellerId, sellerId.endsWith("0004") ? "bookshop" : "personal", "Reader seller"],
  );
  await db.query(
    `insert into public.marketplace_listings
      (id, seller_id, title, author, condition, price_cents, shipping_cents, quantity)
     values ($1, $2, $3, 'Test Author', 'very_good', 2200, 500, $4)`,
    [id, sellerId, title, quantity],
  );
  await db.query(
    `insert into public.marketplace_listing_photos (listing_id, seller_id, storage_path)
     values ($1, $2, $3)`,
    [id, sellerId, `${sellerId}/${id}/00000000-0000-4000-8000-000000000005.jpg`],
  );
  await db.query("update public.marketplace_listings set status = 'active' where id = $1", [id]);
}

test("marketplace schema supports public discovery and bookshop expiry preserves inventory", async () => {
  const db = await createDatabase();
  try {
    const listing = "10000000-0000-4000-8000-000000000001";
    await insertListing(db, listing, "00000000-0000-4000-8000-000000000001");
    const quote = (await db.query("select public.marketplace_quote($1) as quote", [listing])).rows[0].quote;
    assert.equal(quote.book_price_cents, 2200);
    assert.equal(quote.shipping_cents, 500);
    assert.equal(quote.commission_cents, 110);
    assert.equal(quote.estimated_processing_fee_cents, 108);
    assert.equal(quote.estimated_seller_proceeds_cents, 2482);
    assert.equal(quote.buyer_total_cents, 2700);
    assert.equal(quote.tax_calculated, false);

    await insertListing(
      db,
      "10000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000004",
      4,
      "Shop inventory",
    );
    await db.exec(`
      update public.profiles set complimentary_bookshop_pro = false
      where id = '00000000-0000-4000-8000-000000000004';
    `);
    const shop = (await db.query(
      "select status, quantity from public.marketplace_listings where id = $1",
      ["10000000-0000-4000-8000-000000000004"],
    )).rows[0];
    assert.deepEqual(shop, { status: "paused", quantity: 4 });
    assert.equal(
      (await db.query("select count(*)::int as count from public.marketplace_listing_photos where listing_id = $1", [
        "10000000-0000-4000-8000-000000000004",
      ])).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("marketplace search filters in the database and returns stable bounded pages", async () => {
  const db = await createDatabase();
  try {
    const sellerId = "00000000-0000-4000-8000-000000000001";
    const listingIds = [];
    for (let index = 0; index < 30; index += 1) {
      const id = `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      listingIds.push(id);
      await insertListing(db, id, sellerId, 1, index === 7 ? "Needle in a Book" : `Book ${index}`);
      await db.query("update public.marketplace_listings set created_at = $2 where id = $1", [
        id, new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      ]);
    }

    const firstPage = await db.query(
      "select id from public.marketplace_search_listings(null, 0, 24)",
    );
    const secondPage = await db.query(
      "select id from public.marketplace_search_listings(null, 24, 24)",
    );
    assert.equal(firstPage.rows.length, 24);
    assert.equal(secondPage.rows.length, 6);
    assert.equal(new Set([...firstPage.rows, ...secondPage.rows].map((row) => row.id)).size, 30);
    assert.deepEqual(
      (await db.query("select id from public.marketplace_search_listings('needle', 0, 24)")).rows,
      [{ id: listingIds[7] }],
    );
    assert.equal(
      (await db.query("select count(*)::int as count from public.marketplace_search_listings(null, 0, 999)")).rows[0].count,
      30,
    );
    assert.equal(
      (await db.query("select count(*)::int as count from public.marketplace_search_listings(null, -5, 0)")).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("mock checkout calculates server-side amounts, is idempotent, and prevents overselling", async () => {
  const db = await createDatabase();
  try {
    const listing = "20000000-0000-4000-8000-000000000001";
    const firstRequest = "30000000-0000-4000-8000-000000000001";
    const secondRequest = "30000000-0000-4000-8000-000000000002";
    const sellerId = "00000000-0000-4000-8000-000000000001";
    const buyerId = "00000000-0000-4000-8000-000000000002";
    const otherBuyerId = "00000000-0000-4000-8000-000000000003";
    await insertListing(db, listing, sellerId);
    await assert.rejects(
      db.query(
        `select public.marketplace_create_mock_order($1,$2,'Reader','1 Main','', 'Town','','12345','US')`,
        [listing, firstRequest],
      ),
      /Sign in to place an order/,
    );
    await db.exec("update public.marketplace_settings set deployment_environment = 'test', mock_payments_enabled = true where id");
    await db.exec(`set request.jwt.claim.sub = '${buyerId}'`);
    const first = (await db.query(
      `select public.marketplace_create_mock_order($1,$2,'Reader','1 Main','', 'Town','','12345','US') as id`,
      [listing, firstRequest],
    )).rows[0].id;
    const repeated = (await db.query(
      `select public.marketplace_create_mock_order($1,$2,'Reader','1 Main','', 'Town','','12345','US') as id`,
      [listing, firstRequest],
    )).rows[0].id;
    assert.equal(repeated, first);
    assert.deepEqual((await db.query(
      "select status, buyer_total_cents from public.marketplace_orders where id = $1",
      [first],
    )).rows[0], { status: "test_simulated", buyer_total_cents: 2700 });
    assert.deepEqual((await db.query(
      "select mode, provider, status, commission_cents, actual_processing_fee_cents from public.marketplace_payments where order_id = $1",
      [first],
    )).rows[0], {
      mode: "mock",
      provider: "none",
      status: "simulation_only",
      commission_cents: 110,
      actual_processing_fee_cents: null,
    });
    await db.exec(`set request.jwt.claim.sub = '${otherBuyerId}'`);
    await assert.rejects(
      db.query(
        `select public.marketplace_create_mock_order($1,$2,'Other','2 Main','', 'Town','','12345','US')`,
        [listing, secondRequest],
      ),
      /no longer available/,
    );
    assert.equal(
      (await db.query("select quantity from public.marketplace_listings where id = $1", [listing])).rows[0].quantity,
      0,
    );
    assert.equal(
      (await db.query("select count(*)::int as count from public.marketplace_orders")).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("account deletion removes mock marketplace records before Auth cascades seller data", async () => {
  const db = await createDatabase();
  try {
    const listing = "40000000-0000-4000-8000-000000000001";
    const sellerId = "00000000-0000-4000-8000-000000000001";
    const buyerId = "00000000-0000-4000-8000-000000000002";
    await insertListing(db, listing, sellerId);
    await db.exec("update public.marketplace_settings set deployment_environment = 'test', mock_payments_enabled = true where id");
    await db.exec(`set request.jwt.claim.sub = '${buyerId}'`);
    const orderId = (await db.query(
      `select public.marketplace_create_mock_order($1,$2,'Reader','1 Main','', 'Town','','12345','US') as id`,
      [listing, "50000000-0000-4000-8000-000000000001"],
    )).rows[0].id;

    await db.query("select public.marketplace_assert_account_deletable($1)", [sellerId]);
    await db.query("select public.marketplace_delete_account_data($1)", [sellerId]);
    await db.query("delete from auth.users where id = $1", [sellerId]);

    for (const table of [
      "marketplace_orders", "marketplace_order_items", "marketplace_order_shipping",
      "marketplace_payments", "marketplace_listing_photos", "marketplace_listings",
      "seller_profiles",
    ]) {
      const field = table === "marketplace_orders" ? "id"
        : table === "marketplace_order_items" ? "order_id"
          : table === "marketplace_order_shipping" ? "order_id"
            : table === "marketplace_payments" ? "order_id"
              : table === "marketplace_listing_photos" ? "seller_id"
                : table === "marketplace_listings" ? "seller_id" : "user_id";
      const value = ["marketplace_orders", "marketplace_order_items",
        "marketplace_order_shipping", "marketplace_payments"].includes(table) ? orderId : sellerId;
      assert.equal(
        (await db.query(`select count(*)::int as count from public.${table} where ${field} = $1`, [value])).rows[0].count,
        0,
        table,
      );
    }
  } finally {
    await db.close();
  }
});

test("account deletion refuses to erase live marketplace payment history", async () => {
  const db = await createDatabase();
  try {
    const listing = "60000000-0000-4000-8000-000000000001";
    const sellerId = "00000000-0000-4000-8000-000000000001";
    const buyerId = "00000000-0000-4000-8000-000000000002";
    await insertListing(db, listing, sellerId);
    await db.exec("update public.marketplace_settings set deployment_environment = 'test', mock_payments_enabled = true where id");
    await db.exec(`set request.jwt.claim.sub = '${buyerId}'`);
    const orderId = (await db.query(
      `select public.marketplace_create_mock_order($1,$2,'Reader','1 Main','', 'Town','','12345','US') as id`,
      [listing, "70000000-0000-4000-8000-000000000001"],
    )).rows[0].id;
    await db.query(
      `update public.marketplace_payments
       set mode = 'stripe_live', provider = 'stripe', provider_payment_id = 'pi_live_test', status = 'succeeded'
       where order_id = $1`,
      [orderId],
    );
    await assert.rejects(
      db.query("select public.marketplace_assert_account_deletable($1)", [sellerId]),
      /Live marketplace payment records must be resolved/,
    );
    assert.equal(
      (await db.query("select count(*)::int as count from public.marketplace_orders where id = $1", [orderId])).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("Bookshop Pro-only listings and storefronts are enforced by database triggers", async () => {
  const db = await createDatabase();
  try {
    const personalId = "00000000-0000-4000-8000-000000000001";
    await db.query(
      "insert into public.seller_profiles (user_id, seller_type, display_name) values ($1, 'personal', 'Reader')",
      [personalId],
    );
    await assert.rejects(
      db.query(
        "insert into public.seller_profiles (user_id, seller_type, display_name) values ($1, 'bookshop', 'Business')",
        [personalId],
      ),
      /Bookshop Pro plan is required/,
    );
    await db.query(
      "insert into public.seller_profiles (user_id, seller_type, display_name) values ($1, 'bookshop', 'Bookshop')",
      ["00000000-0000-4000-8000-000000000004"],
    );
    await assert.rejects(
      db.query(
        "insert into public.seller_storefronts (seller_id, slug, store_name) values ($1, 'reader-shop', 'Reader shop')",
        [personalId],
      ),
      /Bookshop Pro plan is required/,
    );
  } finally {
    await db.close();
  }
});
