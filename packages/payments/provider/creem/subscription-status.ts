import type { AppSubscriptionStatus } from "../../lib/subscription-status";

export const subscriptionStatusMap = {
	active: "active",
	trialing: "trialing",
	scheduled_cancel: "canceling",
	incomplete: "incomplete",
	past_due: "past_due",
	unpaid: "unpaid",
	paused: "paused",
	canceled: "canceled",
	expired: "expired",
} as const satisfies Record<string, AppSubscriptionStatus>;
