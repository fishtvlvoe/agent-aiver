"use client";

import { getAdminPath } from "@admin/lib/links";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { toast } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";

type View = "all" | "usage" | "handoff";

const VIEWS: View[] = ["all", "usage", "handoff"];

const MAX_LIMIT = 1_000_000;

export function BotStoresOverview() {
	const t = useTranslations("admin.botStores");
	const queryClient = useQueryClient();
	const [viewParam, setView] = useQueryState("view", parseAsString.withDefault("all"));
	const view = VIEWS.includes(viewParam as View) ? (viewParam as View) : "all";

	const totalsQuery = useQuery(orpc.bot.admin.getTotals.queryOptions());
	const storesQuery = useQuery(orpc.bot.admin.listStores.queryOptions());

	const stores = storesQuery.data?.stores ?? [];
	const visibleStores = stores
		.filter((store) => view !== "handoff" || store.handoffCount > 0)
		.sort((a, b) => {
			if (view === "usage") return b.monthCount - a.monthCount;
			if (view === "handoff") return b.handoffCount - a.handoffCount;
			return a.name.localeCompare(b.name, "zh-TW");
		});

	const cards: { key: View; label: string; value: number | undefined }[] = [
		{ key: "all", label: t("cards.stores"), value: totalsQuery.data?.stores },
		{ key: "usage", label: t("cards.monthReplies"), value: totalsQuery.data?.monthReplies },
		{
			key: "handoff",
			label: t("cards.pendingHandoff"),
			value: totalsQuery.data?.pendingHandoff,
		},
	];

	const isError = totalsQuery.isError || storesQuery.isError;

	return (
		<section className="gap-6 flex flex-col">
			<div className="gap-4 sm:grid-cols-3 grid grid-cols-1">
				{cards.map((card) => (
					<button
						key={card.key}
						type="button"
						aria-pressed={view === card.key}
						onClick={() => setView(card.key)}
						className="text-left"
					>
						<Card
							className={`gap-2 p-5 flex flex-col ${view === card.key ? "ring-2 ring-primary" : ""}`}
						>
							<p className="text-sm text-muted-foreground">{card.label}</p>
							<p className="text-2xl font-semibold">
								{card.value?.toLocaleString("zh-TW") ?? "—"}
							</p>
						</Card>
					</button>
				))}
			</div>

			<div className="gap-2 flex flex-wrap">
				{VIEWS.map((item) => (
					<Button
						key={item}
						variant={view === item ? "primary" : "outline"}
						aria-pressed={view === item}
						onClick={() => setView(item)}
					>
						{t(`views.${item}`)}
					</Button>
				))}
			</div>

			{isError && <p className="text-sm text-destructive">{t("loadFailed")}</p>}

			<div className="overflow-x-auto rounded-lg border">
				<table className="text-sm w-full min-w-[680px]">
					<thead>
						<tr className="border-b bg-muted/40 text-left">
							<th className="px-3 py-2 font-medium">{t("columns.store")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.status")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.monthReplies")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.handoff")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.missed")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.limit")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.platformModel")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.admin")}</th>
						</tr>
					</thead>
					<tbody>
						{visibleStores.map((store) => (
							<tr
								key={store.organizationId}
								className="border-b align-middle last:border-0"
							>
								<td className="px-3 py-3 font-medium whitespace-nowrap">
									{store.name}
								</td>
								<td className="px-3 py-3 whitespace-nowrap">
									{store.status === "bound"
										? t("status.bound")
										: t("status.unbound")}
								</td>
								<td className="px-3 py-3 whitespace-nowrap">
									{store.monthCount.toLocaleString("zh-TW")} /{" "}
									{store.limit.toLocaleString("zh-TW")}
								</td>
								<td className="px-3 py-3 whitespace-nowrap">
									{store.handoffCount}
								</td>
								<td className="px-3 py-3 whitespace-nowrap">{store.missedCount}</td>
								<td className="px-3 py-3">
									<LimitForm
										key={`${store.organizationId}-${store.monthlyLimit ?? "default"}`}
										organizationId={store.organizationId}
										monthlyLimit={store.monthlyLimit}
										defaultLimit={store.limit}
										onSaved={() =>
											queryClient.invalidateQueries({
												queryKey: orpc.bot.admin.listStores.key(),
											})
										}
									/>
								</td>
								<td className="px-3 py-3">
									<PlatformModelSwitch
										organizationId={store.organizationId}
										checked={store.usePlatformModel}
										onSaved={() =>
											queryClient.invalidateQueries({
												queryKey: orpc.bot.admin.listStores.key(),
											})
										}
									/>
								</td>
								<td className="px-3 py-3 whitespace-nowrap">
									<Link
										href={getAdminPath(
											`/organizations/${store.organizationId}`,
										)}
										className="text-primary underline-offset-4 hover:underline"
									>
										{t("inviteAdmin")}
									</Link>
								</td>
							</tr>
						))}
						{!storesQuery.isPending && !isError && visibleStores.length === 0 && (
							<tr>
								<td
									colSpan={8}
									className="px-3 py-6 text-center text-muted-foreground"
								>
									{t("empty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function PlatformModelSwitch({
	organizationId,
	checked,
	onSaved,
}: {
	organizationId: string;
	checked: boolean;
	onSaved: () => Promise<unknown>;
}) {
	const t = useTranslations("admin.botStores");

	const { mutate, isPending } = useMutation(
		orpc.bot.admin.setUsePlatformModel.mutationOptions({
			onSuccess: async () => {
				await onSaved();
				toast.add({ title: t("platformModelSaved"), type: "success" });
			},
			onError: () => {
				toast.add({ title: t("platformModelFailed"), type: "error" });
			},
		}),
	);

	return (
		<Switch
			checked={checked}
			disabled={isPending}
			aria-label={t("columns.platformModel")}
			onCheckedChange={(next) => mutate({ organizationId, usePlatformModel: next })}
		/>
	);
}

function LimitForm({
	organizationId,
	monthlyLimit,
	defaultLimit,
	onSaved,
}: {
	organizationId: string;
	monthlyLimit: number | null;
	defaultLimit: number;
	onSaved: () => Promise<unknown>;
}) {
	const t = useTranslations("admin.botStores");
	const [value, setValue] = useState(monthlyLimit?.toString() ?? "");

	const { mutate, isPending } = useMutation(
		orpc.bot.admin.setMonthlyLimit.mutationOptions({
			onSuccess: async () => {
				await onSaved();
				toast.add({ title: t("limitSaved"), type: "success" });
			},
			onError: () => {
				toast.add({ title: t("limitFailed"), type: "error" });
			},
		}),
	);

	const submit = () => {
		const trimmed = value.trim();

		if (trimmed === "") {
			mutate({ organizationId, limit: null });
			return;
		}

		const parsed = Number(trimmed);
		if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
			toast.add({ title: t("limitInvalid"), type: "error" });
			return;
		}

		mutate({ organizationId, limit: parsed });
	};

	return (
		<div className="gap-2 flex items-center">
			<Input
				type="number"
				inputMode="numeric"
				min={1}
				max={MAX_LIMIT}
				className="w-28"
				placeholder={t("limitPlaceholder", { limit: defaultLimit })}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				aria-label={t("columns.limit")}
			/>
			<Button variant="outline" size="sm" disabled={isPending} onClick={submit}>
				{t("limitSave")}
			</Button>
		</div>
	);
}
