const english = Object.freeze({
  "status.next_read": "Want to Read",
  "status.reading": "Currently Reading",
  "status.read": "Read",
  "status.dnf": "Did Not Finish",
  "status.none": "No status",
  "status.not_set": "not set",
  "status.mark_as_read": "Mark as read",
  "status.marked_as_read": "Marked as read",
  "status.set": "Status set to {status}",
  "status.removed": "Reading status removed",
  "status.moved_to_reading": "Moved to {status}",
  "status.reading_limit": "{tier} accounts can have up to {max} books in {status}. Book Lover upgrades are coming soon.",
  "status.reading_limit_feature": "Up to {max} books in {status}",
  "status.unlimited_reading_feature": "Unlimited books in {status}",
  "status.reading_empty": "Open a book in your library and set its status to {status} to add it here.",
  "status.summary": "Reading: {status}",
  "status.aria_label": "Reading status: {status}",
  "status.control_label": "Reading status",
  "status.shelf_view": "Library view · {count} books",
  "status.shelf_remove": "Remove {status} from My Shelves",
  "status.shortcut_add": "Add to My Shelves",
  "status.shortcut_remove": "Remove from My Shelves",
  "ownership.wishlist": "Wishlist",
  "ownership.owned": "Owned",
  "ownership.sold": "Sold",
  "ownership.donated": "Donated",
  "ownership.summary": "Ownership: {status}",
  "ownership.control_label": "Ownership",
  "library.add_to_library": "Add to Library",
  "favorite.label": "Favorite",
  "favorite.not": "Not a favorite",
  "favorites.label": "Favorites",
  "stats.custom_shelves": "Custom shelves",
  "features.library_and_shelves": "Library, Favorites, and custom shelves always included",
});

export const translatorNotes = Object.freeze({
  "status.read": "Reading status, past participle (like 'Leído', 'Lu', 'Gelesen'), not the verb 'to read'.",
  "status.dnf": "Did Not Finish: natural phrasing varies by language, adapt rather than translate literally.",
});

export function translate(key, values = {}) {
  const message = english[key] ?? key;
  return message.replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder
  );
}
