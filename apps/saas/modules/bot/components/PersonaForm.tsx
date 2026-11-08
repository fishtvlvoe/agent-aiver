"use client";

import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/toast";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export function PersonaForm({ organizationId }: { organizationId: string }) {
	const t = useTranslations("bot.modelSettings.persona");
	const queryClient = useQueryClient();

	const personaQueryKey = orpc.bot.getPersona.queryKey({ input: { organizationId } });

	const { data } = useQuery(orpc.bot.getPersona.queryOptions({ input: { organizationId } }));

	const [persona, setPersona] = useState("");

	useEffect(() => {
		if (!data) {
			return;
		}
		setPersona(data.persona ?? "");
	}, [data]);

	const saveMutation = useMutation(
		orpc.bot.savePersona.mutationOptions({
			onSuccess: async (result) => {
				setPersona(result.persona ?? "");
				await queryClient.invalidateQueries({ queryKey: personaQueryKey });
				toast.add({ title: t("saved"), type: "success" });
			},
			onError: () => {
				toast.add({ title: t("saveFailed"), type: "error" });
			},
		}),
	);

	const save = () => {
		saveMutation.mutate({ organizationId, persona });
	};

	return (
		<Card className="p-6">
			<div className="gap-5 flex flex-col">
				<div className="gap-2 flex flex-col">
					<p className="text-sm font-medium">{t("title")}</p>
					<p className="text-xs text-muted-foreground">{t("description")}</p>
				</div>

				<div className="gap-2 flex flex-col">
					<Textarea
						maxLength={500}
						placeholder={t("placeholder")}
						value={persona}
						onChange={(event) => setPersona(event.target.value)}
					/>
					<p className="text-xs text-right text-muted-foreground">
						{persona.length} / 500
					</p>
				</div>

				<div className="flex justify-end">
					<Button
						className="md:w-auto w-full"
						loading={saveMutation.isPending}
						onClick={save}
					>
						{t("save")}
					</Button>
				</div>
			</div>
		</Card>
	);
}
