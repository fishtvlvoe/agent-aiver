"use client";

import { Card } from "@repo/ui/components/card";
import { Progress } from "@repo/ui/components/progress";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

export function UsagePanel({ organizationId }: { organizationId: string }) {
	const t = useTranslations("bot.usage");

	const { data, isError } = useQuery(
		orpc.bot.getUsage.queryOptions({ input: { organizationId } }),
	);

	if (isError) {
		return <p className="text-sm text-destructive">{t("loadFailed")}</p>;
	}

	if (!data) {
		return null;
	}

	const percent = Math.min(100, Math.round((data.count / data.limit) * 100));
	const isReached = data.count >= data.limit;
	const isNearLimit = !isReached && percent >= 80;

	return (
		<Card className="gap-4 p-6 flex flex-col">
			<div className="gap-2 flex flex-col">
				<p className="text-sm text-muted-foreground">{t("replies")}</p>
				<p className="text-2xl font-semibold">
					{data.count.toLocaleString("zh-TW")} / {data.limit.toLocaleString("zh-TW")}
				</p>
			</div>

			<Progress value={percent} />

			<p className="text-sm text-muted-foreground">
				{t("limitHint", { limit: data.limit.toLocaleString("zh-TW"), percent })}
			</p>

			{isNearLimit && <p className="text-sm">{t("nearLimit")}</p>}
			{isReached && <p className="text-sm">{t("reached")}</p>}
		</Card>
	);
}
