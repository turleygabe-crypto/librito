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
  assert.match(billing, /\$2\.99 USD per month/);
  assert.match(billing, /\$24\.99 USD per year/);
  assert.match(billing, /paid period/);
  assert.match(billing, /do not routinely refund/);
  assert.match(billing, /rights required by applicable law/);
  assert.match(billing, /cancels your subscription immediately/);
});

test("support is reachable from the account menu, footer, sign-in and upgrade page; legal drafts are not published", async () => {
  const index = await read("index.html");
  assert.match(index, /<footer class="site-footer"/);
  const menu = index.slice(index.indexOf('<div class="account-menu-panel">'), index.indexOf("</details>"));
  assert.equal([...menu.matchAll(/<a /g)].length, 2);
  assert.match(menu, />My account<\/a>/);
  assert.match(menu, />Book Lover plan<\/a>/);
  assert.doesNotMatch(menu, /Delete account|Account settings|Billing support|Admin dashboard/);
  assert.match(index, /Need help with your account\?.*href="\/contact.html"/);
  assert.match(await read("app.js"), /supportLink.href = "\/billing-support.html"/);
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
