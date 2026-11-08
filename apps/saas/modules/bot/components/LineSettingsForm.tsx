"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { toast } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
	channelSecret: z.string().trim().min(1),
	accessToken: z.string().trim().min(1),
});

type LineFormValues = z.infer<typeof formSchema>;

export function LineSettingsForm({ organizationId }: { organizationId: string }) {
	const t = useTranslations("bot.lineSettings");
	const queryClient = useQueryClient();

	const storeQueryKey = orpc.bot.getStore.queryKey({ input: { organizationId } });

	const { data: store } = useQuery(orpc.bot.getStore.queryOptions({ input: { organizationId } }));

	const { data: webhook, isError: isWebhookError } = useQuery(
		orpc.bot.getWebhookUrl.queryOptions({ input: { organizationId } }),
	);

	const isBound = store?.status === "bound";
	const webhookUrl = isWebhookError ? null : (webhook?.webhookUrl ?? null);

	const form = useForm<LineFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { channelSecret: "", accessToken: "" },
	});

	const bindMutation = useMutation(
		orpc.bot.bindLine.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: storeQueryKey });
				form.reset({ channelSecret: "", accessToken: "" });
				toast.add({ title: t("saved"), type: "success" });
			},
			onError: () => {
				toast.add({ title: t("invalidCredentials"), type: "error" });
			},
		}),
	);

	const onSubmit = form.handleSubmit((values) => {
		bindMutation.mutate({ organizationId, ...values });
	});

	const copyWebhookUrl = async () => {
		if (!webhookUrl) {
			return;
		}

		await navigator.clipboard.writeText(webhookUrl);
		toast.add({ title: t("webhook.copied"), type: "success" });
	};

	return (
		<div className="gap-6 flex flex-col">
			<Card className="gap-4 p-6 flex flex-col">
				<div className="gap-2 flex flex-col">
					<p className="text-sm text-muted-foreground">{t("status.label")}</p>
					<p className="font-medium">
						{isBound ? t("status.connected") : t("status.notConnected")}
					</p>
				</div>

				<div className="gap-2 flex flex-col">
					<p className="text-sm text-muted-foreground">{t("webhook.label")}</p>
					{webhookUrl ? (
						<div className="gap-2 sm:flex-row sm:items-start flex flex-col">
							<code className="px-3 py-2 text-sm flex-1 rounded-md bg-muted break-all">
								{webhookUrl}
							</code>
							<Button variant="outline" onClick={copyWebhookUrl}>
								<CopyIcon className="mr-2 size-4" />
								{t("webhook.copy")}
							</Button>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">{t("webhook.missing")}</p>
					)}
				</div>
			</Card>

			<Card className="p-6">
				<Form {...form}>
					<form onSubmit={onSubmit} className="gap-4 flex flex-col">
						<FormField
							control={form.control}
							name="channelSecret"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("channelSecret.label")}</FormLabel>
									<p className="text-xs text-muted-foreground">
										{t("channelSecret.hint")}
									</p>
									{store?.lineSecretMask && (
										<p className="text-xs text-muted-foreground">
											{store.lineSecretMask}
										</p>
									)}
									{store?.lineSecretMask && (
										<p className="text-xs text-muted-foreground">
											{store.lineSecretVerifiedAt
												? t("channelSecret.verified")
												: t("channelSecret.unverified")}
										</p>
									)}
									<FormControl>
										<Input type="password" autoComplete="off" {...field} />
									</FormControl>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="accessToken"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("accessToken.label")}</FormLabel>
									<p className="text-xs text-muted-foreground">
										{t("accessToken.hint")}
									</p>
									{store?.lineTokenMask && (
										<p className="text-xs text-muted-foreground">
											{store.lineTokenMask}
										</p>
									)}
									<FormControl>
										<Input type="password" autoComplete="off" {...field} />
									</FormControl>
								</FormItem>
							)}
						/>
						<p className="text-xs text-muted-foreground">{t("maskHint")}</p>
						<div className="flex justify-end">
							<Button type="submit" className="w-full md:w-auto" loading={bindMutation.isPending}>
								{t("verifyAndSave")}
							</Button>
						</div>
					</form>
				</Form>
			</Card>
		</div>
	);
}
