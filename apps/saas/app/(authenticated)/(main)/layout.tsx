import { getOrganizationList, getSession } from "@auth/lib/server";
import { ensureStoreForUser } from "@organizations/lib/ensure-store";
import { listPurchases } from "@repo/api/modules/payments/procedures/list-purchases";
import { config as authConfig } from "@repo/auth/config";
import { config as paymentsConfig } from "@repo/payments/config";
import { createPurchasesHelper } from "@repo/payments/lib/helper";
import { getSubscriptionPaywallRedirectPath } from "@repo/payments/lib/subscription-status";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";

export default async function MainLayout({ children }: PropsWithChildren) {
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	if (authConfig.users.enableOnboarding && !session.user.onboardingComplete) {
		redirect("/onboarding");
	}

	const organizations = await getOrganizationList();

	if (authConfig.organizations.enable && authConfig.organizations.requireOrganization) {
		const organization =
			organizations.find((org) => org.id === session?.session.activeOrganizationId) ||
			organizations[0];

		if (!organization) {
			const store = await ensureStoreForUser(session.user);
			redirect(`/${store.slug}`);
		}
	}

	if (paymentsConfig.requireActiveSubscription) {
		const organizationId = authConfig.organizations.enable
			? session?.session.activeOrganizationId || organizations?.at(0)?.id
			: undefined;

		const purchases = await listPurchases.callable({
			context: { headers: await headers() },
		})({
			organizationId,
		});

		const { hasAccess, activePlan } = createPurchasesHelper(purchases);
		const billingOrganization =
			organizations.find((organization) => organization.id === organizationId) ??
			organizations[0];
		const paywallRedirectPath = getSubscriptionPaywallRedirectPath({
			hasAccess,
			hasVisiblePlan: !!activePlan,
			billingPath:
				paymentsConfig.billingAttachedTo === "organization"
					? billingOrganization?.slug
						? `/${billingOrganization.slug}/settings/billing`
						: "/choose-plan"
					: "/settings/billing",
		});

		if (paywallRedirectPath) {
			redirect(paywallRedirectPath);
		}
	}

	return children;
}
