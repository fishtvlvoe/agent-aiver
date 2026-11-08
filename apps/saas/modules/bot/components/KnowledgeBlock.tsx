"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { toast } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { orpc } from "@shared/lib/orpc-query-utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EditIcon, PlusIcon, TrashIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
	question: z.string().trim().min(1).max(200),
	answer: z.string().trim().min(1).max(2000),
});

type FaqFormValues = z.infer<typeof formSchema>;

export function KnowledgeBlock({
	organizationId,
	canManage,
}: {
	organizationId: string;
	canManage: boolean;
}) {
	const t = useTranslations("bot.knowledge");
	const queryClient = useQueryClient();
	const { confirm } = useConfirmationAlert();

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const listQueryKey = orpc.bot.listFaqs.queryKey({ input: { organizationId } });

	const { data, isPending } = useQuery(
		orpc.bot.listFaqs.queryOptions({ input: { organizationId } }),
	);

	const form = useForm<FaqFormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: { question: "", answer: "" },
	});

	const onMutationError = () => {
		toast.add({ title: t("error"), type: "error" });
	};

	const createMutation = useMutation(
		orpc.bot.createFaq.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: listQueryKey });
				toast.add({ title: t("created"), type: "success" });
			},
			onError: onMutationError,
		}),
	);

	const updateMutation = useMutation(
		orpc.bot.updateFaq.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: listQueryKey });
				toast.add({ title: t("updated"), type: "success" });
			},
			onError: onMutationError,
		}),
	);

	const deleteMutation = useMutation(
		orpc.bot.deleteFaq.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({ queryKey: listQueryKey });
				toast.add({ title: t("deleted"), type: "success" });
			},
			onError: onMutationError,
		}),
	);

	const isSaving = createMutation.isPending || updateMutation.isPending;

	const openCreateDialog = () => {
		setEditingId(null);
		form.reset({ question: "", answer: "" });
		setDialogOpen(true);
	};

	const openEditDialog = (faq: {
		id: string;
		question: string | null;
		answer: string | null;
	}) => {
		setEditingId(faq.id);
		form.reset({ question: faq.question ?? "", answer: faq.answer ?? "" });
		setDialogOpen(true);
	};

	const onSubmit = form.handleSubmit((values) => {
		const onSuccess = () => setDialogOpen(false);

		if (editingId) {
			updateMutation.mutate({ organizationId, faqId: editingId, ...values }, { onSuccess });
			return;
		}

		createMutation.mutate({ organizationId, ...values }, { onSuccess });
	});

	const onDelete = (faqId: string) => {
		confirm({
			title: t("deleteConfirm"),
			confirmLabel: t("delete"),
			destructive: true,
			onConfirm: () => deleteMutation.mutate({ organizationId, faqId }),
		});
	};

	const faqs = data?.faqs ?? [];

	return (
		<section className="gap-4 flex flex-col">
			{canManage && (
				<div className="flex justify-end">
					<Button className="w-full md:w-auto" onClick={openCreateDialog}>
						<PlusIcon className="mr-2 size-4" />
						{t("newQuestion")}
					</Button>
				</div>
			)}

			<div className="hidden overflow-x-auto rounded-lg border md:block">
				<table className="text-sm w-full min-w-[680px]">
					<thead>
						<tr className="border-b bg-muted/40 text-left">
							<th className="px-3 py-2 font-medium">{t("columns.question")}</th>
							<th className="px-3 py-2 font-medium">{t("columns.answer")}</th>
							{canManage && <th className="px-3 py-2 font-medium" />}
						</tr>
					</thead>
					<tbody>
						{faqs.map((faq) => (
							<tr key={faq.id} className="border-b align-top last:border-0">
								<td className="px-3 py-3 font-medium">{faq.question}</td>
								<td className="px-3 py-3 whitespace-pre-wrap text-muted-foreground">
									{faq.answer}
								</td>
								{canManage && (
									<td className="px-3 py-3">
										<div className="gap-1 flex justify-end">
											<Button
												variant="ghost"
												size="icon"
												aria-label={t("edit")}
												onClick={() => openEditDialog(faq)}
											>
												<EditIcon className="size-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												aria-label={t("delete")}
												onClick={() => onDelete(faq.id)}
											>
												<TrashIcon className="size-4" />
											</Button>
										</div>
									</td>
								)}
							</tr>
						))}
						{!isPending && faqs.length === 0 && (
							<tr>
								<td
									colSpan={canManage ? 3 : 2}
									className="px-3 py-6 text-center text-muted-foreground"
								>
									{t("empty")}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<ul className="gap-3 md:hidden flex flex-col">
				{faqs.map((faq) => (
					<li key={faq.id} className="gap-2 p-4 text-sm flex flex-col rounded-lg border">
						<div className="gap-1 flex flex-col">
							<p className="text-xs text-muted-foreground">問</p>
							<p className="font-medium line-clamp-3">{faq.question}</p>
						</div>
						<div className="gap-1 flex flex-col">
							<p className="text-xs text-muted-foreground">答</p>
							<p className="whitespace-pre-wrap line-clamp-3 text-muted-foreground">
								{faq.answer}
							</p>
						</div>
						{canManage && (
							<div className="gap-1 pt-1 flex justify-end">
								<Button
									variant="ghost"
									size="icon"
									aria-label={t("edit")}
									onClick={() => openEditDialog(faq)}
								>
									<EditIcon className="size-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									aria-label={t("delete")}
									onClick={() => onDelete(faq.id)}
								>
									<TrashIcon className="size-4" />
								</Button>
							</div>
						)}
					</li>
				))}
				{!isPending && faqs.length === 0 && (
					<li className="p-6 text-center text-sm text-muted-foreground">{t("empty")}</li>
				)}
			</ul>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{editingId ? t("form.editTitle") : t("form.createTitle")}
						</DialogTitle>
					</DialogHeader>
					<Form {...form}>
						<form onSubmit={onSubmit} className="gap-4 flex flex-col">
							<FormField
								control={form.control}
								name="question"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("form.question")}</FormLabel>
										<FormControl>
											<Input {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="answer"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("form.answer")}</FormLabel>
										<FormControl>
											<Textarea rows={5} {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setDialogOpen(false)}
								>
									{t("form.cancel")}
								</Button>
								<Button type="submit" loading={isSaving}>
									{t("form.save")}
								</Button>
							</DialogFooter>
						</form>
					</Form>
				</DialogContent>
			</Dialog>
		</section>
	);
}
