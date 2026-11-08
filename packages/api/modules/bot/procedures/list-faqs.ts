import { listBotFaqsByOrganizationId } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";

export const listFaqs = protectedProcedure
	.route({
		method: "GET",
		path: "/bot/faqs",
		tags: ["Bot"],
		summary: "List bot FAQs",
		description: "List the FAQ entries of an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.output(
		z.object({
			faqs: z.array(
				z.object({
					id: z.string(),
					question: z.string().nullable(),
					answer: z.string().nullable(),
					updatedAt: z.string().nullable(),
				}),
			),
		}),
	)
	.handler(async ({ input: { organizationId }, context: { user } }) => {
		await assertOrganizationPermission(organizationId, user.id, "organization.manage");

		const rows = await listBotFaqsByOrganizationId(organizationId);

		return {
			faqs: rows.map((faq) => ({
				id: faq.id,
				question: faq.question,
				answer: faq.answer,
				updatedAt: faq.updatedAt?.toISOString() ?? null,
			})),
		};
	});
