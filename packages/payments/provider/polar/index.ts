import { createPolar, webhooks } from "@polar-sh/sdk/2026-10";
import {
	createPurchase,
	deletePurchaseBySubscriptionId,
	getPurchaseBySubscriptionId,
	updatePurchase,
} from "@repo/database";

import { setCustomerIdToEntity } from "../../lib/customer";
import { getPlanIdByProviderPriceId } from "../../lib/provider-price-ids";
import { toPersistedSubscriptionFields } from "../../lib/subscription-status";
import type {
	CancelSubscription,
	CreateCheckoutLink,
	CreateCustomerPortalLink,
	SetSubscriptionSeats,
	WebhookHandler,
} from "../../types";
import { subscriptionStatusMap } from "./subscription-status";

function persistPolarSubscription(data: {
	status?: string | null;
	cancelAtPeriodEnd?: boolean;
	cancel_at_period_end?: boolean;
	trialEnd?: unknown;
	trial_end?: unknown;
}) {
	return toPersistedSubscriptionFields(subscriptionStatusMap, {
		status: data.status,
		cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? data.cancel_at_period_end,
		trialEndsAt: data.trialEnd ?? data.trial_end,
	});
}

let polarClient: ReturnType<typeof createPolar> | undefined;

function getPolarClient() {
	if (polarClient) {
		return polarClient;
	}

	const polarAccessToken = process.env.POLAR_ACCESS_TOKEN as string;

	if (!polarAccessToken) {
		throw new Error("Missing env variable POLAR_ACCESS_TOKEN");
	}

	polarClient = createPolar({
		accessToken: polarAccessToken,
		environment: process.env.NODE_ENV === "production" ? "production" : "sandbox",
	});

	return polarClient;
}

export const createCheckoutLink: CreateCheckoutLink = async (options) => {
	const polarClient = getPolarClient();

	const { priceId, redirectUrl, customerId, organizationId, userId, trialPeriodDays } = options;

	const metadata: Record<string, string> = {};

	if (organizationId) {
		metadata.organization_id = organizationId;
	}

	if (userId) {
		metadata.user_id = userId;
	}

	const response = await polarClient.checkouts.create({
		products: [priceId],
		success_url: redirectUrl ?? "",
		metadata,
		customer_id: customerId || undefined,
		...(trialPeriodDays
			? {
					trial_interval: "day" as const,
					trial_interval_count: trialPeriodDays,
				}
			: {}),
	});

	return response.url;
};

export const createCustomerPortalLink: CreateCustomerPortalLink = async ({ customerId }) => {
	const polarClient = getPolarClient();

	const response = await polarClient.customerSessions.create({
		customer_id: customerId,
	});

	return response.customer_portal_url;
};

export const setSubscriptionSeats: SetSubscriptionSeats = async () => {
	throw new Error("Not implemented");
};

export const cancelSubscription: CancelSubscription = async (id) => {
	const polarClient = getPolarClient();

	await polarClient.subscriptions.revoke(id);
};

export const webhookHandler: WebhookHandler = async (req) => {
	const polarWebhookSecret = process.env.POLAR_WEBHOOK_SECRET as string;

	if (!polarWebhookSecret) {
		return new Response("Missing env variable POLAR_WEBHOOK_SECRET", {
			status: 500,
		});
	}

	try {
		if (!req.body) {
			return new Response("No body", {
				status: 400,
			});
		}

		const event = await webhooks.validateEvent(
			await req.text(),
			Object.fromEntries(req.headers.entries()),
			polarWebhookSecret,
		);

		switch (event.type) {
			case "order.created": {
				const {
					metadata,
					customer_id: customerId,
					subscription,
					product_id: productId,
				} = event.data;

				if (subscription) {
					break;
				}

				if (!productId) {
					return new Response("Missing product ID.", {
						status: 400,
					});
				}

				const planId = getPlanIdByProviderPriceId(productId);

				if (!planId) {
					return new Response("Missing plan ID.", {
						status: 400,
					});
				}

				await createPurchase({
					organizationId: (metadata?.organization_id as string) || null,
					userId: (metadata?.user_id as string) || null,
					customerId,
					type: "ONE_TIME",
					priceId: productId,
				});

				await setCustomerIdToEntity(customerId, {
					organizationId: metadata?.organization_id as string,
					userId: metadata?.user_id as string,
				});

				break;
			}
			case "subscription.created": {
				const { metadata, customer_id: customerId, product_id: productId, id } = event.data;
				const planId = getPlanIdByProviderPriceId(productId);

				if (!planId) {
					return new Response("Missing plan ID.", {
						status: 400,
					});
				}

				const persistedSubscription = persistPolarSubscription(event.data);

				await createPurchase({
					subscriptionId: id,
					organizationId: metadata?.organization_id as string,
					userId: metadata?.user_id as string,
					customerId,
					type: "SUBSCRIPTION",
					priceId: productId,
					status: persistedSubscription.status,
					trialEndsAt: persistedSubscription.trialEndsAt,
				});

				await setCustomerIdToEntity(customerId, {
					organizationId: metadata?.organization_id as string,
					userId: metadata?.user_id as string,
				});

				break;
			}
			case "subscription.updated":
			case "subscription.canceled": {
				const { id, product_id: productId } = event.data;

				const existingPurchase = await getPurchaseBySubscriptionId(id);

				if (existingPurchase) {
					const persistedSubscription = persistPolarSubscription(event.data);

					await updatePurchase({
						id: existingPurchase.id,
						status: persistedSubscription.status,
						trialEndsAt: persistedSubscription.trialEndsAt,
						priceId: productId,
					});
				}

				break;
			}
			case "subscription.revoked": {
				await deletePurchaseBySubscriptionId(event.data.id);

				break;
			}

			default:
				return new Response("Unhandled event type.", {
					status: 200,
				});
		}

		return new Response(null, {
			status: 202,
		});
	} catch (error) {
		if (error instanceof webhooks.PolarWebhookVerificationError) {
			return new Response("Invalid request.", {
				status: 403,
			});
		}
		throw error;
	}
};
