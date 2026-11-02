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
  "logo-cream": "#f2c88f",
  "logo-bronze": "#735032",
  "accent-plum": "#644453",
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
    ["logo-cream", "botanical-green"],
    ["logo-cream", "sage-ink"],
    ["logo-bronze", "warm-sand"],
    ["logo-bronze", "cream"],
    ["logo-cream", "logo-bronze"],
    ["logo-cream", "accent-plum"],
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
  assert.match(menus, /background: var\(--menu-surface, var\(--logo-bronze\)\);[\s\S]*color: var\(--parchment\)/);
  const buttons = theme.slice(theme.indexOf("\n.action-btn,"), theme.indexOf("\n.action-btn:hover"));
  for (const selector of [".reading-continue-btn", ".secondary-btn", ".edition-picker-button", ".cc-btn", ".upgrade-cta"]) {
    assert(buttons.includes(selector), `${selector} must share the button palette`);
  }
  assert.match(buttons, /--deep-sage: var\(--botanical-green\)/);
  assert.match(buttons, /background: var\(--deep-sage\);[\s\S]*color: var\(--logo-cream\)/);
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

test("popup menus reuse botanical artwork for texture and an inset parchment frame", () => {
  const theme = css.slice(css.indexOf("/* Shared palette"));
  const menus = theme.slice(theme.indexOf(".account-menu-panel,"), theme.indexOf("\n.book-actions-header"));
  assert.match(menus, /background-image:[\s\S]*linear-gradient\([\s\S]*Elegant%20Botanical%20Green%20Bookmark\.png/);
  assert.match(menus, /background-size: 100% 100%, 240% auto/);
  assert.match(menus, /inset 0 0 0 5px var\(--parchment\)/);
  assert.match(menus, /font-family: Georgia, "Times New Roman", serif/);
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

test("hero banner has matching outer and inset parchment trim without blocking interactions", () => {
  assert.match(css, /\.home-hero\s*\{\s*border: 1px solid var\(--parchment\)/);
  assert.match(css, /\.home-hero::before\s*\{[^}]*position: absolute;[^}]*inset: 5px;[^}]*border: 1px solid var\(--parchment\);[^}]*border-radius:[^}]*pointer-events: none/);
});

test("three-dot buttons and the pictured language, account, and book controls keep thin trim", () => {
  const rule = css.slice(css.indexOf("body :is(.card-menu, .card-action"));
  const controls = rule.slice(0, rule.indexOf("\n}"));
  for (const selector of [
    ".card-menu", ".card-action", ".edition-language-trigger", ".book-more-menu",
    ".book-shelf-menu", ".book-status-menu", ".book-profile-actions > .secondary-btn",
    ".book-continue-reading", ".reading-continue-btn", ".edition-picker-button", ".account-menu > summary",
    ".action-btn", ".secondary-btn", ".google-auth-btn", ".cc-btn",
    ".upgrade-cta:not(.is-current)", ".search-empty-back", ".audiobook-sample-button", ".book-audiobook-find",
  ]) assert(controls.includes(selector), `${selector} must have persistent trim`);
  assert.match(controls, /border: 1px solid var\(--parchment\) !important/);
  assert.match(controls, /box-shadow: none !important/);
  assert.doesNotMatch(controls, /\.nav-pill|\.shelf-item/);
  assert.match(css, /\.account-avatar\s*\{\s*border: 1px solid var\(--parchment\)/);
});

test("admin action buttons share the parchment inset trim", async () => {
  const admin = await readFile(new URL("../admin.css", import.meta.url), "utf8");
  assert.match(admin, /body \.btn\s*\{[^}]*border: 1px solid #e5d4ae !important;[^}]*box-shadow: inset 0 0 0 2px #303b29, inset 0 0 0 3px #e5d4ae/);
});

test("shared controls swap olive and bronze on interaction rather than striping options", () => {
  const alternation = css.slice(css.indexOf("/* Keep shared controls consistent"));
  assert.match(alternation, /--control-surface: var\(--botanical-green\)/);
  assert.match(alternation, /background-color: var\(--control-surface\) !important/);
  assert.match(alternation, /\.ownership-status-menu > summary/);
  assert.match(alternation, /--control-interaction: var\(--logo-bronze\)/);
  assert.match(alternation, /--control-surface: var\(--logo-bronze\);[^}]*--control-interaction: var\(--botanical-green\)/);
  assert.match(alternation, /background-color: var\(--control-interaction, var\(--logo-bronze\)\) !important/);
  assert.doesNotMatch(alternation, /nth-child|rgba\(115, 80, 50, 0\.65\)/);
  assert.match(alternation, /\.book-actions-list \.book-status-menu > summary\s*\{[^}]*background-color: transparent !important/);
});

test("dropdown surfaces follow their trigger color even when portaled to the body", async () => {
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /getComputedStyle\(summary\)[\s\S]*getPropertyValue\("--control-interaction"\)[\s\S]*panel\.style\.setProperty\("--menu-surface", menuSurface\)[\s\S]*document\.body\.append\(panel\)/);
  assert.match(css, /\.ownership-status-menu,\s*\.book-shelf-menu:has\(> \.secondary-btn\)\s*\{\s*--menu-surface: var\(--botanical-green\)/);
  assert.match(css, /color-mix\(in srgb, var\(--menu-surface, var\(--logo-bronze\)\) 85%, transparent\)/);
});

test("home rows share a background and use alternating ornamental dividers", async () => {
  const rows = css.slice(css.lastIndexOf("\n.card-row-section {"));
  assert.match(rows, /background: transparent/);
  assert.match(rows, /padding-bottom: 2rem/);
  assert.doesNotMatch(rows, /background: linear-gradient|rgba\(232, 195, 174/);
  assert.match(rows, /::before\s*\{[^}]*right: 0[^}]*left: 0[^}]*height: clamp\(12px, 2\.2vw, 28px\)[^}]*background: url\("\/assets\/divider-botanical-1.png"\) center \/ 100% 100% no-repeat[^}]*pointer-events: none/);
  for (let index = 2; index <= 6; index += 1) {
    const selector = index === 6 ? "6n" : `6n + ${index}`;
    const rule = rows.slice(rows.indexOf(`.card-row-section:nth-of-type(${selector})::before`)).split("}")[0];
    assert(rule.includes(`background-image: url("/assets/divider-botanical-${index}.png")`));
  }
  assert.doesNotMatch(rows, /::after|mask:|filter:|divider-collection-|\.svg|repeat-x/);
  const sw = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(sw, /Array\.from\(\{ length: 6 \},[^;]*divider-botanical-/);
  for (let index = 1; index <= 6; index += 1) {
    const png = await readFile(new URL(`../assets/divider-botanical-${index}.png`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), 2172);
  }
});

