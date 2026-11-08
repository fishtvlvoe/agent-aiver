import { getOrganizationList, getSession } from "@auth/lib/server";
import { CreateOrganizationForm } from "@organizations/components/CreateOrganizationForm";
import { config } from "@repo/auth/config";
import { AuthWrapper } from "@shared/components/AuthWrapper";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
	const t = await getTranslations("organizations.createForm");

	return {
		title: t("title"),
	};
}

export default async function NewOrganizationPage() {
	const session = await getSession();
	const organizations = await getOrganizationList();
	// 平台管理員（role=admin）可隨時建立組織，不受一般使用者開放設定限制
	const isPlatformAdmin = session?.user.role === "admin";

	if (
		!config.organizations.enable ||
		(!isPlatformAdmin &&
			!config.organizations.enableUsersToCreateOrganizations &&
			(!config.organizations.requireOrganization || organizations.length > 0))
	) {
		redirect("/");
	}

	return (
		<AuthWrapper>
			<CreateOrganizationForm />
		</AuthWrapper>
	);
}
