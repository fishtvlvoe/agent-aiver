export const APP_SUBSCRIPTION_STATUSES = [
	"active",
	"trialing",
	"canceling",
	"incomplete",
	"past_due",
	"unpaid",
	"paused",
	"canceled",
	"expired",
] as const;

export type AppSubscriptionStatus = (typeof APP_SUBSCRIPTION_STATUSES)[number];

export type ProviderStatusMap = Record<string, AppSubscriptionStatus>;

const ACCESS_GRANTING_STATUSES = new Set<AppSubscriptionStatus>([
	"active",
	"trialing",
	"canceling",
]);

const APP_SUBSCRIPTION_STATUS_SET = new Set<string>(APP_SUBSCRIPTION_STATUSES);

const LEGACY_STATUS_TO_APP: Record<string, AppSubscriptionStatus> = {
	incomplete_expired: "expired",
	on_trial: "trialing",
	scheduled_cancel: "canceling",
	pending: "incomplete",
	on_hold: "past_due",
	failed: "expired",
	// Leftover `cancelled` strings fail closed. Lemon Squeezy now writes `canceling`.
	cancelled: "canceled",
};

export function parseProviderTimestamp(value: unknown): Date | null {
	if (value == null || value === "") {
		return null;
	}

	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? null : value;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
		const date = new Date(milliseconds);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) {
			return null;
		}

		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			return parseProviderTimestamp(Number(trimmed));
		}

		const date = new Date(trimmed);
		return Number.isNaN(date.getTime()) ? null : date;
	}

	return null;
}

export function isAppSubscriptionStatus(
	status: string | null | undefined,
): status is AppSubscriptionStatus {
	return !!status && APP_SUBSCRIPTION_STATUS_SET.has(status);
}

export function planStatusGrantsAccess(status: string | null | undefined): boolean {
	return isAppSubscriptionStatus(status) && ACCESS_GRANTING_STATUSES.has(status);
}

export function normalizeSubscriptionStatus(
	providerStatusMap: ProviderStatusMap,
	providerStatus: string | null | undefined,
	options?: {
		cancelAtPeriodEnd?: boolean;
		trialEndsAt?: Date | null;
		now?: Date;
	},
): AppSubscriptionStatus {
	const now = options?.now ?? new Date();
	const mappedStatus = providerStatus
		? (providerStatusMap[providerStatus] ??
			(isAppSubscriptionStatus(providerStatus) ? providerStatus : undefined))
		: undefined;

	let appStatus: AppSubscriptionStatus = mappedStatus ?? "expired";

	if (appStatus === "active" && options?.cancelAtPeriodEnd) {
		appStatus = "canceling";
	}

	if (
		(appStatus === "active" || appStatus === "trialing") &&
		options?.trialEndsAt &&
		options.trialEndsAt.getTime() > now.getTime()
	) {
		return "trialing";
	}

	if (
		appStatus === "trialing" &&
		options?.trialEndsAt &&
		options.trialEndsAt.getTime() <= now.getTime()
	) {
		return "active";
	}

	return appStatus;
}

export function resolveStoredSubscriptionStatus(
	storedStatus: string | null | undefined,
	options?: {
		trialEndsAt?: Date | null;
		now?: Date;
	},
): AppSubscriptionStatus {
	const now = options?.now ?? new Date();
	const mappedStatus = storedStatus
		? isAppSubscriptionStatus(storedStatus)
			? storedStatus
			: LEGACY_STATUS_TO_APP[storedStatus]
		: undefined;

	let appStatus: AppSubscriptionStatus = mappedStatus ?? "expired";

	if (
		(appStatus === "active" || appStatus === "trialing") &&
		options?.trialEndsAt &&
		options.trialEndsAt.getTime() > now.getTime()
	) {
		return "trialing";
	}

	if (
		appStatus === "trialing" &&
		options?.trialEndsAt &&
		options.trialEndsAt.getTime() <= now.getTime()
	) {
		return "active";
	}

	return appStatus;
}

export function toPersistedSubscriptionFields(
	providerStatusMap: ProviderStatusMap,
	fields: {
		status?: string | null;
		cancelAtPeriodEnd?: boolean;
		trialEndsAt?: unknown;
		now?: Date;
	},
): {
	status: AppSubscriptionStatus;
	trialEndsAt: Date | null;
} {
	const trialEndsAt = parseProviderTimestamp(fields.trialEndsAt);

	return {
		status: normalizeSubscriptionStatus(providerStatusMap, fields.status, {
			cancelAtPeriodEnd: fields.cancelAtPeriodEnd,
			trialEndsAt,
			now: fields.now,
		}),
		trialEndsAt,
	};
}

export function isSubscriptionBillingPath(pathname: string): boolean {
	const normalizedPath = pathname.split(/[?#]/, 1)[0] ?? "";
	return /(?:^|\/)settings\/(?:account\/)?billing\/?$/.test(normalizedPath);
}

export function getSubscriptionPaywallRedirectPath({
	hasAccess,
	hasVisiblePlan,
	billingPath,
}: {
	hasAccess: boolean;
	hasVisiblePlan: boolean;
	billingPath: string;
}): string | null {
	if (hasAccess) {
		return null;
	}

	return hasVisiblePlan ? billingPath : "/choose-plan";
}
