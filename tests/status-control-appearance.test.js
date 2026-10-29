import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const statusMenuSource = source.slice(
  source.indexOf("function createReadingStatusMenu("),
  source.indexOf("\nfunction createOwnedFormatPicker("),
);

class Element {
  children = [];
  attributes = {};
  events = {};
  append(...children) { this.children.push(...children); }
  addEventListener(name, callback) { this.events[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = value; }
}

function createStatusMenus() {
  const context = {
    document: { createElement: () => new Element() },
    READING_STATUS_LABELS: { next_read: "Want to Read", reading: "Currently Reading" },
    OWNERSHIP_STATUS_LABELS: { owned: "Owned" },
    getReadingStatusLabel: (status) => context.READING_STATUS_LABELS[status] || "",
    getOwnershipStatusLabel: (status) => context.OWNERSHIP_STATUS_LABELS[status] || "",
    t: (key, values = {}) => key === "status.aria_label" ? `Reading status: ${values.status}` : key,
    setReadingStatus() {},
    setOwnershipStatus() {},
    createOwnedFormatPicker: () => new Element(),
    wireCardPopover() {},
  };
  const createMenus = runInNewContext(
    `${statusMenuSource}\nthis.createMenus = { createReadingStatusMenu, createOwnershipStatusMenu };`,
    context,
  );
  return createMenus;
}

test("reading and ownership menus keep their status text free of duplicate dropdown arrows", () => {
  const { createReadingStatusMenu, createOwnershipStatusMenu } = createStatusMenus();
  const reading = createReadingStatusMenu({}, { reading_status: "reading" });
  const ownership = createOwnershipStatusMenu({}, { ownership_status: "owned" });

  assert.equal(reading.children[0].textContent, "Currently Reading");
  assert.equal(reading.children[0].attributes["aria-label"], "Reading status: Currently Reading");
  assert.equal(ownership.children[0].textContent, "Owned");
  assert.equal(ownership.children[0].attributes["aria-label"], "Ownership status: Owned");
});

test("status controls use warm icon pills and stack on book cards", async () => {
  const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /\.book-status-menu > summary\.currently-reading-button\s*\{[^}]*background: #fbf6ef/);
  assert.match(css, /\.book-status-menu > summary::before\s*\{[^}]*background: url\("data:image\/svg\+xml/);
  assert.match(css, /\.ownership-status-menu > summary::before\s*\{[^}]*background-image: url\("data:image\/svg\+xml/);
  assert.match(css, /\.book-status-menu > summary::after\s*\{[^}]*transform: rotate\(45deg\)/);
  assert.match(css, /\.card-status-controls\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
});
