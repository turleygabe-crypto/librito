import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { translate, translatorNotes } from "../translations.js";

test("reading status translations use the stable status keys and requested wording", () => {
  assert.equal(translate("status.next_read"), "Want to Read");
  assert.equal(translate("status.reading"), "Currently Reading");
  assert.equal(translate("status.read"), "Read");
  assert.equal(translate("status.dnf"), "Did Not Finish");
});

test("reading status translator notes preserve the requested semantic guidance", () => {
  assert.equal(
    translatorNotes["status.read"],
    "Reading status, past participle (like 'Leído', 'Lu', 'Gelesen'), not the verb 'to read'."
  );
  assert.equal(
    translatorNotes["status.dnf"],
    "Did Not Finish: natural phrasing varies by language, adapt rather than translate literally."
  );
});

test("translation strings interpolate parameters and preserve unknown placeholders", () => {
  assert.equal(
    translate("status.reading_limit", { tier: "Lite Reader", max: 5, status: "Currently Reading" }),
    "Lite Reader accounts can have up to 5 books in Currently Reading. Book Lover upgrades are coming soon."
  );
  assert.equal(translate("unknown.key"), "unknown.key");
  assert.equal(translate("status.set", { status: "Read" }), "Status set to Read");
});

test("the service worker precaches the translation module for offline startup", async () => {
  const worker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /ASSETS\s*=\s*\[[^\]]*"\/translations\.js"/);
});
