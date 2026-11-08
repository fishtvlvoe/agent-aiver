import { getActiveOrganization, getSession } from "@auth/lib/server";
import { ModelSettingsForm } from "@bot/components/ModelSettingsForm";
import { PersonaForm } from "@bot/components/PersonaForm";
import { PageHeader } from "@shared/components/PageHeader";
import { permix, setupPermissions } from "@shared/lib/permix";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("bot.modelSettings");

	return {
		title: t("title"),
	};
}

export default async function ModelSettingsPage({
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

	const t = await getTranslations("bot.modelSettings");

	return (
		<>
			<PageHeader title={t("title")} subtitle={t("description")} />

			<ModelSettingsForm organizationId={organization.id} />

			<div className="mt-6">
				<PersonaForm organizationId={organization.id} />
			</div>
		</>
	);
}
