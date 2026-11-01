import assert from "node:assert/strict";
import { test } from "node:test";
import { effectivePlan, hasEntitlement, normalizePlan } from "../lib/entitlements.js";
import {
  calculateActualSellerProceeds,
  calculateCommissionCents,
  calculateEstimatedSellerProceeds,
} from "../lib/marketplace-money.js";

test("Free, Book Lover, and Bookshop Pro entitlements are cumulative", () => {
  assert.equal(hasEntitlement("free", "marketplace.sell_personal"), true);
  assert.equal(hasEntitlement("free", "library.reports.advanced"), false);
  assert.equal(hasEntitlement("book_lover", "library.reports.advanced"), true);
  assert.equal(hasEntitlement("book_lover", "business.inventory"), false);
  assert.equal(hasEntitlement("bookshop_pro", "library.reports.advanced"), true);
  assert.equal(hasEntitlement("bookshop_pro", "business.inventory"), true);
  assert.equal(normalizePlan("lite_reader"), "free");
});

test("expired subscriptions retain only the appropriate plan grants", () => {
  assert.equal(effectivePlan({ subscriptionPlan: "bookshop_pro", hasAccess: false }), "free");
  assert.equal(effectivePlan({ subscriptionPlan: "bookshop_pro", hasAccess: true }), "bookshop_pro");
  assert.equal(effectivePlan({ hasAccess: false, complimentaryBookLover: true }), "book_lover");
  assert.equal(effectivePlan({ hasAccess: false, complimentaryBookshopPro: true }), "bookshop_pro");
  assert.equal(effectivePlan({
    subscriptionPlan: "bookshop_pro", hasAccess: true, complimentaryBookLover: true,
  }), "bookshop_pro");
});

test("commission is rounded in cents on book price only", () => {
  assert.equal(calculateCommissionCents(2200, 500), 110);
  assert.equal(calculateCommissionCents(10, 500), 1);
});

test("seller proceeds deduct estimated or actual processing from item plus shipping", () => {
  const estimate = calculateEstimatedSellerProceeds({
    bookPriceCents: 2200,
    shippingCents: 500,
    taxCents: 300,
    estimatedProcessingFeeCents: 108,
  });
  assert.deepEqual(estimate, {
    bookPriceCents: 2200,
    shippingCents: 500,
    taxCents: 300,
    buyerTotalCents: 3000,
    commissionCents: 110,
    estimatedProcessingFeeCents: 108,
    sellerProceedsCents: 2482,
  });
  const actual = calculateActualSellerProceeds({
    bookPriceCents: 2200,
    shippingCents: 500,
    actualProcessingFeeCents: 117,
  });
  assert.equal(actual.sellerProceedsCents, 2473);
  assert.throws(() => calculateEstimatedSellerProceeds({
    bookPriceCents: 100,
    shippingCents: 0,
    estimatedProcessingFeeCents: 200,
  }), RangeError);
});
