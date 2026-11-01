import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { subscriptionTiming, subscriptionTimingMessage } from "../lib/billing-status.js";
import { normalizePlan } from "../lib/entitlements.js";
import { MEMBERSHIP_PRICING } from "../lib/membership-pricing.js";

class Element {
  children = [];
  hidden = false;
  disabled = false;
  textContent = "";
  isConnected = true;
  events = {};
  attributes = {};
  classList = { add() {}, toggle() {} };
  append(...elements) { this.children.push(...elements); }
  prepend(...elements) { this.children.unshift(...elements); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.events[name] = handler; }
  contains(element) { return this.children.some((child) => child === element || child.contains?.(element)); }
}

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const upgradeFunction = source.slice(source.indexOf("function showUpgradePage()"), source.indexOf("\nfunction showPurchasePage("));

test("membership page renders all tiers and directs active subscribers to the existing billing portal", async () => {
  for (const mode of ["canceled", "ended", "active", "complimentary", "lite", "signed-out", "billing-error", "plans-open"]) {
    const ended = mode === "ended";
    const complimentary = mode === "complimentary";
    const paid = ["canceled", "active"].includes(mode);
    const plan = paid || mode === "complimentary" ? "book_lover" : "free";
    const page = new Element();
    const elements = [];
    const status = {
      canManage: paid || ended, hasSubscription: paid, cancelAtPeriodEnd: mode === "canceled",
      status: ended ? "canceled" : paid ? "active" : null, plan,
      membershipPlansAvailable: mode === "plans-open",
      periodEnd: new Date(Date.now() + 365 * 86400000).toISOString(),
    };
    // Start with a stale Lite Reader profile, as happens while account data is loading.
    const state = {
      profile: { tier: "lite_reader" }, session: mode === "signed-out" ? null : { user: { id: "reader" } },
      supabase: { from: () => ({ select: () => ({ eq: () => ({
        single: async () => ({ data: { tier: plan, complimentary_book_lover: complimentary, complimentary_bookshop_pro: false } }),
      }) }) }) },
    };
    let resumeClicked = false;
    let cancelClicked = false;
    const billingActions = [];
    const context = {
      state, URLSearchParams, console: { error() {} }, subscriptionTiming, subscriptionTimingMessage,
      normalizePlan, MEMBERSHIP_PRICING,
      window: { location: { hash: "#/upgrade" } },
      document: { createElement() { const element = new Element(); elements.push(element); return element; } },
      LITE_READER_FEATURES: [], BOOK_LOVER_FEATURES: [], BOOKSHOP_PRO_FEATURES: [],
      getAccountTier: () => ({ premium: normalizePlan(state.profile.tier) !== "free" }),
      updateActiveNavigation() {}, updateAuthButton() {}, navigateTo() {}, showToast() {}, openAuthModal() {},
      showPage: () => page, createUpgradeFeatureList: () => new Element(),
      formatCurrency: (value) => `$${value}`, formatDate: (value) => value,
      billingRequest: async () => {
        if (mode === "billing-error") throw new Error("Billing is not configured yet.");
        return status;
      },
      openBilling: (_button, body) => billingActions.push(body), refreshSubscriptionReminder() {},
      showBookLoverWelcome() {},
      resumeBilling: (button, current) => { resumeClicked = current === status; },
      cancelBilling: (button, current) => { cancelClicked = current === status; },
    };
    await runInNewContext(`${upgradeFunction}\n(async () => showUpgradePage())()`, context);
    const paidCtas = elements.filter((element) => element.className === "upgrade-cta"
      && typeof element.events.click === "function");
    const cta = paidCtas[0];
    const proCta = paidCtas[1];
    assert.ok(cta);
    assert.ok(proCta);
    assert.equal(elements.some((element) => element.textContent === "Free"), true);
    assert.equal(elements.some((element) => element.textContent === "Bookshop Pro"), true);
    assert.equal(elements.some((element) => element.textContent === "Coming soon" && !element.hidden), mode !== "plans-open");
    const resume = elements.find((element) => element.textContent === "Renew subscription");
    const panel = elements.find((element) => element.className === "upgrade-billing-panel");
    const message = elements.find((element) => element.className === "upgrade-billing-status");
    assert.equal(cta.disabled, mode !== "plans-open");
    assert.equal(panel.hidden, ["lite", "signed-out", "plans-open"].includes(mode));
    const visibility = elements.find((element) => element.className === "secondary-btn upgrade-plan-visibility");
    const options = elements.find((element) => element.id === "membershipPlanOptions");
    assert.equal(visibility.attributes["aria-controls"], options.id);
    visibility.events.click();
    assert.equal(options.hidden, true);
    assert.equal(visibility.textContent, "Show plans");
    assert.equal(visibility.attributes["aria-expanded"], "false");
    assert.equal(panel.hidden, ["lite", "signed-out", "plans-open"].includes(mode));
    visibility.events.click();
    assert.equal(options.hidden, false);
    assert.equal(visibility.textContent, "Hide plans");
    assert.equal(visibility.attributes["aria-expanded"], "true");
    assert.equal(resume.hidden, mode !== "canceled");
    const cancel = elements.find((element) => element.textContent === "Cancel subscription");
    assert.equal(cancel.hidden, mode !== "active");
    if (mode === "canceled") {
      assert.match(message.textContent, /365 days left on your canceled Book Lover plan/);
      assert.equal(cta.disabled, true);
      resume.events.click();
      assert.equal(resumeClicked, true);
    } else if (mode === "active") {
      cancel.events.click();
      assert.equal(cancelClicked, true);
    } else if (complimentary) {
      assert.match(message.textContent, /complimentary/);
      assert.equal(cta.textContent, "Your complimentary plan");
    } else if (mode === "billing-error") {
      assert.match(message.textContent, /couldn't load/);
    }
    cta.events.click();
    proCta.events.click();
    if (mode === "plans-open") {
      assert.equal(JSON.stringify(billingActions), JSON.stringify([
        { action: "checkout", plan: "book_lover", billing: "monthly" },
        { action: "checkout", plan: "bookshop_pro", billing: "monthly" },
      ]));
    } else assert.deepEqual(billingActions, []);
    const manage = elements.find((element) => element.textContent === "Manage billing");
    if (paid || ended) {
      manage.events.click();
      assert.equal(JSON.stringify(billingActions.at(-1)), JSON.stringify({ action: "portal" }));
    }
  }
});
