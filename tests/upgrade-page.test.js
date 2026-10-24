import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { subscriptionTiming, subscriptionTimingMessage } from "../lib/billing-status.js";

class Element {
  children = [];
  hidden = false;
  disabled = false;
  textContent = "";
  isConnected = true;
  events = {};
  classList = { add() {}, toggle() {} };
  append(...elements) { this.children.push(...elements); }
  prepend(...elements) { this.children.unshift(...elements); }
  setAttribute() {}
  addEventListener(name, handler) { this.events[name] = handler; }
  contains(element) { return this.children.some((child) => child === element || child.contains?.(element)); }
}

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const upgradeFunction = source.slice(source.indexOf("function showUpgradePage()"), source.indexOf("\nfunction showPurchasePage("));

test("upgrade page displays canceled countdown and resume action, then resubscribe after expiry", async () => {
  for (const ended of [false, true]) {
    const page = new Element();
    const elements = [];
    const status = {
      canManage: true, hasSubscription: !ended, cancelAtPeriodEnd: !ended,
      status: ended ? "canceled" : "active", periodEnd: new Date(Date.now() + 365 * 86400000).toISOString(),
    };
    // Start with a stale Lite Reader profile, as happens while account data is loading.
    const state = {
      profile: { tier: "lite_reader" }, session: { user: { id: "reader" } },
      supabase: { from: () => ({ select: () => ({ eq: () => ({
        single: async () => ({ data: { tier: ended ? "lite_reader" : "book_lover" } }),
      }) }) }) },
    };
    let resumeClicked = false;
    const context = {
      state, URLSearchParams, console, subscriptionTiming, subscriptionTimingMessage,
      window: { location: { hash: "#/upgrade" } },
      document: { createElement() { const element = new Element(); elements.push(element); return element; } },
      UPGRADE_PRICES: { monthly: 2.99, annual: 24.99 },
      LITE_READER_FEATURES: [], BOOK_LOVER_FEATURES: [],
      getAccountTier: () => ({ premium: state.profile.tier === "book_lover" }),
      updateActiveNavigation() {}, updateAuthButton() {}, navigateTo() {}, showToast() {}, openAuthModal() {},
      showPage: () => page, createUpgradeFeatureList: () => new Element(),
      formatCurrency: (value) => `$${value}`, formatDate: (value) => value,
      billingRequest: async () => status, openBilling() {}, refreshSubscriptionReminder() {},
      resumeBilling: (button, current) => { resumeClicked = current === status; },
    };
    runInNewContext(`${upgradeFunction}\nshowUpgradePage();`, context);
    await new Promise((resolve) => setImmediate(resolve));
    const resume = elements.find((element) => element.textContent === "Resume renewal");
    const panel = elements.find((element) => element.className === "upgrade-billing-panel");
    const message = elements.find((element) => element.className === "upgrade-billing-status");
    const cta = elements.find((element) => element.className === "upgrade-cta");
    assert.equal(panel.hidden, false);
    assert.equal(resume.hidden, ended);
    if (ended) {
      assert.equal(cta.textContent, "Resubscribe to Book Lover");
      assert.equal(cta.disabled, false);
    } else {
      assert.match(message.textContent, /365 days left/);
      assert.equal(cta.disabled, true);
      resume.events.click();
      assert.equal(resumeClicked, true);
    }
  }
});
