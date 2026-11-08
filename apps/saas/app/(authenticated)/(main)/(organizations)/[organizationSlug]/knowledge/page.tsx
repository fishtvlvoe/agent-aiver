import { getActiveOrganization, getSession } from "@auth/lib/server";
import { KnowledgeBlock } from "@bot/components/KnowledgeBlock";
import { PageHeader } from "@shared/components/PageHeader";
import { permix, setupPermissions } from "@shared/lib/permix";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("bot.knowledge");

	return {
		title: t("title"),
	};
}

export default async function KnowledgePage({
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

	const t = await getTranslations("bot.knowledge");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("description")} />

			<KnowledgeBlock
				organizationId={organization.id}
				canManage={permix.check("organization.manage")}
			/>
		</>
	);
}
