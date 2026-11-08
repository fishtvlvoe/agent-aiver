import { getOrganizationList, getSession } from "@auth/lib/server";
import { ensureStoreForUser } from "@organizations/lib/ensure-store";
import { config } from "@repo/auth/config";
import { PageHeader } from "@shared/components/PageHeader";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("app.menu");

	return {
		title: t("start"),
	};
}

export default async function AppStartPage() {
	const session = await getSession();

	if (!session) {
		redirect("/login");
	}

	const organizations = await getOrganizationList();

	if (config.organizations.enable && config.organizations.requireOrganization) {
		const organization =
			organizations.find((org) => org.id === session?.session.activeOrganizationId) ||
			organizations[0];

		if (!organization) {
			const store = await ensureStoreForUser(session.user);
			redirect(`/${store.slug}`);
		}

		redirect(`/${organization.slug}`);
	}

	const t = await getTranslations("start");

	return (
		<div className="">
			<PageHeader
				title={t("welcome", { name: session?.user.name })}
				subtitle={t("subtitle")}
			/>
		</div>
	);
}
