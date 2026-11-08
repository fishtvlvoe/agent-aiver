"use client";

import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { toast } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type Provider = "gemini" | "cloudflare" | "custom";

const PROVIDERS: Provider[] = ["gemini", "cloudflare", "custom"];

const CF_ERROR_KEYS = {
	denied: "cfErrorDenied",
	no_account: "cfErrorNoAccount",
	exchange: "cfErrorExchange",
	state: "cfErrorState",
} as const;

export function ModelSettingsForm({ organizationId }: { organizationId: string }) {
	const t = useTranslations("bot.modelSettings");
	const queryClient = useQueryClient();

	const settingsQueryKey = orpc.bot.getModelSettings.queryKey({ input: { organizationId } });

	const { data: settings } = useQuery(
		orpc.bot.getModelSettings.queryOptions({ input: { organizationId } }),
	);

	const [provider, setProvider] = useState<Provider>("gemini");
	const [modelName, setModelName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [accountId, setAccountId] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [models, setModels] = useState<string[]>([]);
	const [manualOpen, setManualOpen] = useState(false);

	useEffect(() => {
		if (!settings) {
			return;
		}
		setProvider(settings.provider);
		setModelName(settings.modelName ?? "");
		setBaseUrl(settings.baseUrl ?? "");
		setAccountId(settings.accountId ?? "");
		setApiKey("");
	}, [settings]);

	// 授權完成後會帶 cfError 參數回到這頁，顯示一次後清掉參數
	useEffect(() => {
		const code = new URLSearchParams(window.location.search).get("cfError");
		if (!code) {
			return;
		}
		const key = CF_ERROR_KEYS[code as keyof typeof CF_ERROR_KEYS];
		if (key) {
			toast.add({ title: t(key), type: "error" });
		}
		window.history.replaceState(null, "", window.location.pathname);
	}, [t]);

	const isCustom = provider === "custom";
	const isCloudflare = provider === "cloudflare";
	const useManualInput = isCustom || models.length === 0;
	const modelOptions = [...new Set([...(modelName ? [modelName] : []), ...models])];

	const platformEnabled = settings?.usePlatformModel === true;
	const oauthLinked = isCloudflare && settings?.cfOauthStatus === "linked";
	const oauthInvalid = isCloudflare && settings?.cfOauthStatus === "invalid";
	// Cloudflare 預設走 OAuth，手動 Token 只在展開時出現；不走平台模型
	const showApiKey = isCustom || (isCloudflare ? manualOpen : !platformEnabled);
	const hasSavedKey = settings?.provider === provider && !!settings?.apiKeyMask;

	const providerItems = PROVIDERS.map((value) => ({
		value,
		label: t(`providers.${value}`),
	}));

	const modelItems = modelOptions.map((value) => ({ value, label: value }));

	const onProviderChange = (next: Provider) => {
		setProvider(next);
		setModels([]);
		setModelName("");
	};

	const onFetchModelsError = () => {
		toast.add({ title: t("listFailed"), type: "error" });
	};

	const fetchModelsMutation = useMutation(
		orpc.bot.listModels.mutationOptions({
			onSuccess: ({ models: list, error }) => {
				setModels(list);
				if (error) {
					toast.add({ title: error, type: "error" });
					return;
				}
				toast.add({ title: t("modelsUpdated"), type: "success" });
			},
			onError: onFetchModelsError,
		}),
	);

	const saveMutation = useMutation(
		orpc.bot.saveModelSettings.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
				toast.add({ title: t("saved"), type: "success" });
			},
			onError: () => {
				toast.add({ title: t("saveFailed"), type: "error" });
			},
		}),
	);

	const restoreMutation = useMutation(
		orpc.bot.saveModelSettings.mutationOptions({
			onSuccess: async () => {
				setModels([]);
				await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
				toast.add({ title: t("restored"), type: "success" });
			},
			onError: () => {
				toast.add({ title: t("saveFailed"), type: "error" });
			},
		}),
	);

	const fetchModels = () => {
		if (isCustom && !baseUrl.trim()) {
			toast.add({ title: t("missingBaseUrl"), type: "error" });
			return;
		}

		if (isCloudflare && !accountId.trim()) {
			toast.add({ title: t("missingAccountId"), type: "error" });
			return;
		}

		fetchModelsMutation.mutate({
			organizationId,
			provider,
			baseUrl: isCustom ? baseUrl.trim() : undefined,
			accountId: isCloudflare ? accountId.trim() : undefined,
			apiKey: showApiKey && apiKey.trim() ? apiKey.trim() : undefined,
		});
	};

	const save = () => {
		if (!modelName.trim()) {
			toast.add({ title: t("missingModel"), type: "error" });
			return;
		}

		if (isCustom && !baseUrl.trim()) {
			toast.add({ title: t("missingBaseUrl"), type: "error" });
			return;
		}

		if (isCloudflare && !accountId.trim()) {
			toast.add({ title: t("missingAccountId"), type: "error" });
			return;
		}

		if (showApiKey && !apiKey.trim() && !hasSavedKey) {
			toast.add({ title: t("missingApiKey"), type: "error" });
			return;
		}

		saveMutation.mutate(
			{
				organizationId,
				mode: "custom",
				provider,
				modelName,
				baseUrl: isCustom ? baseUrl.trim() : undefined,
				accountId: isCloudflare ? accountId.trim() : undefined,
				apiKey: showApiKey && apiKey.trim() ? apiKey.trim() : undefined,
			},
			{ onSuccess: () => setApiKey("") },
		);
	};

	const disconnectMutation = useMutation(
		orpc.bot.disconnectCloudflare.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
				toast.add({ title: t("cfOauthDisconnected"), type: "success" });
			},
			onError: () => {
				toast.add({ title: t("saveFailed"), type: "error" });
			},
		}),
	);

	const connectCloudflare = () => {
		window.location.assign(`/api/bot/cf-oauth/start?organizationId=${encodeURIComponent(organizationId)}`);
	};

	const restoreDefault = () => {
		restoreMutation.mutate({ organizationId, mode: "platform" });
	};

	return (
		<Card className="p-6">
			<div className="gap-5 flex flex-col">
				<div className="gap-2 flex flex-col">
					<p className="text-sm font-medium">{t("provider")}</p>
					<Select
						value={provider}
						items={providerItems}
						onValueChange={(value) => {
							if (value === null) {
								return;
							}
							onProviderChange(value);
						}}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{providerItems.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{provider === "gemini" && (
						<p className="text-xs text-muted-foreground">{t("freeOnlyHint")}</p>
					)}
					{isCustom && (
						<p className="text-xs text-muted-foreground">{t("customListHint")}</p>
					)}
				</div>

				{isCloudflare && (
					<div className="gap-3 flex flex-col">
						<p className="text-sm font-medium">{t("cfOauthTitle")}</p>
						{oauthLinked ? (
							<p className="text-xs text-muted-foreground">{t("cfOauthLinked")}</p>
						) : (
							<p className="text-xs text-muted-foreground">{t("cfOauthDescription")}</p>
						)}
						{oauthInvalid && <p className="text-xs text-destructive">{t("cfOauthInvalid")}</p>}
						<div className="gap-2 flex flex-col">
							{oauthLinked ? (
								<Button
									className="w-full"
									variant="outline"
									loading={disconnectMutation.isPending}
									onClick={() => disconnectMutation.mutate({ organizationId })}
								>
									{t("cfOauthDisconnect")}
								</Button>
							) : (
								<Button className="w-full" onClick={connectCloudflare}>
									{oauthInvalid ? t("cfOauthReconnect") : t("cfOauthConnect")}
								</Button>
							)}
						</div>
						<Button
							className="w-full"
							variant="outline"
							onClick={() => setManualOpen((open) => !open)}
						>
							{manualOpen ? t("cfOauthManualHide") : t("cfOauthManualToggle")}
						</Button>
					</div>
				)}

				<div className="gap-2 flex flex-col">
					<p className="text-sm font-medium">{t("modelName")}</p>
					<div className="gap-2 sm:flex-row sm:items-center flex flex-col">
						{useManualInput ? (
							<Input
								className="sm:flex-1"
								autoComplete="off"
								placeholder={t("manualModelName")}
								value={modelName}
								onChange={(event) => setModelName(event.target.value)}
							/>
						) : (
							<Select
								value={modelName || null}
								items={modelItems}
								onValueChange={(value) => {
									if (value === null) {
										return;
									}
									setModelName(value);
								}}
							>
								<SelectTrigger className="sm:flex-1">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{modelItems.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
						<Button
							variant="outline"
							loading={fetchModelsMutation.isPending}
							onClick={fetchModels}
						>
							{t("fetchModels")}
						</Button>
					</div>
					{!modelName && (
						<p className="text-xs text-muted-foreground">{t("modelPlaceholder")}</p>
					)}
				</div>

				{isCustom && (
					<div className="gap-2 flex flex-col">
						<p className="text-sm font-medium">{t("baseUrl")}</p>
						<Input
							type="url"
							autoComplete="off"
							value={baseUrl}
							onChange={(event) => setBaseUrl(event.target.value)}
						/>
					</div>
				)}

				{isCloudflare && manualOpen && (
					<div className="gap-1 flex flex-col">
						<p className="text-xs text-muted-foreground">{t("cloudflareHint")}</p>
						<ol className="text-xs text-muted-foreground pl-4 list-decimal">
							<li>
								{t("cloudflareStep1")}{" "}
								<a
									className="underline"
									href="https://dash.cloudflare.com/sign-up"
									target="_blank"
									rel="noreferrer"
								>
									dash.cloudflare.com
								</a>
							</li>
							<li>
								{t("cloudflareStep2")}{" "}
								<a
									className="underline"
									href="https://dash.cloudflare.com/profile/api-tokens"
									target="_blank"
									rel="noreferrer"
								>
									{t("cloudflareTokenLink")}
								</a>
							</li>
							<li>{t("cloudflareStep3")}</li>
						</ol>
					</div>
				)}

				{isCloudflare && manualOpen && (
					<div className="gap-2 flex flex-col">
						<p className="text-sm font-medium">{t("accountId")}</p>
						<Input
							autoComplete="off"
							value={accountId}
							onChange={(event) => setAccountId(event.target.value)}
						/>
					</div>
				)}

				{showApiKey && (
					<div className="gap-2 flex flex-col">
						<p className="text-sm font-medium">
							{isCloudflare ? t("cloudflareTokenLabel") : t("apiKey")}
						</p>
						{hasSavedKey && settings?.apiKeyMask && (
							<p className="text-xs text-muted-foreground">
								{settings.apiKeyMask} · {t("apiKeyHint")}
							</p>
						)}
						{!hasSavedKey && (
							<p className="text-xs text-destructive">{t("ownKeyRequired")}</p>
						)}
						<Input
							type="password"
							autoComplete="off"
							value={apiKey}
							onChange={(event) => setApiKey(event.target.value)}
						/>
					</div>
				)}

				<div className="gap-2 sm:flex-row sm:justify-between flex flex-col">
					{platformEnabled && (
						<Button
							variant="outline"
							loading={restoreMutation.isPending}
							onClick={restoreDefault}
						>
							{t("restoreDefault")}
						</Button>
					)}
					<Button className="w-full sm:ml-auto md:w-auto" loading={saveMutation.isPending} onClick={save}>
						{t("save")}
					</Button>
				</div>
			</div>
		</Card>
	);
}
