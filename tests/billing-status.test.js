import assert from "node:assert/strict";
import { test } from "node:test";
import { subscriptionTiming, subscriptionTimingMessage } from "../lib/billing-status.js";

const now = Date.parse("2026-10-24T12:00:00Z");
const day = 86400000;
function status(days, canceled = true) {
  return { hasSubscription: true, status: "active", cancelAtPeriodEnd: canceled, periodEnd: new Date(now + days * day).toISOString() };
}

test("reminders use exact 30-, 7- and 1-day thresholds, rounding partial days up", () => {
  for (const [days, remaining, milestone] of [
    [365, 365, null], [30.001, 31, null], [30, 30, 30], [7.001, 8, 30],
    [7, 7, 7], [1.001, 2, 7], [1, 1, 1], [0.01, 1, 1],
  ]) {
    assert.deepEqual(subscriptionTiming(status(days), now), { days: remaining, canceled: true, milestone });
    assert.equal(subscriptionTiming(status(days, false), now).milestone, milestone);
  }
});

test("ended, invalid and non-entitled subscriptions have no countdown or reminders", () => {
  for (const value of [
    null, status(0), status(-1), { ...status(30), periodEnd: null },
    { ...status(30), periodEnd: "invalid" }, { ...status(30), hasSubscription: false },
    ...["canceled", "unpaid", "incomplete", "paused"].map((state) => ({ ...status(30), status: state })),
  ]) {
    assert.equal(subscriptionTiming(value, now), null);
    assert.equal(subscriptionTimingMessage(value, now), "");
  }
});

test("messages distinguish canceled access, automatic renewal, trials and failed payments", () => {
  assert.match(subscriptionTimingMessage(status(1), now), /1 day left.*won't be charged again/);
  assert.match(subscriptionTimingMessage(status(7), now), /7 days left/);
  assert.match(subscriptionTimingMessage(status(30, false), now), /plan renews in 30 days/);
  assert.match(subscriptionTimingMessage({ ...status(7, false), status: "trialing" }, now), /trial ends in 7 days/);
  assert.match(subscriptionTimingMessage({ ...status(1, false), status: "past_due" }, now), /payment needs attention/);
});
