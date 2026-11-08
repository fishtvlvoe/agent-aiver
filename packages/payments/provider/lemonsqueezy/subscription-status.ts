import type { AppSubscriptionStatus } from "../../lib/subscription-status";

export const subscriptionStatusMap = {
	active: "active",
	on_trial: "trialing",
	cancelled: "canceling",
	past_due: "past_due",
	unpaid: "unpaid",
	paused: "paused",
	expired: "expired",
} as const satisfies Record<string, AppSubscriptionStatus>;
