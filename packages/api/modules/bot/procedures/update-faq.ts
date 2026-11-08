import { ORPCError } from "@orpc/server";
import { updateBotFaqByOrganizationId } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";

export const updateFaq = protectedProcedure
	.route({
		method: "PATCH",
		path: "/bot/faqs/{faqId}",
		tags: ["Bot"],
		summary: "Update bot FAQ",
		description: "Update a question and answer that belongs to the organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			faqId: z.string(),
			question: z.string().trim().min(1).max(200),
			answer: z.string().trim().min(1).max(2000),
		}),
	)
	.output(
		z.object({
			status: z.literal("updated"),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await assertOrganizationPermission(input.organizationId, user.id, "organization.manage");

		const updated = await updateBotFaqByOrganizationId(input.organizationId, input.faqId, {
			question: input.question,
			answer: input.answer,
			updatedAt: new Date(),
		});

		if (!updated) {
			throw new ORPCError("NOT_FOUND", { message: "找不到這則問答" });
		}

		return { status: "updated" as const };
	});
