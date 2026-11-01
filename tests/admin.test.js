import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { adminDependencies, createAdminHandler } from "../api/admin.js";

const sql = new PGlite();
const adminId = "11111111-1111-4111-8111-111111111111";
const readerId = "22222222-2222-4222-8222-222222222222";
const source = await readFile(new URL("../admin.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261101210000_admin_roles_and_test_accounts.sql", import.meta.url), "utf8");

before(async () => {
  await sql.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text, created_at timestamptz default now(),
      last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}'
    );
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade, email text, full_name text,
      tier text default 'free', complimentary_book_lover boolean default false,
      complimentary_bookshop_pro boolean default false
    );
    create table public.books (user_id uuid);
    create table public.shelves (user_id uuid);
    create table public.liked_books (user_id uuid);
    create table public.billing_accounts (user_id uuid, has_access boolean, subscription_plan text, livemode boolean);
    create table public.billing_environment (id boolean, livemode boolean);
    insert into public.billing_environment values (true, false);
    insert into auth.users(id, email) values ('${adminId}', 'admin@example.test'), ('${readerId}', 'reader@example.test');
    grant usage on schema public, auth to authenticated, anon;
  `);
  const base = await readFile(new URL("../supabase/migrations/20261021190000_admin_dashboard.sql", import.meta.url), "utf8");
  await sql.exec(base.slice(0, base.indexOf("create or replace function public.admin_stats")));
  await sql.exec(`
    revoke all on function public.is_admin() from public, anon;
    grant execute on function public.is_admin() to authenticated;
    grant all on public.admins to authenticated;
    insert into public.admins(user_id) values ('${adminId}');
  `);
  const membership = await readFile(new URL("../supabase/migrations/20261101180000_membership_marketplace.sql", import.meta.url), "utf8");
  await sql.exec(membership.slice(membership.indexOf("create or replace function public.derive_profile_tier()"), membership.indexOf("drop trigger if exists billing_sync_tier")));
  await sql.exec("create trigger profiles_derive_tier before insert or update on profiles for each row execute function derive_profile_tier()");
  await sql.exec(migration);
});

after(() => sql.close());

test("role RPC grants and revokes real admin access without changing membership", async () => {
  await sql.exec(`select set_config('test.uid', '${adminId}', false); set role authenticated;`);
  try {
    assert.equal((await sql.query("select admin_set_role($1, 'admin') as role", [readerId])).rows[0].role, "admin");
    const users = (await sql.query("select admin_users() as users")).rows[0].users;
    assert.equal(users.find((user) => user.id === readerId).is_admin, true);
    assert.equal(users.find((user) => user.id === readerId).tier, "free");
    await sql.query("select set_config('test.uid', $1, false)", [readerId]);
    assert.equal((await sql.query("select is_admin() as admin")).rows[0].admin, true);
    await sql.query("select set_config('test.uid', $1, false)", [adminId]);
    await sql.query("select admin_set_role($1, 'reader')", [readerId]);
    await sql.query("select set_config('test.uid', $1, false)", [readerId]);
    assert.equal((await sql.query("select is_admin() as admin")).rows[0].admin, false);
    await assert.rejects(sql.query("select admin_set_role($1, 'admin')", [readerId]), /not authorized/);
    await assert.rejects(sql.query("select admin_users()"), /not authorized/);
    await assert.rejects(sql.query("insert into admins(user_id) values ($1)", [readerId]), /row-level security/);
  } finally {
    await sql.exec("reset role");
  }
});

test("role RPC rejects self-demotion, invalid/null roles, missing users and anonymous access", async () => {
  await sql.exec(`select set_config('test.uid', '${adminId}', false); set role authenticated;`);
  try {
    await assert.rejects(sql.query("select admin_set_role($1, 'reader')", [adminId]), /own admin access/);
    for (const role of [null, "", "owner"]) {
      await assert.rejects(sql.query("select admin_set_role($1, $2)", [readerId, role]), /invalid role/);
    }
    await assert.rejects(sql.query("select admin_set_role(null, 'admin')"), /user not found/);
    await sql.exec("reset role; set role anon");
    await assert.rejects(sql.query("select admin_set_role($1, 'admin')", [readerId]), /permission denied/);
    await assert.rejects(sql.query("select admin_users()"), /permission denied/);
  } finally {
    await sql.exec("reset role");
  }
});

test("test-account markers come from protected app metadata, preserving plan and complimentary fields", async () => {
  await sql.query("update auth.users set raw_user_meta_data = $1 where id = $2", [{ is_test_account: true }, readerId]);
  await sql.exec(`select set_config('test.uid', '${adminId}', false); set role authenticated;`);
  try {
    const users = (await sql.query("select admin_users() as users")).rows[0].users;
    const reader = users.find((user) => user.id === readerId);
    assert.equal(reader.is_test_account, false);
    assert.equal(reader.complimentary_book_lover, false);
    assert.equal(reader.complimentary_bookshop_pro, false);
  } finally {
    await sql.exec("reset role");
  }
  await sql.query("update auth.users set raw_app_meta_data = $1 where id = $2", [{ is_test_account: true }, readerId]);
  const users = (await sql.query("select admin_users() as users")).rows[0].users;
  assert.equal(users.find((user) => user.id === readerId).is_test_account, true);
});

function fixture(options = {}) {
  const calls = [];
  const db = {
    auth: {
      getUser: async (token) => {
        calls.push(["authenticate", token]);
        return options.badToken ? { error: new Error("expired") } : { data: { user: { id: adminId } } };
      },
      admin: {
        createUser: async (input) => {
          calls.push(["create", input]);
          if (options.createError) return { error: options.createError };
          return { data: { user: { id: readerId, email: input.email } } };
        },
        deleteUser: async (id, soft) => {
          calls.push(["delete", id, soft]);
          return options.cleanupError ? { error: new Error("cleanup failed") } : { data: { user: { id } } };
        },
      },
    },
    from(table) {
      if (table === "admins") {
        return {
          select() { return this; },
          eq(column, id) { calls.push(["admin", column, id]); return this; },
          async maybeSingle() {
            return options.lookupError ? { error: new Error("database failed") }
              : { data: options.reader ? null : { user_id: adminId } };
          },
        };
      }
      assert.equal(table, "profiles");
      return {
        upsert(profile, settings) { calls.push(["profile", profile, settings]); return this; },
        select(column) { assert.equal(column, "tier"); return this; },
        async single() {
          if (options.setupError) return { error: new Error("setup failed") };
          const profile = calls.find(([name]) => name === "profile")[1];
          return { data: { tier: options.wrongTier ? "free" : profile.complimentary_bookshop_pro ? "bookshop_pro" : profile.complimentary_book_lover ? "book_lover" : "free" } };
        },
      };
    },
  };
  const req = {
    method: "POST", headers: { origin: "https://librito.casa", authorization: "Bearer test-token" },
    body: { name: "reader-one", password: "Testing-password-123!", plan: "free" },
  };
  const res = {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return { calls, req, res, handler: createAdminHandler(() => ({ db, origin: "https://librito.casa" })) };
}

test("admin account creation needs only Supabase and a valid application origin, not Stripe", () => {
  assert.throws(() => adminDependencies({}), /not configured/);
  assert.throws(() => adminDependencies({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test", APP_URL: "http://librito.casa" }), /secure/);
  const deps = adminDependencies({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test", APP_URL: "https://librito.casa/" });
  assert.equal(deps.origin, "https://librito.casa");
  assert.ok(deps.db);
});

test("creates confirmed Free, Book Lover and Bookshop Pro Reader accounts using support aliases and real tier derivation", async () => {
  const emails = new Set();
  for (const plan of ["free", "book_lover", "bookshop_pro"]) {
    const f = fixture();
    f.req.body.plan = plan;
    f.req.body.email = "victim@example.test";
    f.req.body.is_admin = true;
    await f.handler(f.req, f.res);
    assert.equal(f.res.code, 201);
    assert.equal(f.res.headers["Cache-Control"], "no-store");
    const created = f.calls.find(([name]) => name === "create")[1];
    assert.match(created.email, new RegExp(`^support\\+test-${plan}-[a-f0-9-]+@librito\\.casa$`));
    assert.ok(created.email.split("@")[0].length <= 64);
    assert.equal(created.email_confirm, true);
    assert.equal(created.password, f.req.body.password);
    assert.equal(created.app_metadata.is_test_account, true);
    assert.equal(created.user_metadata.full_name, "Test: reader-one");
    assert.equal("is_admin" in created, false);
    assert.equal(JSON.stringify(f.res.body).includes(f.req.body.password), false);
    assert.equal(f.res.body.user.tier, plan);
    emails.add(created.email);
    const profile = f.calls.find(([name]) => name === "profile")[1];
    await sql.query(`insert into profiles(id, email, full_name, complimentary_book_lover, complimentary_bookshop_pro)
      values ($1, $2, $3, $4, $5) on conflict (id) do update set
      complimentary_book_lover = excluded.complimentary_book_lover, complimentary_bookshop_pro = excluded.complimentary_bookshop_pro`,
    [readerId, profile.email, profile.full_name, profile.complimentary_book_lover, profile.complimentary_bookshop_pro]);
    assert.equal((await sql.query("select tier from profiles where id = $1", [readerId])).rows[0].tier, plan);
    assert.equal((await sql.query("select exists(select 1 from admins where user_id = $1) as admin", [readerId])).rows[0].admin, false);
  }
  assert.equal(emails.size, 3);
});

test("creation refuses unauthenticated, non-admin, cross-origin and unsupported requests before creating users", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const [options, mutate, code] of [
    [{}, (req) => { req.method = "GET"; }, 405],
    [{}, (req) => { delete req.headers.authorization; }, 401],
    [{ badToken: true }, () => {}, 401],
    [{ reader: true }, () => {}, 403],
    [{ lookupError: true }, () => {}, 500],
    [{}, (req) => { req.headers.origin = "https://evil.example"; }, 403],
  ]) {
    const f = fixture(options);
    mutate(f.req);
    await f.handler(f.req, f.res);
    assert.equal(f.res.code, code);
    assert.equal(f.calls.some(([name]) => name === "create"), false);
  }
});

test("creation validates names, passwords and exact plan allowlist", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const body of [
    { name: "bad@email" }, { name: "UPPER" }, { name: "x".repeat(25) }, { name: "-reader" },
    { name: null }, { password: "short" }, { password: "x".repeat(129) }, { password: 123 },
    { plan: "admin" }, { plan: null },
  ]) {
    const f = fixture();
    Object.assign(f.req.body, body);
    await f.handler(f.req, f.res);
    assert.equal(f.res.code, 400);
    assert.equal(f.calls.some(([name]) => name === "create"), false);
  }
  for (const password of ["x".repeat(12), "x".repeat(128)]) {
    const f = fixture();
    f.req.body.password = password;
    await f.handler(f.req, f.res);
    assert.equal(f.res.code, 201);
  }
});

test("creation reports provider errors and cleans up failures without reporting success", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const status of [422, 503]) {
    const f = fixture({ createError: { status, message: "provider rejected" } });
    await f.handler(f.req, f.res);
    assert.equal(f.res.code, status === 422 ? 400 : 500);
    assert.equal(f.calls.some(([name]) => name === "profile"), false);
  }
  for (const options of [{ setupError: true }, { wrongTier: true }, { setupError: true, cleanupError: true }]) {
    const f = fixture(options);
    f.req.body.plan = "bookshop_pro";
    await f.handler(f.req, f.res);
    assert.equal(f.res.code, 500);
    assert.deepEqual(f.calls.find(([name]) => name === "delete"), ["delete", readerId, false]);
    if (options.cleanupError) {
      assert.match(f.res.body.error, /was created, but its plan could not be confirmed/);
      assert.match(f.res.body.error, /support\+test-bookshop_pro/);
    }
  }
});

function dialogFixture() {
  const submit = { disabled: false };
  const error = { textContent: "" };
  const output = { hidden: true, innerHTML: "", querySelector: () => ({ addEventListener() {} }) };
  const form = {
    elements: { name: { value: "reader" }, password: { value: "Testing-password-123!" }, plan: { value: "book_lover" } },
    querySelector: () => submit,
    addEventListener(event, callback) { this[event] = callback; },
    reset() { this.elements.password.value = ""; },
  };
  const dialog = {
    querySelector(selector) { return { form, ".err": error, ".test-account-result": output }[selector]; },
  };
  return { submit, error, output, form, dialog };
}

test("creation UI sends the selected plan, preserves admin login, refreshes users and clears the password", async () => {
  for (const outcome of ["success", "server-error", "network-error"]) {
    const f = dialogFixture();
    const calls = [];
    const context = {
      view: { users: [], stats: {} }, esc: (v) => v,
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "admin-token" } } }) } },
      fetch: async (url, options) => {
        calls.push([url, options]);
        assert.equal(f.submit.disabled, true);
        f.form.elements.plan.value = "free";
        if (outcome === "network-error") throw new Error("offline");
        return {
          ok: outcome === "success",
          json: async () => outcome === "success"
            ? { user: { id: readerId, email: "support+test-book_lover@example.test", is_test_account: true, tier: "book_lover" } }
            : { error: "Only admins can create test accounts." },
        };
      },
      show: async () => { calls.push(["show"]); }, console: { error() {} },
    };
    const code = source.slice(source.indexOf("function createTestAccount()"), source.indexOf("\nfunction marketplaceReportsPage()"));
    const sandbox = { ...context, dialog: f.dialog };
    runInNewContext(`${code}\nthis.accountDialog = () => dialog; createTestAccount();`, sandbox);
    await f.form.submit({ preventDefault() {} });
    assert.equal(calls[0][0], "/api/admin");
    assert.equal(calls[0][1].headers.Authorization, "Bearer admin-token");
    assert.equal(JSON.parse(calls[0][1].body).plan, "book_lover");
    assert.equal(f.submit.disabled, false);
    if (outcome === "success") {
      assert.equal(f.form.elements.password.value, "");
      assert.equal(f.form.hidden, true);
      assert.match(f.output.innerHTML, /Book Lover test account created/);
      assert.equal(sandbox.view.users, null);
      assert.equal(calls[1][0], "show");
    } else {
      assert.match(f.error.textContent, /Could not create test account/);
      assert.equal(f.output.hidden, true);
    }
  }
});

test("test login uses ordinary password authentication and only redirects after a verified session", async () => {
  for (const outcome of ["success", "error", "no-session"]) {
    const f = dialogFixture();
    const calls = [];
    const sandbox = {
      dialog: f.dialog, esc: (v) => v,
      supabase: { auth: { signInWithPassword: async (credentials) => {
        calls.push(credentials);
        return {
          data: { session: outcome === "success" ? { user: { id: readerId } } : null },
          error: outcome === "error" ? new Error("Invalid credentials") : null,
        };
      } } },
      window: { location: { assign: (url) => calls.push(url) } }, console: { error() {} },
    };
    const code = source.slice(source.indexOf("function testAccountLogin("), source.indexOf("\nfunction createTestAccount()"));
    runInNewContext(`${code}\nthis.accountDialog = () => dialog; testAccountLogin({ id: '${readerId}', email: 'support+test-free@example.test' });`, sandbox);
    await f.form.submit({ preventDefault() {} });
    assert.equal(calls[0].email, "support+test-free@example.test");
    assert.equal(calls[0].password, "Testing-password-123!");
    assert.equal(f.submit.disabled, false);
    if (outcome !== "success") {
      assert.equal(calls.length, 1);
      assert.match(f.error.textContent, /Invalid credentials|could not be confirmed/);
    } else {
      assert.equal(calls[1], "/");
      assert.equal(f.form.elements.password.value, "");
    }
  }
});

test("Users exposes role controls, disables own role, and only shows login for marked test accounts", () => {
  const sandbox = {
    view: { search: "", userId: adminId, users: [
      { id: adminId, email: "admin@example.test", is_admin: true },
      { id: readerId, email: "support+test-free@example.test", is_admin: false, is_test_account: true },
    ] },
    esc: (v) => String(v ?? ""), fmtDate: () => "date",
  };
  const code = source.slice(source.indexOf("function usersPage()"), source.indexOf("\nfunction accountDialog("));
  runInNewContext(`${code}\nthis.html = usersPage();`, sandbox);
  assert.match(sandbox.html, /Role for admin@example.test" disabled/);
  assert.equal((sandbox.html.match(/class="test-login"|class="btn ghost test-login"/g) || []).length, 1);
  assert.match(sandbox.html, /TEST ACCOUNT/);
  assert.match(source, /Create test account/);
  assert.match(source, /admin_set_role/);
});

test("role controls confirm changes, persist successes, and restore the previous role on failures or cancellation", async () => {
  for (const outcome of ["success", "cancel", "error", "network-error", "unconfirmed"]) {
    const user = { id: readerId, email: "reader@example.test", is_admin: false };
    const select = {
      dataset: { user: readerId }, value: "admin", disabled: false,
      addEventListener(event, callback) { this[event] = callback; },
    };
    const calls = [];
    const sandbox = {
      view: { users: [user] },
      root: { querySelectorAll(selector) { assert.equal(selector, ".role-select"); return [select]; } },
      confirm: (message) => { assert.match(message, /full dashboard access/); return outcome !== "cancel"; },
      alert: (message) => calls.push(["alert", message]), console: { error() {} },
      supabase: { rpc: async (name, args) => {
        calls.push([name, args]);
        assert.equal(select.disabled, true);
        if (outcome === "network-error") throw new Error("offline");
        return { data: outcome === "unconfirmed" ? null : "admin", error: outcome === "error" ? new Error("not authorized") : null };
      } },
    };
    const code = source.slice(source.indexOf('  root.querySelectorAll(".role-select")'), source.indexOf('  const range = document.getElementById("range")'));
    runInNewContext(code, sandbox);
    await select.change();
    assert.equal(select.disabled, false);
    assert.equal(user.is_admin, outcome === "success");
    assert.equal(select.value, outcome === "success" ? "admin" : "reader");
    if (outcome === "cancel") {
      assert.equal(calls.length, 0);
    } else {
      assert.equal(calls[0][0], "admin_set_role");
      assert.equal(calls[0][1].target_user, readerId);
      assert.equal(calls[0][1].new_role, "admin");
      if (outcome !== "success") assert.match(calls[1][1], /Could not change role/);
    }
  }
});
