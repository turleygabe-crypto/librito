import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { translate } from "../translations.js";

class Element {
  children = [];
  attributes = {};
  events = {};

  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
}

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const cardFunction = source.slice(source.indexOf("function createBookCard("), source.indexOf("\nfunction normalizeBookRecord("));
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
  const favorites = [];
  const shelfRemovals = [];
  const context = {
    document: { createElement: () => new Element() },
    state,
    t: translate,
    getLibraryBooks: () => ownedBooks,
    getBookKey: (entry) => entry.key,
    getAnyShelfNames: () => shelfNames,
    getCustomShelves: () => state.shelves.filter((shelf) => !shelf.is_wishlist),
    createBookCover: () => new Element(),
    wireCardPopover() {},
    navigateTo() {},
    promptAddToShelf() {},
    toggleBookFavorite: (entry) => favorites.push(entry),
    addAnyBookToShelf: (entry, shelf) => shelfAdds.push([entry, shelf]),
    removeAnyBookFromShelf: (entry, shelfName) => shelfRemovals.push([entry, shelfName]),
    openBookProfile() {},
    removeBookFromLibrary() {},
  };
  const createBookCard = runInNewContext(`${cardFunction}\n${menuFunction}\ncreateBookCard`, context);
  return { card: createBookCard(book), shelfAdds, favorites, shelfRemovals };
}

test("book cards toggle Favorite directly and offer custom-shelf actions without an Add to Library action", () => {
  const book = { key: "book-1", title: "A Book", author: "An Author" };
  const { card, favorites } = createCard(book);
  const favorite = card.children.find((child) => child.className.startsWith("card-like"));
  const menu = card.children.find((child) => child.className === "card-menu");
  const actions = menu.children[1].children;

  assert.equal(favorite.textContent, "♡");
  assert.match(favorite.attributes["aria-label"], /Favorite/);
  assert.equal(favorite.attributes["aria-pressed"], "false");
  favorite.events.click();
  assert.deepEqual(favorites, [book]);
  assert.equal(actions[0].textContent, "Add to a shelf");
  assert.equal(actions.some((action) => /Add to Library|Wishlist/.test(action.textContent)), false);
  assert.equal(actions.some((action) => action.textContent === "Purchase"), true);
});

test("saved book cards show favorite state and keep Remove from library in the menu", () => {
  const book = { key: "book-2", title: "Saved Book", author: "An Author", is_favorite: true };
  const { card } = createCard(book, { ownedBooks: [book] });
  const favorite = card.children.find((child) => child.className.startsWith("card-like"));
  const actions = card.children.find((child) => child.className === "card-menu").children[1].children;

  assert.equal(favorite.textContent, "♥");
  assert.equal(favorite.attributes["aria-pressed"], "true");
  assert.deepEqual(
    actions.map((action) => action.textContent),
    ["Add to a shelf", "Open book", "Remove from library"],
  );
});

test("Remove from shelf appears only for books on the current custom shelf", () => {
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
