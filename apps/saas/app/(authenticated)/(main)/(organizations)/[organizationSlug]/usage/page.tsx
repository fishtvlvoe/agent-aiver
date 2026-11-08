import { getActiveOrganization, getSession } from "@auth/lib/server";
import { UsagePanel } from "@bot/components/UsagePanel";
import { PageHeader } from "@shared/components/PageHeader";
import { permix, setupPermissions } from "@shared/lib/permix";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("bot.usage");

	return {
		title: t("title"),
	};
}

export default async function UsagePage({
	params,
}: {
	params: Promise<{ organizationSlug: string }>;
}) {
	const session = await getSession();
	const { organizationSlug } = await params;
	const organization = await getActiveOrganization(organizationSlug);

	if (!organization) {
		return notFound();
	}

	const membershipRole = organization.members.find(
		(member) => member.userId === session?.user.id,
	)?.role;

	setupPermissions({
		user: session?.user,
		membershipRole,
	});

	if (!permix.check("organization.manage")) {
		return notFound();
	}

	const t = await getTranslations("bot.usage");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("description")} />

			<UsagePanel organizationId={organization.id} />
		</>
	);
}
