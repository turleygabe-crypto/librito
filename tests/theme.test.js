import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const palette = {
  "warm-sand": "#f3e6d8",
  "deep-sage": "#5e6f4f",
  sage: "#7f9270",
  "soft-sage": "#9caf88",
  "blush-adobe": "#e8c3ae",
  terracotta: "#c26a4a",
  "warm-peach-clay": "#d98b6b",
  "deep-clay": "#a9553a",
  "sage-ink": "#45523a",
  text: "#302d24",
  cream: "#fffaf2",
  "botanical-green": "#4b543d",
  "botanical-ink": "#303b29",
  parchment: "#e5d4ae",
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
    ["text", "warm-sand"],
    ["sage-ink", "warm-sand"],
    ["deep-clay", "cream"],
    ["cream", "deep-sage"],
    ["cream", "sage-ink"],
    ["parchment", "botanical-green"],
    ["parchment", "botanical-ink"],
  ]) {
    const values = [luminance(palette[foreground]), luminance(palette[background])].sort((a, b) => b - a);
    assert((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${foreground} on ${background} must meet WCAG AA`);
  }
  assert.match(css, /body\s*\{[^}]*color: var\(--ink\);[^}]*background: var\(--warm-sand\)/);
  assert.match(css, /\.main-stage\s*\{[^}]*background: var\(--warm-sand\)/);
});

test("menus, buttons, and progress accents share the palette across app surfaces", () => {
  const theme = css.slice(css.indexOf("/* Shared palette"));
  const menus = theme.slice(theme.indexOf(".account-menu-panel,"), theme.indexOf("\n:is(.account-menu-panel"));
  for (const selector of [
    ".account-navigation", ".book-actions-sheet", ".book-status-menu-panel",
    ".book-more-menu-panel", ".card-add-actions", ".edition-language-list", ".browse-popover .browse-panel",
  ]) assert(menus.includes(selector), `${selector} must share the menu surface`);
  assert.match(menus, /--deep-sage: var\(--botanical-green\)/);
  assert.match(menus, /--sage-ink: var\(--botanical-ink\)/);
  assert.match(menus, /--antique-gold: var\(--parchment\)/);
  assert.match(menus, /background: var\(--deep-sage\);[\s\S]*color: var\(--parchment\)/);
  const buttons = theme.slice(theme.indexOf("\n.action-btn,"), theme.indexOf("\n.action-btn:hover"));
  for (const selector of [".reading-continue-btn", ".secondary-btn", ".edition-picker-button", ".cc-btn", ".upgrade-cta"]) {
    assert(buttons.includes(selector), `${selector} must share the button palette`);
  }
  assert.match(buttons, /background: var\(--deep-sage\);[\s\S]*color: var\(--cream\)/);
  assert.match(theme, /\.reading-feature-progress-bar > span\s*\{\s*background: var\(--terracotta\)/);
});

test("browser chrome, installed app, support pages, and admin use matching colors", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.background_color, palette["warm-sand"]);
  assert.equal(manifest.theme_color, palette["deep-sage"]);
  for (const path of ["index.html", "contact.html", "billing-support.html"]) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(html, /name="theme-color" content="#f3e6d8"/);
  }
  const admin = await readFile(new URL("../admin.css", import.meta.url), "utf8");
  assert.match(admin, /--bg: #f3e6d8/);
  assert.match(admin, /--side: #5e6f4f/);
  assert.match(admin, /--brown: #5e6f4f/);
});

test("navigation uses selected trim and menu triggers retain parchment borders", async () => {
  assert.match(css, /body :is\(button, summary, \[role="button"\]\):where\(:not\([^}]+\)\)\s*\{\s*border: 1px solid transparent !important/);
  assert.match(css, /:is\(\.active, \.is-on-shelf, \[aria-pressed="true"\], \[aria-selected="true"\], \[aria-expanded="true"\], \[aria-current="page"\]\),\s*body details\[open\] > summary,\s*\.account-navigation a\[aria-current="page"\]\s*\{\s*border: 1px solid var\(--parchment\) !important/);
  assert.match(css, /\.sidebar \.nav-pill\.active\s*\{[^}]*box-shadow: none/);
  assert.match(css, /\.sidebar \.shelf-item\.active\s*\{[^}]*box-shadow: none/);
  const admin = await readFile(new URL("../admin.css", import.meta.url), "utf8");
  assert.match(admin, /body :is\(button, summary, \.btn\) \{ border: 1px solid transparent !important/);
  assert.match(admin, /body details\[open\] > summary \{ border-color: #e5d4ae !important/);
});

test("three-dot buttons and the pictured language, account, and book controls keep thin trim", () => {
  const rule = css.slice(css.indexOf("body :is(.card-menu, .card-action"));
  const controls = rule.slice(0, rule.indexOf("\n}"));
  for (const selector of [
    ".card-menu", ".card-action", ".edition-language-trigger", ".book-more-menu",
    ".book-shelf-menu", ".book-status-menu", ".book-profile-actions > .secondary-btn",
    ".book-continue-reading", ".edition-picker-button", ".account-menu > summary",
  ]) assert(controls.includes(selector), `${selector} must have persistent trim`);
  assert.match(controls, /border: 1px solid var\(--parchment\) !important/);
  assert.match(controls, /box-shadow: inset 0 0 0 2px var\(--botanical-ink\), inset 0 0 0 3px var\(--parchment\)/);
  assert.doesNotMatch(controls, /\.nav-pill|\.shelf-item/);
  assert.match(css, /\.account-avatar\s*\{\s*border: 1px solid var\(--parchment\)/);
});
