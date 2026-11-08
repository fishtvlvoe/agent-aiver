import { insertBotFaq } from "@repo/database";
import { nanoid } from "nanoid";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";

export const createFaq = protectedProcedure
	.route({
		method: "POST",
		path: "/bot/faqs",
		tags: ["Bot"],
		summary: "Create bot FAQ",
		description: "Add a question and answer to the knowledge base of an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			question: z.string().trim().min(1).max(200),
			answer: z.string().trim().min(1).max(2000),
		}),
	)
	.output(
		z.object({
			id: z.string(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await assertOrganizationPermission(input.organizationId, user.id, "organization.manage");

		const id = nanoid();

		await insertBotFaq({
			id,
			organizationId: input.organizationId,
			question: input.question,
			answer: input.answer,
			updatedAt: new Date(),
		});

		return { id };
	});
