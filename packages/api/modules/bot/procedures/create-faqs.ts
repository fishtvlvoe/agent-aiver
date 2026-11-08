import { insertBotFaqs } from "@repo/database";
import { nanoid } from "nanoid";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import {
	FAQ_ANSWER_MAX_LENGTH,
	FAQ_BULK_MAX_ITEMS,
	FAQ_QUESTION_MAX_LENGTH,
} from "../lib/faq-bulk-parse";

export const createFaqs = protectedProcedure
	.route({
		method: "POST",
		path: "/bot/faqs/bulk",
		tags: ["Bot"],
		summary: "Create bot FAQs in bulk",
		description:
			"Add multiple questions and answers to the knowledge base in one write; any invalid item rejects the whole batch",
	})
	.input(
		z.object({
			organizationId: z.string(),
			faqs: z
				.array(
					z.object({
						question: z.string().trim().min(1).max(FAQ_QUESTION_MAX_LENGTH),
						answer: z.string().trim().min(1).max(FAQ_ANSWER_MAX_LENGTH),
					}),
				)
				.min(1)
				.max(FAQ_BULK_MAX_ITEMS),
		}),
	)
	.output(
		z.object({
			count: z.number(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await assertOrganizationPermission(input.organizationId, user.id, "organization.manage");

		const updatedAt = new Date();

		await insertBotFaqs(
			input.faqs.map((faq) => ({
				id: nanoid(),
				organizationId: input.organizationId,
				question: faq.question,
				answer: faq.answer,
				updatedAt,
			})),
		);

		return { count: input.faqs.length };
	});
