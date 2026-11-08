import type { I18nConfig } from "./types";

export const config = {
	locales: {
		"zh-TW": {
			label: "繁體中文",
			currency: "USD",
		},
	},
	defaultLocale: "zh-TW",
	defaultCurrency: "USD",
	localeCookieName: "NEXT_LOCALE",
} as const satisfies I18nConfig;

export type Locale = keyof typeof config.locales;
