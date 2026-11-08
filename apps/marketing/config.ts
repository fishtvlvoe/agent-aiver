import type { MarketingConfig } from "./types";

export const config = {
	appName: "AIVER",
	docsUrl: process.env.NEXT_PUBLIC_DOCS_URL as string | undefined,
	saasUrl:
		(process.env.NEXT_PUBLIC_SAAS_URL as string | undefined) ??
		"https://agent-aiver-admin.fishandy1213.workers.dev",
	enabledThemes: ["light", "dark"],
	defaultTheme: "light",
} as const satisfies MarketingConfig;
