import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../lib/marketplace-ui.js", import.meta.url), "utf8");
const listingCardSource = source.slice(source.indexOf("  function listingCard("), source.indexOf("\n\n  async function browse("));

class Element {
  children = [];
  events = {};
  constructor(tagName) { this.tagName = tagName; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, callback) { this.events[name] = callback; }
}

function renderCard(listing) {
  const context = {
    conditionLabels: { like_new: "Like new", very_good: "Very good", good: "Good", acceptable: "Acceptable" },
    node(tag, text = "", className = "") {
      const element = new Element(tag);
      element.textContent = text;
      element.className = className;
      return element;
    },
    button(text, action) {
      const element = new Element("button");
      element.textContent = text;
      element.addEventListener("click", action);
      return element;
    },
    dollars: (cents) => `$${(cents / 100).toFixed(2)}`,
    navigate() {},
  };
  return runInNewContext(`${listingCardSource}\nlistingCard`, context)(listing);
}

test("marketplace shopping cards show additional seller photos when available", () => {
  const card = renderCard({
    id: "copy", title: "A Book", author: "A Reader", condition: "very_good",
    price_cents: 1250, shipping_cents: 300, photoUrls: ["front.jpg", "back.jpg", "spine.jpg"],
  });
  assert.equal(card.children[0].src, "front.jpg");
  assert.equal(card.children[1].className, "marketplace-listing-additional-photos");
  assert.deepEqual(card.children[1].children.map((image) => image.src), ["back.jpg", "spine.jpg"]);
  assert.deepEqual(card.children[1].children.map((image) => image.alt), [
    "Additional seller photograph 2 of A Book",
    "Additional seller photograph 3 of A Book",
  ]);
});

test("marketplace shopping cards omit the photo gallery when no seller photos exist", () => {
  const card = renderCard({
    id: "copy", title: "A Book", condition: "good", price_cents: 1250, shipping_cents: 300, photoUrls: [],
  });
  assert.equal(card.children[0].hidden, true);
  assert.notEqual(card.children[1].className, "marketplace-listing-additional-photos");
});
