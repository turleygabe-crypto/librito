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

function createCover(book, className = "") {
  const context = {
    document: { createElement: () => new Element() },
  };
  runInNewContext(`${functionSource}\nthis.createBookCover = createBookCover;`, context);
  return context.createBookCover(book, className);
}

test("book cards request large Open Library covers", () => {
  const cover = createCover({ title: "El Zahir", cover_i: 123 });
  assert.equal(cover.children[0].src, "https://covers.openlibrary.org/b/id/123-L.jpg?default=false");
});

test("book covers fall back to medium Open Library covers when large covers are unavailable", () => {
  const cover = createCover({ title: "El Zahir", isbn: "9780061122415" });
  const image = cover.children[0];
  image.events.error();
  assert.equal(image.src, "https://covers.openlibrary.org/b/isbn/9780061122415-M.jpg?default=false");
});

test("custom cover URLs are removed on failure instead of retried unchanged", () => {
  const cover = createCover({ title: "A Book", cover_url: "https://example.test/cover.jpg" });
  const image = cover.children[0];
  image.events.error();
  assert.equal(image.removed, true);
});
