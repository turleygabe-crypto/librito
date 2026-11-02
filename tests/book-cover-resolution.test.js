import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const functionSource = source.slice(source.indexOf("function createBookCover("), source.indexOf("\nfunction updateAuthButton("));

class Element {
  children = [];
  events = {};
  classList = { add: () => {} };
  style = {};
  removed = false;

  append(...children) { this.children.push(...children); }
  prepend(child) { this.children.unshift(child); }
  addEventListener(name, handler) { this.events[name] = handler; }
  setAttribute() {}
  remove() { this.removed = true; }
}

function harness() {
  const preloads = [];
  const context = {
    document: { createElement: () => new Element() },
    Image: class extends Element { constructor() { super(); preloads.push(this); } },
  };
  runInNewContext(`${functionSource}\nthis.createBookCover = createBookCover;`, context);
  return { createCover: context.createBookCover, preloads };
}

test("book cards paint medium Open Library covers first, then upgrade to large", () => {
  const { createCover, preloads } = harness();
  const image = createCover({ title: "El Zahir", cover_i: 123 }).children[0];
  assert.equal(image.src, "https://covers.openlibrary.org/b/id/123-M.jpg?default=false");
  image.events.load();
  assert.equal(preloads.length, 1);
  assert.equal(preloads[0].src, "https://covers.openlibrary.org/b/id/123-L.jpg?default=false");
  preloads[0].events.load();
  assert.equal(image.src, "https://covers.openlibrary.org/b/id/123-L.jpg?default=false");
});

test("stored large Open Library cover URLs still load medium first", () => {
  const { createCover } = harness();
  const image = createCover({ title: "A", cover_url: "https://covers.openlibrary.org/b/id/9-L.jpg?default=false" }).children[0];
  assert.equal(image.src, "https://covers.openlibrary.org/b/id/9-M.jpg?default=false");
});

test("large upgrades run at most two at a time and keep medium covers when they fail", () => {
  const { createCover, preloads } = harness();
  const images = [1, 2, 3].map((id) => createCover({ title: "B", cover_i: id }).children[0]);
  images.forEach((image) => image.events.load());
  assert.equal(preloads.length, 2);
  preloads[0].events.error();
  assert.equal(images[0].src, "https://covers.openlibrary.org/b/id/1-M.jpg?default=false");
  assert.equal(preloads.length, 3);
});

test("custom cover URLs are used as-is and removed on failure", () => {
  const { createCover, preloads } = harness();
  const image = createCover({ title: "A Book", cover_url: "https://example.test/cover.jpg" }).children[0];
  assert.equal(image.src, "https://example.test/cover.jpg");
  image.events.load();
  assert.equal(preloads.length, 0);
  image.events.error();
  assert.equal(image.removed, true);
});
