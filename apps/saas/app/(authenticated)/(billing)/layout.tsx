import { getSession } from "@auth/lib/server";
import { config as authConfig } from "@repo/auth/config";
import { redirect } from "next/navigation";
import type { PropsWithChildren } from "react";

// Billing sits outside `(main)` so a lapsed subscription can still open
// the customer portal. Keep the auth/onboarding gates from that layout.
export default async function BillingAccessLayout({ children }: PropsWithChildren) {
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	if (authConfig.users.enableOnboarding && !session.user.onboardingComplete) {
		redirect("/onboarding");
	}

	return children;
}
