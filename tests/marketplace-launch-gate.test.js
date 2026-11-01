import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const routeFunction = source.slice(
  source.indexOf("function showMarketplacePage("),
  source.indexOf("\nfunction updateActiveNavigation("),
);

function createContext(admin, signedIn = true) {
  const page = {
    children: [],
    classList: { add() {} },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
  };
  const state = {
    view: "home",
    supabase: signedIn ? { rpc: async () => ({ data: admin, error: null }) } : null,
    session: signedIn ? { user: { id: "reader" } } : null,
    profile: { tier: "free" },
  };
  const rendered = [];
  const context = {
    state,
    URLSearchParams,
    document: { createElement: () => ({ className: "", textContent: "" }) },
    updateActiveNavigation() {},
    showPage(route) { state.view = route; return page; },
    createPageHeader(title, description) { return { title, description }; },
    renderMarketplacePage(options) { rendered.push(options); },
    navigateTo() {},
    openAuthModal() {},
    showToast() {},
    console: { error() {} },
  };
  return { context, page, rendered, state };
}

test("direct marketplace routes show coming soon to signed-out and non-admin users", async () => {
  for (const contextArgs of [[false, false], [false, true]]) {
    const { context, page, rendered } = createContext(...contextArgs);
    await runInNewContext(`${routeFunction}\nshowMarketplacePage("marketplace");`, context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(rendered.length, 0);
    assert.equal(page.children[0].title, "Marketplace coming soon");
  }
});

test("verified admins can still open the marketplace directly", async () => {
  const { context, rendered, state } = createContext(true);
  await runInNewContext(`${routeFunction}\nshowMarketplacePage("marketplace");`, context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(rendered.length, 1);
  assert.equal(state.marketplaceAdmin, true);
});
