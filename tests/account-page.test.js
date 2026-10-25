import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

class Element {
  children = [];
  attributes = {};
  events = {};
  disabled = false;
  classList = { add() {}, remove() {}, toggle() {} };
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, handler) { this.events[event] = handler; }
  get childNodes() { return this.children; }
}

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const functions = source.slice(source.indexOf("function createAccountLink("), source.indexOf("\nfunction showUpgradePage()"));
const profileFunction = source.slice(source.indexOf("async function ensureProfile("), source.indexOf("\nasync function loadShelvesFromSupabase("));

function fixture(signedIn = true) {
  const page = new Element();
  const elements = [];
  const writes = [];
  let fail = false;
  let authUser = "reader";
  let signIns = 0;
  let deletions = 0;
  let signOuts = 0;
  const context = {
    state: {
      view: "", session: signedIn ? { user: { id: "reader", email: "reader@example.test" } } : null,
      profile: { full_name: "Reader", tier: "lite_reader" },
      supabase: { from(table) {
        assert.equal(table, "profiles");
        return { update(values) {
          writes.push(values);
          return { eq(key, value) {
            assert.equal(key, "id");
            assert.equal(value, "reader");
            return { select: () => ({ single: async () => fail
              ? { error: new Error("Could not save profile") }
              : { data: { full_name: values.full_name, tier: "lite_reader" } } }) };
          } };
        } };
      } },
    },
    document: {
      createElement() { const element = new Element(); elements.push(element); return element; },
      querySelector: () => ({}),
    },
    showPage(view) { context.state.view = view; page.replaceChildren(); return page; },
    showUpgradePage() { context.state.view = "upgrade"; page.replaceChildren({ billingControls: true }); },
    updateActiveNavigation() {}, updateAuthButton() {},
    getAccountTier: () => ({ name: "Lite Reader" }),
    createRouteHash: (view, params) => `#/${view}?section=${params.section}`,
    refreshAuthSession: async () => ({ user: { id: authUser } }),
    openAuthModal() { signIns++; },
    deleteAccount() { deletions++; },
    authButton: { click() { signOuts++; } },
    console: { error() {} },
  };
  runInNewContext(`${functions}\nthis.account = showAccountPage;`, context);
  return {
    context, elements, page, writes,
    failSave() { fail = true; },
    changeIdentity() { authUser = "other"; },
    counts: () => ({ signIns, deletions, signOuts }),
  };
}

test("account sections include essentials and honest policy status without publishing drafts", () => {
  for (const section of ["overview", "settings", "billing", "support"]) {
    const f = fixture();
    f.context.account(section);
    assert.equal(f.context.state.view, "account");
    const links = f.elements.filter((el) => el.href);
    const selected = links.filter((el) => el.attributes["aria-current"] === "page");
    assert.equal(selected.length, 1);
    assert.equal(selected[0].href, `#/account?section=${section}`);
    assert.equal(links.some((link) => /terms\.md|privacy\.md|legal-drafts/.test(link.href)), false);
    if (section === "billing") {
      assert.equal(f.elements.find((el) => el.className === "account-content").children[0].billingControls, true);
    }
    if (section === "support") {
      assert.ok(f.elements.some((el) => el.textContent?.includes("not yet published")));
      assert.ok(links.some((el) => el.href === "/contact.html#privacy"));
    }
  }
});

test("signed-out account route exposes sign-in, not private account settings", () => {
  const f = fixture(false);
  f.context.account("settings");
  const button = f.elements.find((el) => el.textContent === "Sign in");
  button.events.click();
  assert.equal(f.counts().signIns, 1);
  assert.equal(f.elements.some((el) => el.name === "displayName"), false);
});

test("settings save a trimmed display name and reuse permanent deletion and sign-out actions", async () => {
  const f = fixture();
  f.context.account("settings");
  f.elements.find((el) => el.name === "displayName").value = "  Cozy Reader  ";
  await f.elements.find((el) => el.className === "book-form").events.submit({ preventDefault() {} });
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].full_name, "Cozy Reader");
  assert.equal(f.context.state.profile.full_name, "Cozy Reader");
  assert.ok(f.elements.some((el) => el.textContent === "Your account settings have been saved."));
  f.elements.find((el) => el.textContent === "Delete account" && el.events.click).events.click();
  f.elements.find((el) => el.textContent === "Sign out").events.click();
  assert.equal(f.counts().deletions, 1);
  assert.equal(f.counts().signOuts, 1);
});

test("settings reject blank names and changed identities, and surface failed saves without success", async () => {
  for (const mode of ["blank", "changed", "failed"]) {
    const f = fixture();
    f.context.account("settings");
    const input = f.elements.find((el) => el.name === "displayName");
    input.value = mode === "blank" ? " " : "New name";
    if (mode === "changed") f.changeIdentity();
    if (mode === "failed") f.failSave();
    await f.elements.find((el) => el.className === "book-form").events.submit({ preventDefault() {} });
    const status = f.elements.find((el) => el.attributes.role === "status");
    assert.match(status.textContent, mode === "blank" ? /between 1 and 100/ : mode === "changed" ? /account changed/ : /Could not save profile/);
    assert.equal(f.context.state.profile.full_name, "Reader");
    assert.equal(f.writes.length, mode === "failed" ? 1 : 0);
    assert.equal(f.elements.find((el) => el.textContent === "Save changes").disabled, false);
  }
});

test("signing in again preserves the profile's saved display name instead of replacing it with old signup metadata", async () => {
  const context = {
    state: {
      session: { user: { id: "reader", user_metadata: { full_name: "Old name" } } },
      supabase: { from: () => ({ select: () => ({ eq: () => ({
        maybeSingle: async () => ({ data: { full_name: "Saved name" } }),
      }) }) }) },
    },
    updateAuthButton() {}, console,
  };
  runInNewContext(`${profileFunction}\nthis.profile = ensureProfile;`, context);
  await context.profile("Old name");
  assert.equal(context.state.profile.full_name, "Saved name");
});
