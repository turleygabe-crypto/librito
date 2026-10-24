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
