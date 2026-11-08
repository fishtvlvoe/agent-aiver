import { config, resolveLocale } from "@repo/i18n";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { getMessagesForLocale } from "./lib/messages";

export default getRequestConfig(async ({ requestLocale }) => {
	let locale = await requestLocale;

	if (!locale) {
		const cookieStore = await cookies();
		const localeCookie = cookieStore.get(config.localeCookieName);
		locale = resolveLocale(localeCookie?.value);
	}

	return {
		locale,
		messages: await getMessagesForLocale(locale),
	};
});
