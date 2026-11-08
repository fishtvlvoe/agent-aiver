import type { AppSubscriptionStatus } from "../../lib/subscription-status";

export const subscriptionStatusMap = {
	active: "active",
	pending: "incomplete",
	on_hold: "past_due",
	paused: "paused",
	cancelled: "canceled",
	failed: "expired",
	expired: "expired",
} as const satisfies Record<string, AppSubscriptionStatus>;
