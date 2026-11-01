import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { test } from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("public support pages have working local links, branded contact details, and accurate billing/deletion guidance", async () => {
  for (const page of ["contact.html", "billing-support.html"]) {
    const html = await read(page);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<h1>/);
    assert.match(html, /mailto:support@librito\.casa/);
    assert.doesNotMatch(html, /href="#"|Barnes|LLC|\/terms|\/privacy/);
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (!href.startsWith("/")) continue;
      const path = href.split("#")[0].split("?")[0];
      await access(new URL(`..${path === "/" ? "/index.html" : path}`, import.meta.url));
    }
  }
  const contact = await read("contact.html");
  assert.match(contact, /passwords, sign-in codes, full card numbers/);
  assert.match(contact, /Delete account/);
  const billing = await read("billing-support.html");
  assert.match(billing, /Marketplace buying and selling will not require a paid subscription when it opens/);
  assert.match(billing, /New paid-plan enrollment and public marketplace access are coming soon/);
  assert.doesNotMatch(billing, /\$2\.99|\$24\.99|use <strong>Resubscribe/);
  assert.match(billing, /paid period/);
  assert.match(billing, /do not routinely refund/);
  assert.match(billing, /rights required by applicable law/);
  assert.match(billing, /cancels your subscription immediately/);
});

test("support is reachable from the account menu, footer, sign-in and upgrade page; legal drafts are not published", async () => {
  const index = await read("index.html");
  assert.match(index, /<footer class="site-footer"/);
  const menu = index.slice(index.indexOf('<div class="account-menu-panel">'), index.indexOf("</details>"));
  assert.equal([...menu.matchAll(/<a /g)].length, 3);
  assert.match(menu, />My account<\/a>/);
  assert.match(menu, />Membership plans<\/a>/);
  assert.match(menu, /href="\/admin.html" data-admin-link hidden>Admin dashboard<\/a>/);
  assert.doesNotMatch(menu, /Delete account|Account settings|Billing support/);
  assert.match(index, /Need help with your account\?.*href="\/contact.html"/);
  assert.match(await read("app.js"), /createAccountLink\("Billing support & refund information", "\/billing-support.html"\)/);
  assert.match(await read(".vercelignore"), /^legal-drafts\/$/m);
  const deployment = JSON.parse(await read("vercel.json"));
  const staticBuilds = deployment.builds.filter((entry) => entry.use === "@vercel/static");
  assert.equal(staticBuilds.some((entry) => entry.src.includes("legal-drafts") || entry.src === "**/*"), false);
  for (const path of ["index.html", "contact.html", "billing-support.html"]) {
    assert.doesNotMatch(await read(path), /legal-drafts|terms\.md|privacy\.md/);
  }
  for (const path of ["legal-drafts/terms.md", "legal-drafts/privacy.md"]) {
    const text = await read(path);
    assert.match(text, /UNPUBLISHED DRAFT/);
    assert.match(text, /Publication blockers/);
    assert.match(text, /13/);
    assert.match(text, /support@librito.casa/);
  }
});

test("Vercel static deployment includes every browser library imported by the app", async () => {
  const deployment = JSON.parse(await read("vercel.json"));
  const staticPatterns = deployment.builds
    .filter((entry) => entry.use === "@vercel/static")
    .map((entry) => entry.src);
  const app = await read("app.js");
  const importedLibraries = [...app.matchAll(/from ["']\.\/lib\/([^"']+\.js)["']/g)]
    .map(([, path]) => path);
  assert.ok(importedLibraries.length > 0);
  for (const library of importedLibraries) {
    assert.ok(
      staticPatterns.some((pattern) => pattern.includes(library.replace(/\.js$/, ""))),
      `Vercel static config must include ${library}`,
    );
  }
});
