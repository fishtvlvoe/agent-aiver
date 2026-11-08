import { BotStoresOverview } from "@admin/component/bot-stores/BotStoresOverview";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("admin.botStores");

	return {
		title: t("title"),
	};
}

export default function AdminBotStoresPage() {
	return <BotStoresOverview />;
}
