import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const palette = {
  "golden-batter": "#e8d1a7",
  "cowhide-cocoa": "#442d1c",
  "spiced-wine": "#743014",
  "toasted-caramel": "#84592b",
  "olive-harvest": "#9d9167",
  cream: "#fff8eb",
};

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/../g).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("theme tokens match the asset palette and use accessible text pairs", () => {
  for (const [name, value] of Object.entries(palette)) {
    assert.match(css, new RegExp(`--${name}: ${value};`));
  }
  for (const [foreground, background] of [
    ["cowhide-cocoa", "golden-batter"],
    ["spiced-wine", "golden-batter"],
    ["toasted-caramel", "cream"],
    ["cream", "cowhide-cocoa"],
    ["cream", "spiced-wine"],
  ]) {
    const values = [luminance(palette[foreground]), luminance(palette[background])].sort((a, b) => b - a);
    assert((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${foreground} on ${background} must meet WCAG AA`);
  }
  assert.match(css, /body\s*\{[^}]*color: var\(--ink\);[^}]*background: var\(--golden-batter\)/);
  assert.match(css, /\.main-stage\s*\{[^}]*background: var\(--golden-batter\)/);
});

test("menus, buttons, and progress accents share the palette across app surfaces", () => {
  const theme = css.slice(css.indexOf("/* Shared palette"));
  const menus = theme.slice(theme.indexOf(".account-menu-panel,"), theme.indexOf("\n:is(.account-menu-panel"));
  for (const selector of [
    ".account-navigation", ".book-actions-sheet", ".book-status-menu-panel",
    ".book-more-menu-panel", ".card-add-actions", ".edition-language-list", ".browse-popover .browse-panel",
  ]) assert(menus.includes(selector), `${selector} must share the menu surface`);
  assert.match(menus, /background: var\(--cowhide-cocoa\);[\s\S]*color: var\(--cream\)/);
  const buttons = theme.slice(theme.indexOf("\n.action-btn,"), theme.indexOf("\n.action-btn:hover"));
  for (const selector of [".reading-continue-btn", ".secondary-btn", ".edition-picker-button", ".cc-btn", ".upgrade-cta"]) {
    assert(buttons.includes(selector), `${selector} must share the button palette`);
  }
  assert.match(buttons, /background: var\(--cowhide-cocoa\);[\s\S]*color: var\(--cream\)/);
  assert.match(theme, /\.reading-feature-progress-bar > span,[\s\S]*background: var\(--olive-harvest\)/);
});

test("browser chrome, installed app, support pages, and admin use matching colors", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.background_color, palette["golden-batter"]);
  assert.equal(manifest.theme_color, palette["cowhide-cocoa"]);
  for (const path of ["index.html", "contact.html", "billing-support.html"]) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /name="theme-color" content="#e8d1a7"/);
  }
  const admin = await readFile(new URL("../admin.css", import.meta.url), "utf8");
  assert.match(admin, /--bg: #e8d1a7/);
  assert.match(admin, /--side: #442d1c/);
  assert.match(admin, /--brown: #442d1c/);
});
