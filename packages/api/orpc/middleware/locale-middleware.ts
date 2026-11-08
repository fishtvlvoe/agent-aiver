import { os } from "@orpc/server";
import { getCookie } from "@orpc/server/helpers";
import { config, resolveLocale } from "@repo/i18n";

export const localeMiddleware = os
	.$context<{
		headers: Headers;
	}>()
	.middleware(async ({ context, next }) => {
		const locale = resolveLocale(getCookie(context.headers, config.localeCookieName));

		return await next({
			context: {
				locale,
			},
		});
	});
