import { getActiveOrganization, getSession } from "@auth/lib/server";
import { LineSettingsForm } from "@bot/components/LineSettingsForm";
import { PageHeader } from "@shared/components/PageHeader";
import { permix, setupPermissions } from "@shared/lib/permix";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("bot.lineSettings");

	return {
		title: t("title"),
	};
}

export default async function LineSettingsPage({
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

	const t = await getTranslations("bot.lineSettings");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("description")} />

			<LineSettingsForm organizationId={organization.id} />
		</>
	);
}
