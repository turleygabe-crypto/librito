const DAY_MS = 24 * 60 * 60 * 1000;

export function subscriptionTiming(status, now = Date.now()) {
  if (!status?.hasSubscription || !["active", "trialing", "past_due"].includes(status.status)) return null;
  const end = Date.parse(status.periodEnd);
  if (!Number.isFinite(end) || end <= now) return null;
  const days = Math.ceil((end - now) / DAY_MS);
  return {
    days,
    canceled: status.cancelAtPeriodEnd,
    milestone: days <= 1 ? 1 : days <= 7 ? 7 : days <= 30 ? 30 : null,
  };
}

export function subscriptionTimingMessage(status, now = Date.now()) {
  const timing = subscriptionTiming(status, now);
  if (!timing) return "";
  const date = new Date(status.periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const duration = `${timing.days} ${timing.days === 1 ? "day" : "days"}`;
  if (timing.canceled) {
    return `You have ${duration} left on your canceled Book Lover plan. Access ends on ${date}. You won't be charged again unless you choose to renew your subscription.`;
  }
  if (status.status === "past_due") return "Your payment needs attention. Update your payment method in Manage billing.";
  return `Your Book Lover ${status.status === "trialing" ? "trial ends" : "plan renews"} in ${duration}, on ${date}. Review your subscription in Manage billing.`;
}