test("account menu has botanical links and contains long account names", () => {
  assert.match(css, /\.account-menu > summary\s*\{[^}]*max-width: min\(15rem, 24vw\)/);
  assert.match(css, /\.account-menu \.account-menu-label\s*\{[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap/);
  assert.match(css, /\.account-menu-panel \.account-menu-link\s*\{[^}]*background: rgba\(48, 59, 41, 0\.65\);[^}]*border: 1px solid var\(--parchment\)/);
});

test("book action sheet uses a single frame, roomy spacing and unframed inline suboptions", () => {
  assert.match(css, /\.book-actions-list\s*\{\s*padding: 0\.75rem 1rem 1rem;\s*gap: 0\.25rem/);
  assert.match(css, /\.book-actions-sheet\s*\{\s*box-shadow: 0 12px 30px rgba\(30, 38, 25, 0\.28\)/);
  assert.match(css, /\.book-actions-list \.book-status-menu-panel\s*\{\s*margin: 0\.25rem 0 0\.5rem;[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none/);
  assert.match(css, /body \.book-actions-list \.book-status-menu > summary\s*\{[^}]*border: 1px solid transparent !important;[^}]*box-shadow: none !important/);
  assert.match(css, /body \.book-actions-list \.book-status-menu\[open\] > summary\s*\{[^}]*border-color: var\(--parchment\) !important/);
});

test("three-dot controls use centered geometry rather than font baselines", () => {
  assert.match(css, /\.card-menu,\s*\.book-more-menu > summary\s*\{\s*font-size: 0;\s*line-height: 0/);
  assert.match(css, /\.card-menu::before,\s*\.book-more-menu > summary::before\s*\{[^}]*width: 14px;[^}]*height: 4px;[^}]*radial-gradient[^}]*background-repeat: no-repeat/);
});

test("logo-inspired typography uses warm gold on green and readable bronze on light surfaces", () => {
  assert.match(css, /--brand-font: Georgia, "Times New Roman", serif/);
  assert.match(css, /body\s*\{[^}]*font-family: var\(--brand-font\)/);
  assert.match(css, /\.home-hero\s*\{[^}]*color: var\(--logo-cream\)/);
  assert.match(css, /\.home-hero h1\s*\{[^}]*font-family: var\(--brand-font\);[^}]*font-weight: 700/);
  assert.match(css, /\.home-hero p,\s*\.home-hero \.action-btn\s*\{[^}]*color: var\(--logo-cream\)/);
});

test("language label wraps rather than truncating and English cursive is self-hosted", async () => {
  const span = css.match(/\.global-search \.edition-language-trigger span\s*\{([^}]+)\}/)[1];
  assert.match(span, /white-space: normal/);
  assert.doesNotMatch(span, /ellipsis|overflow: hidden/);
  assert.match(css, /\.home-hero\.hero-english h1\s*\{[^}]*font-family: "Librito Script", cursive/);
  assert.match(css, /@font-face\s*\{[^}]*DancingScript\.ttf/);
  const worker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /"\/assets\/DancingScript\.ttf"/);
  const license = await readFile(new URL("../assets/DancingScript-OFL.txt", import.meta.url), "utf8");
  assert.match(license, /SIL OPEN FONT LICENSE/);
});
