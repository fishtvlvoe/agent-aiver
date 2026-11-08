import type { I18nConfig } from "./types";

export const config = {
	locales: {
		en: {
			label: "English",
			currency: "USD",
		},
		de: {
			label: "Deutsch",
			currency: "USD",
		},
		es: {
			label: "Español",
			currency: "USD",
		},
		fr: {
			label: "Français",
			currency: "USD",
		},
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
