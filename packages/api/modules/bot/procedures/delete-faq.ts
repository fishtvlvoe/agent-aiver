import { ORPCError } from "@orpc/server";
import { deleteBotFaqByOrganizationId } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";

export const deleteFaq = protectedProcedure
	.route({
		method: "DELETE",
		path: "/bot/faqs/{faqId}",
		tags: ["Bot"],
		summary: "Delete bot FAQ",
		description: "Delete a question and answer that belongs to the organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			faqId: z.string(),
		}),
	)
	.output(
		z.object({
			status: z.literal("deleted"),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await assertOrganizationPermission(input.organizationId, user.id, "organization.manage");

		const deleted = await deleteBotFaqByOrganizationId(input.organizationId, input.faqId);

		if (!deleted) {
			throw new ORPCError("NOT_FOUND", { message: "找不到這則問答" });
		}

		return { status: "deleted" as const };
	});
