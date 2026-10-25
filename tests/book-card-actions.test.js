import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

class Element {
  children = [];
  attributes = {};
  events = {};

  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
}

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const cardFunction = source.slice(source.indexOf("function createBookCard("), source.indexOf("\nfunction normalizeShelfRecord("));
const menuFunction = source.slice(source.indexOf("function createBookCardMenu("), source.indexOf("\nfunction removeOrphanPopovers("));

function createCard(book, { ownedBooks = [], shelfNames = [], currentShelf = "", view = "browse" } = {}) {
  const state = {
    books: ownedBooks,
    shelves: [
      { id: "wishlist", name: "Wishlist", is_wishlist: true },
      { id: "favorites", name: "Favorites" },
    ],
    view,
    currentShelf,
  };
  const shelfAdds = [];
  const likedBooks = [];
  const shelfRemovals = [];
  const context = {
    document: { createElement: () => new Element() },
    state,
    getLibraryBooks: () => ownedBooks,
    getBookKey: (entry) => entry.key,
    getAnyShelfNames: () => shelfNames,
    createBookCover: () => new Element(),
    wireCardPopover() {},
    markBookAsOwned() {},
    navigateTo() {},
    promptAddToShelf() {},
    toggleBookLike: (entry) => likedBooks.push(entry),
    addAnyBookToShelf: (entry, shelf) => shelfAdds.push([entry, shelf]),
    removeAnyBookFromShelf: (entry, shelfName) => shelfRemovals.push([entry, shelfName]),
    openBookProfile() {},
    removeBookFromLibrary() {},
    renderBooks() {},
  };
  const createBookCard = runInNewContext(`${cardFunction}\n${menuFunction}\ncreateBookCard`, context);
  return { card: createBookCard(book), shelfAdds, likedBooks, shelfRemovals };
}

test("book-card left menu offers Like and Wishlist; right menu holds the remaining actions", () => {
  const book = { key: "book-1", title: "A Book", author: "An Author" };
  const { card, shelfAdds, likedBooks } = createCard(book);
  const likeMenu = card.children.find((child) => child.className === "card-like-menu");
  const rightMenu = card.children.find((child) => child.className === "card-menu");
  const leftOptions = likeMenu.children[1].children;
  const rightOptions = rightMenu.children[1].children;

  assert.deepEqual(leftOptions.map((option) => option.textContent), ["Like", "Add to Wishlist"]);
  assert.deepEqual(rightOptions.map((option) => option.textContent), [
    "Add to Library", "Add to a shelf", "Purchase",
  ]);
  leftOptions[0].events.click();
  leftOptions[1].events.click();
  assert.deepEqual(likedBooks, [book]);
  assert.deepEqual(shelfAdds, [[book, { id: "wishlist", name: "Wishlist", is_wishlist: true }]]);
});

test("owned book cards keep Like on the left and omit acquisition actions on the right", () => {
  const book = { key: "book-2", title: "Owned Book", author: "An Author", liked: true };
  const { card } = createCard(book, { ownedBooks: [book] });
  const likeMenu = card.children.find((child) => child.className === "card-like-menu");
  const rightMenu = card.children.find((child) => child.className === "card-menu");

  assert.equal(likeMenu.children[0].textContent, "♥");
  assert.equal(likeMenu.children[1].children[0].textContent, "Unlike");
  assert.deepEqual(
    rightMenu.children[1].children.map((option) => option.textContent),
    ["Add to a shelf", "Open book"],
  );
});

test("Remove from shelf appears only for books on the current shelf", () => {
  const book = { key: "book-3", title: "Shelved Book", author: "An Author" };
  const onShelf = createCard(book, {
    shelfNames: ["Favorites"],
    currentShelf: "Favorites",
    view: "shelf",
  });
  const onShelfOptions = onShelf.card.children
    .find((child) => child.className === "card-menu")
    .children[1].children;
  const remove = onShelfOptions.find((option) => option.textContent === "Remove from shelf");
  assert.ok(remove);
  remove.events.click();
  assert.deepEqual(onShelf.shelfRemovals, [[book, "Favorites"]]);

  const otherShelf = createCard(book, {
    shelfNames: ["Favorites"],
    currentShelf: "Wishlist",
    view: "shelf",
  });
  const otherShelfOptions = otherShelf.card.children
    .find((child) => child.className === "card-menu")
    .children[1].children;
  assert.equal(otherShelfOptions.some((option) => option.textContent === "Remove from shelf"), false);

  const suggestion = createCard(book);
  const suggestionOptions = suggestion.card.children
    .find((child) => child.className === "card-menu")
    .children[1].children;
  assert.equal(suggestionOptions.some((option) => option.textContent.includes("Remove")), false);
});
