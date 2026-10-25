import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

class Element {
  children = [];
  attributes = {};
  events = {};
  disabled = false;
  hidden = false;
  isConnected = true;
  classList = { add() {}, remove() {}, toggle() {} };
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.events[name] = handler; }
  focus() {}
  reset() {}
  replaceChildren(...children) { this.children = children; }
  querySelector(selector) {
    const matches = (element) => selector.startsWith(".")
      ? element.className?.split(" ").includes(selector.slice(1))
      : selector === "[role='dialog']" && element.attributes.role === "dialog";
    for (const child of this.children) {
      if (matches(child)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
}

test("in-app confirmation keeps errors visible, prevents duplicate submits and retries successfully", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const functions = source.slice(source.indexOf("function ensureAppDialog()"), source.indexOf("\nasync function showAppPrompt("));
  const body = new Element();
  const context = {
    document: { body, activeElement: new Element(), createElement: () => new Element() },
    HTMLElement: Element, console: { error() {} },
  };
  runInNewContext(`
    let appDialogOverlay = null;
    let appDialogResolver = null;
    let appDialogReturnFocus = null;
    let appDialogBusy = false;
    let appDialogConfirmAction = null;
    ${functions}
    this.confirm = showAppConfirm;
    this.settle = settleAppDialog;
  `, context);
  let attempts = 0;
  let release;
  const pending = context.confirm("Resume your existing subscription?", {
    title: "Resume renewal", confirmLabel: "Resume renewal",
    onConfirm: async () => {
      attempts++;
      await new Promise((resolve) => { release = resolve; });
      if (attempts === 1) throw new Error("Couldn't resume. Try again.");
    },
  });
  let settled = false;
  pending.then(() => { settled = true; });
  const overlay = body.children[0];
  const form = overlay.querySelector(".app-dialog-form");
  const submit = overlay.querySelector(".action-btn");
  const error = overlay.querySelector(".app-dialog-error");
  const event = { preventDefault() {} };
  const first = form.events.submit(event);
  assert.equal(submit.disabled, true);
  await form.events.submit(event);
  assert.equal(attempts, 1);
  context.settle(null);
  assert.equal(settled, false);
  release();
  await first;
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /Couldn't resume/);
  assert.equal(submit.disabled, false);
  assert.equal(settled, false);
  const second = form.events.submit(event);
  release();
  await second;
  assert.equal(await pending, true);
  assert.equal(attempts, 2);

  const canceled = context.confirm("Resume?", { onConfirm: () => { throw new Error("Must not run"); } });
  assert.equal(error.hidden, true);
  context.settle(null);
  assert.equal(await canceled, false);
});

test("account deletion uses typed in-app confirmation, prevents identity changes, and clears only Librito browser data after verified success", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const dialogs = source.slice(source.indexOf("function ensureAppDialog()"), source.indexOf("\nasync function showAppPrompt("));
  const deletion = source.slice(source.indexOf("async function deleteAccount("), source.indexOf("\nasync function openBilling("));
  assert.doesNotMatch(deletion, /window\.(confirm|prompt)/);
  for (const outcome of ["success", "server-failure", "changed-account", "canceled"]) {
    const body = new Element();
    const storage = { "librito-private": "reader data", "other-app": "keep", removeItem(key) { delete this[key]; } };
    const sessionStorage = { "librito-reminder": "dismissed", removeItem(key) { delete this[key]; } };
    const removedCaches = [];
    let redirected;
    let requests = 0;
    let signedOut = false;
    const context = {
      document: { body, activeElement: new Element(), createElement: () => new Element() },
      HTMLElement: Element, console: { error() {} }, localStorage: storage, sessionStorage,
      state: { session: { user: { id: "reader" } }, profile: {}, supabase: {
        auth: { signOut: async (options) => { assert.equal(options.scope, "local"); signedOut = true; return {}; } },
      } },
      window: { caches: {}, location: { replace: (url) => { redirected = url; } } },
      caches: { keys: async () => ["librito-covers-v1", "other-app"], delete: async (name) => { removedCaches.push(name); } },
      refreshAuthSession: async () => ({ user: { id: outcome === "changed-account" ? "other" : "reader" }, access_token: "verified-token" }),
      fetch: async (url, options) => {
        requests++;
        assert.equal(url, "/api/account");
        assert.equal(options.method, "POST");
        assert.equal(options.headers.Authorization, "Bearer verified-token");
        assert.deepEqual(JSON.parse(options.body), { confirmation: "DELETE" });
        return {
          ok: outcome !== "server-failure",
          headers: { get: () => "application/json" },
          json: async () => outcome === "server-failure" ? { error: "Billing may already have stopped. Retry deletion." } : { deleted: true },
        };
      },
    };
    runInNewContext(`
      let appDialogOverlay = null, appDialogResolver = null, appDialogReturnFocus = null;
      let appDialogBusy = false, appDialogConfirmAction = null;
      ${dialogs}
      ${deletion}
      this.removeAccount = deleteAccount;
      this.settle = settleAppDialog;
    `, context);
    const button = { disabled: false };
    const pending = context.removeAccount(button);
    const overlay = body.children[0];
    const form = overlay.querySelector(".app-dialog-form");
    const input = overlay.querySelector(".app-dialog-input");
    const error = overlay.querySelector(".app-dialog-error");
    assert.match(overlay.querySelector(".app-dialog-message").textContent, /subscription is canceled immediately/);
    assert.match(overlay.querySelector(".app-dialog-message").textContent, /No automatic refund/);
    assert.equal(input.attributes["aria-label"], "Type DELETE to confirm permanent account deletion");
    if (outcome === "canceled") {
      context.settle(null);
    } else {
      input.value = "delete";
      await form.events.submit({ preventDefault() {} });
      assert.equal(requests, 0);
      assert.match(error.textContent, /Type DELETE exactly/);
      input.value = "DELETE";
      await form.events.submit({ preventDefault() {} });
      if (outcome !== "success") {
        assert.equal(error.hidden, false);
        assert.match(error.textContent, outcome === "changed-account" ? /account changed/ : /Billing may already have stopped/);
        context.settle(null);
      }
    }
    await pending;
    assert.equal(button.disabled, false);
    if (outcome === "success") {
      assert.equal(requests, 1);
      assert.equal(signedOut, true);
      assert.equal(storage["librito-private"], undefined);
      assert.equal(storage["other-app"], "keep");
      assert.equal(sessionStorage["librito-reminder"], undefined);
      assert.deepEqual(removedCaches, ["librito-covers-v1"]);
      assert.equal(redirected, "/contact.html?account=deleted");
    } else {
      assert.equal(signedOut, false);
      assert.equal(storage["librito-private"], "reader data");
      assert.equal(redirected, undefined);
    }
  }
});

