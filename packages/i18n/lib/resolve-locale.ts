import { config, type Locale } from "../config";

export function resolveLocale(value?: string | null): Locale {
	if (value && Object.keys(config.locales).includes(value)) {
		return value as Locale;
	}

	return config.defaultLocale;
}
