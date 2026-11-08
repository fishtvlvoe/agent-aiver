const stripeLocales = ["en", "de", "es", "fr"] as const;

export type StripeCheckoutLocale = (typeof stripeLocales)[number];

export function toStripeLocale(locale?: string): StripeCheckoutLocale | undefined {
	if (!locale) {
		return undefined;
	}

	const language = locale.toLowerCase().split("-")[0];

	if (language === "en" || language === "de" || language === "es" || language === "fr") {
		return language;
	}

	return undefined;
}
