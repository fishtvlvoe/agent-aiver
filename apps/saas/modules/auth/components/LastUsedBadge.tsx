"use client";

import { cn } from "@repo/ui";
import { useTranslations } from "next-intl";

import { useLastUsedLoginMethod } from "../hooks/use-last-used-login-method";
import { isLastUsedLoginMethod } from "../lib/last-used-login-method";

export function LastUsedBadge({
	method,
	placement = "inline",
}: {
	method: string;
	placement?: "inline" | "corner";
}) {
	const t = useTranslations();
	const lastUsedLoginMethod = useLastUsedLoginMethod();

	if (!isLastUsedLoginMethod(lastUsedLoginMethod, method)) {
		return null;
	}

	return (
		<span
			className={cn(
				"px-1.5 py-0.5 font-medium rounded-md bg-accent text-[10px] leading-none text-accent-foreground",
				placement === "corner" ? "-top-2 right-3 pointer-events-none absolute" : "ml-1.5",
			)}
		>
			{t("auth.login.lastUsed")}
		</span>
	);
}
