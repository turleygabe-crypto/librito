export const PLAN_ENTITLEMENTS = Object.freeze({
  free: Object.freeze([
    "library.personal",
    "reading.track",
    "marketplace.buy",
    "marketplace.sell_personal",
    "marketplace.message",
    "marketplace.save_listings",
    "marketplace.orders",
    "library.reports.basic",
    "library.insights.basic",
  ]),
  book_lover: Object.freeze([
    "library.personal",
    "reading.track",
    "marketplace.buy",
    "marketplace.sell_personal",
    "marketplace.message",
    "marketplace.save_listings",
    "marketplace.orders",
    "library.reports.basic",
    "library.insights.basic",
    "library.reports.advanced",
    "library.insights.advanced",
    "library.organization.advanced",
    "library.value_tracking",
    "reading.multiple_active",
  ]),
  bookshop_pro: Object.freeze([
    "library.personal",
    "reading.track",
    "marketplace.buy",
    "marketplace.sell_personal",
    "marketplace.message",
    "marketplace.save_listings",
    "marketplace.orders",
    "library.reports.basic",
    "library.insights.basic",
    "library.reports.advanced",
    "library.insights.advanced",
    "library.organization.advanced",
    "library.value_tracking",
    "reading.multiple_active",
    "business.storefront",
    "business.inventory",
    "business.bulk_listings",
    "business.analytics",
    "business.csv_inventory",
    "business.priority_support",
  ]),
});

export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({ maxBooks: Infinity, maxShelves: Infinity, maxReading: 5 }),
  book_lover: Object.freeze({ maxBooks: Infinity, maxShelves: Infinity, maxReading: Infinity }),
  bookshop_pro: Object.freeze({ maxBooks: Infinity, maxShelves: Infinity, maxReading: Infinity }),
});

export function normalizePlan(plan) {
  if (plan === "lite_reader") return "free";
  return Object.hasOwn(PLAN_ENTITLEMENTS, plan) ? plan : "free";
}

export function hasEntitlement(plan, entitlement) {
  return PLAN_ENTITLEMENTS[normalizePlan(plan)].includes(entitlement);
}

export function isPaidPlan(plan) {
  return normalizePlan(plan) !== "free";
}

export function effectivePlan({
  subscriptionPlan,
  hasAccess,
  complimentaryBookLover = false,
  complimentaryBookshopPro = false,
}) {
  if (complimentaryBookshopPro) return "bookshop_pro";
  if (hasAccess) return normalizePlan(subscriptionPlan || "book_lover");
  if (complimentaryBookLover) return "book_lover";
  return "free";
}
