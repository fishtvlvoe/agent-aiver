"use client";

import { Button } from "@repo/ui/components/button";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";

type StatusFilter = "all" | "handoff" | "missed";

const FILTERS: StatusFilter[] = ["all", "handoff", "missed"];

const STATUS_LABEL_KEYS = ["resolved", "handoff", "missed", "rate_limited"] as const;

function isKnownStatus(status: string | null): status is (typeof STATUS_LABEL_KEYS)[number] {
	return STATUS_LABEL_KEYS.includes(status as (typeof STATUS_LABEL_KEYS)[number]);
}

function formatCreatedAt(createdAt: string | null) {
	return createdAt
		? new Date(createdAt).toLocaleString("zh-TW", {
				timeZone: "Asia/Taipei",
			})
		: "—";
}

export function ConversationsTable({ organizationId }: { organizationId: string }) {
	const t = useTranslations("bot.conversations");
	const [filter, setFilter] = useState<StatusFilter>("all");
	const [offset, setOffset] = useState(0);

	const { data, isPending, isError } = useQuery(
		orpc.bot.listConversations.queryOptions({
			input: { organizationId, status: filter, offset },
		}),
	);

	const changeFilter = (next: StatusFilter) => {
		setFilter(next);
		setOffset(0);
	};

	const conversations = data?.conversations ?? [];

	return (
		<section className="gap-4 flex flex-col">
			<div className="gap-2 flex flex-wrap">
				{FILTERS.map((item) => (
					<Button
						key={item}
						variant={filter === item ? "primary" : "outline"}
						aria-pressed={filter === item}
						onClick={() => changeFilter(item)}
					>
						{t(`tabs.${item}`)}
					</Button>
				))}
			</div>

			{isError && <p className="text-sm text-destructive">{t("loadFailed")}</p>}

			<div className="hidden overflow-x-auto rounded-lg border md:block">
				<table className="text-sm w-full min-w-[680px]">
					<thead>
						<tr className="border-b bg-muted/40 text-left">
							<th className="px-3 py-2 font-medium">{t("columns.time")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.guest")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.question")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.answer")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.status")}</th>
						</tr>
					</thead>
					<tbody>
						{conversations.map((row) => (
							<tr key={row.id} className="border-b align-top last:border-0">
								<td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
									{formatCreatedAt(row.createdAt)}
								</td>
								<td className="px-3 py-3 whitespace-nowrap">{row.guestTag}</td>
								<td className="px-3 py-3 whitespace-pre-wrap">{row.userText}</td>
								<td className="px-3 py-3 whitespace-pre-wrap text-muted-foreground">
									{row.aiText}
								</td>
								<td className="px-3 py-3 whitespace-nowrap">
									{isKnownStatus(row.status)
										? t(`status.${row.status}`)
										: row.status}
								</td>
							</tr>
						))}
						{!isPending && !isError && conversations.length === 0 && (
							<tr>
								<td
									colSpan={5}
									className="px-3 py-6 text-center text-muted-foreground"
								>
									{t(`empty.${filter}`)}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<ul className="gap-3 md:hidden flex flex-col">
				{conversations.map((row) => (
					<li key={row.id} className="gap-2 p-4 text-sm flex flex-col rounded-lg border">
						<div className="gap-2 flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								{formatCreatedAt(row.createdAt)}
							</span>
							<span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs">
								{isKnownStatus(row.status) ? t(`status.${row.status}`) : row.status}
							</span>
						</div>
						<p className="font-medium">{row.guestTag}</p>
						<div className="gap-1 flex flex-col">
							<p className="text-xs text-muted-foreground">問</p>
							<p className="whitespace-pre-wrap line-clamp-3">{row.userText}</p>
						</div>
						<div className="gap-1 flex flex-col">
							<p className="text-xs text-muted-foreground">答</p>
							<p className="whitespace-pre-wrap line-clamp-3 text-muted-foreground">
								{row.aiText || "—"}
							</p>
						</div>
					</li>
				))}
				{!isPending && !isError && conversations.length === 0 && (
					<li className="p-6 text-center text-sm text-muted-foreground">
						{t(`empty.${filter}`)}
					</li>
				)}
			</ul>

			<div className="gap-2 flex justify-end">
				<Button
					variant="outline"
					disabled={offset === 0}
					onClick={() => setOffset(Math.max(0, offset - 50))}
				>
					{t("prev")}
				</Button>
				<Button
					variant="outline"
					disabled={!data?.hasMore}
					onClick={() => data?.nextOffset != null && setOffset(data.nextOffset)}
				>
					{t("next")}
				</Button>
			</div>
		</section>
	);
}