test("resume control uses Librito confirmation and never calls a browser prompt", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const functionSource = source.slice(source.indexOf("async function resumeBilling("), source.indexOf("\nlet reminderRequest"));
  assert.doesNotMatch(functionSource, /window\.confirm/);
  let options;
  let confirmationMessage;
  let request;
  let refreshed = false;
  const context = {
    showAppConfirm: async (message, value) => { confirmationMessage = message; options = value; await value.onConfirm(); return true; },
    billingRequest: async (body) => { request = body; },
    formatDate: () => "October 24, 2027", showToast() {}, console,
    showAppDialog: async (value) => {
      assert.match(value.title, /glad you're staying/);
      assert.equal(value.cancelLabel, null);
    },
  };
  runInNewContext(`${functionSource}\nthis.resume = resumeBilling;`, context);
  const button = { disabled: false };
  await context.resume(button, { periodEnd: "2027-10-24" }, async () => { refreshed = true; });
  assert.equal(options.confirmLabel, "Renew subscription");
  assert.equal(options.cancelLabel, "Continue cancellation");
  assert.match(confirmationMessage, /subscription is canceled/);
  assert.match(confirmationMessage, /no further payments are scheduled/);
  assert.match(confirmationMessage, /If you choose Renew subscription, automatic renewal will resume/);
  assert.doesNotMatch(confirmationMessage, /plan will renew automatically/);
  assert.equal(request.action, "resume");
  assert.equal(refreshed, true);
  assert.equal(button.disabled, false);
});

