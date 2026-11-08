import type { AppSubscriptionStatus } from "../../lib/subscription-status";

export const subscriptionStatusMap = {
	active: "active",
	trialing: "trialing",
	incomplete: "incomplete",
	past_due: "past_due",
	unpaid: "unpaid",
	paused: "paused",
	canceled: "canceled",
	incomplete_expired: "expired",
} as const satisfies Record<string, AppSubscriptionStatus>;
