import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const helper = source.slice(source.indexOf("function setupTextInputDismissal("), source.indexOf('\nglobalSearchForm.addEventListener("submit"'));
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

function setup({ touch = true, tag = "input", hint = "search" } = {}) {
  class Element {
    closest() { return this.editable ? this : null; }
  }
  const active = new Element();
  active.editable = true;
  active.enterKeyHint = hint;
  active.matches = (selector) => selector === "input" ? tag === "input" : ["input", "textarea"].includes(tag);
  let blurCount = 0;
  active.blur = () => { blurCount += 1; };
  const listeners = {};
  const document = {
    activeElement: active,
    addEventListener(type, handler, capture) {
      assert.equal(capture, true);
      listeners[type] = handler;
    },
  };
  runInNewContext(`${helper}\nsetupTextInputDismissal();`, {
    Element, document, window: { matchMedia: () => ({ matches: touch }) },
  });
  const fire = (type, options = {}) => listeners[type]({ type, target: active, ...options });
  return { active, Element, document, fire, blurCount: () => blurCount };
}

test("touch form submissions dismiss only text fields belonging to the submitted form", () => {
  for (const tag of ["input", "textarea"]) {
    const ui = setup({ tag });
    ui.fire("submit", { target: { contains: () => false } });
    assert.equal(ui.blurCount(), 0);
    ui.fire("submit", { target: { contains: (element) => element === ui.active } });
    assert.equal(ui.blurCount(), 1);
  }
});

test("touch Search and Done keys dismiss input keyboards without preventing the action", () => {
  for (const hint of ["search", "done"]) {
    const ui = setup({ hint });
    ui.fire("keydown", { key: "a" });
    ui.fire("keydown", { key: "Enter", isComposing: true });
    assert.equal(ui.blurCount(), 0);
    ui.fire("keydown", { key: "Enter", preventDefault() { assert.fail("Search must still run"); } });
    assert.equal(ui.blurCount(), 1);
  }
});

test("Search key in a form keeps focus so the browser submits, then submit dismisses the keyboard", () => {
  const ui = setup();
  ui.active.form = {};
  ui.fire("keydown", { key: "Enter", preventDefault() { assert.fail("Search must still run"); } });
  assert.equal(ui.blurCount(), 0);
  ui.fire("submit", { target: { contains: (element) => element === ui.active } });
  assert.equal(ui.blurCount(), 1);
});

test("Enter preserves multiline editing and Next-key field navigation", () => {
  for (const options of [{ tag: "textarea" }, { hint: "next" }, { hint: "" }]) {
    const ui = setup(options);
    ui.fire("keydown", { key: "Enter" });
    assert.equal(ui.blurCount(), 0);
  }
});

test("touch outside taps dismiss keyboards while text controls and labels preserve focus", () => {
  const ui = setup();
  ui.fire("pointerdown");
  const editable = new ui.Element();
  editable.editable = true;
  ui.fire("pointerdown", { target: editable });
  assert.equal(ui.blurCount(), 0);
  ui.fire("pointerdown", { target: new ui.Element() });
  assert.equal(ui.blurCount(), 1);
});

test("desktop submissions and keyboard actions preserve focus", () => {
  const ui = setup({ touch: false });
  ui.fire("submit", { target: { contains: () => true } });
  ui.fire("keydown", { key: "Enter" });
  ui.fire("pointerdown", { target: new ui.Element() });
  assert.equal(ui.blurCount(), 0);
});

test("dismissal safely ignores absent or non-text focus", () => {
  const ui = setup({ tag: "button" });
  ui.fire("keydown", { key: "Enter" });
  ui.fire("pointerdown", { target: new ui.Element() });
  ui.document.activeElement = null;
  ui.fire("keydown", { key: "Enter" });
  assert.equal(ui.blurCount(), 0);
});

test("catalog and lookup inputs advertise the mobile Search action", () => {
  for (const id of ["globalSearchInput", "lookupTitleInput", "lookupAuthorInput", "isbnInput"]) {
    assert.match(html, new RegExp(`<input id="${id}"[^>]*enterkeyhint="search"`));
  }
});