test("cancel confirmation is explicit and a successful change is not reported as failed when refresh fails", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const functions = source.slice(source.indexOf("async function refreshAfterBillingChange("), source.indexOf("\nlet reminderRequest"));
  const toasts = [];
  let options;
  let message;
  let request;
  let successOptions;
  let confirmations = 0;
  const context = {
    showAppConfirm: async (text, value) => {
      confirmations++;
      if (confirmations % 2 === 0) {
        successOptions = value;
        assert.match(text, /cancellation is confirmed/);
        assert.match(text, /Changed your mind/);
        return false;
      }
      message = text;
      options = value;
      await value.onConfirm();
      return true;
    },
    billingRequest: async (body) => { request = body; },
    showToast: (text) => toasts.push(text),
    formatDate: () => "October 24, 2027", console: { error() {} },
  };
  runInNewContext(`${functions}\nthis.cancel = cancelBilling;`, context);
  const button = { disabled: false };
  await context.cancel(button, { periodEnd: "2027-10-24" }, false,
    async () => { throw new Error("Refresh failed"); });
  assert.equal(request.action, "cancel");
  assert.equal(options.confirmLabel, "Cancel subscription");
  assert.equal(options.cancelLabel, "Keep subscription");
  assert.match(message, /continue until October 24, 2027/);
  assert.match(message, /books and shelves will stay saved/);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Your change was saved/);
  assert.equal(successOptions.confirmLabel, "Renew subscription");
  assert.equal(button.disabled, false);
  await context.cancel(button, {}, true, async () => {});
  assert.match(message, /complimentary Book Lover access will remain unchanged/);
});

test("Book Lover welcome waits for confirmed access, lists benefits, and appears only once", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const functionSource = source.slice(source.indexOf("function showBookLoverWelcome("), source.indexOf("\nlet reminderRequest"));
  const storage = new Map([["librito-book-lover-welcome:reader", "pending"]]);
  const dialogs = [];
  let navigated;
  const context = {
    sessionStorage: {
      getItem: (key) => storage.get(key),
      removeItem: (key) => storage.delete(key),
    },
    appDialogResolver: null,
    state: { session: { user: { id: "reader" } } },
    showAppDialog: async (options) => { dialogs.push(options); return true; },
    navigateTo: (route) => { navigated = route; },
  };
  runInNewContext(`${functionSource}\nthis.welcome = showBookLoverWelcome;`, context);
  context.welcome({ status: "incomplete", hasSubscription: true }, { tier: "lite_reader" }, "reader");
  context.welcome({ status: "active", hasSubscription: true }, { tier: "lite_reader" }, "reader");
  assert.equal(dialogs.length, 0);
  context.appDialogResolver = () => {};
  context.welcome({ status: "active", hasSubscription: true }, { tier: "book_lover" }, "reader");
  assert.equal(dialogs.length, 0);
  context.appDialogResolver = null;
  context.welcome({ status: "active", hasSubscription: true }, { tier: "book_lover" }, "reader");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].title, "Welcome to Book Lover!");
  assert.equal(dialogs[0].features.length, 5);
  assert.match(dialogs[0].features.join(" "), /Unlimited books.*Unlimited custom shelves.*CSV/);
  assert.equal(dialogs[0].cancelLabel, null);
  assert.equal(navigated, "home");
  context.welcome({ status: "active", hasSubscription: true }, { tier: "book_lover" }, "reader");
  assert.equal(dialogs.length, 1);
});
