import { getBotUsageCountByOrganizationId } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import { getBotStoreByOrganizationId } from "../lib/bot-store";
import { getTaipeiMonthKey, resolveMonthlyLimit } from "../lib/usage";

export const getUsage = protectedProcedure
	.route({
		method: "GET",
		path: "/bot/usage",
		tags: ["Bot"],
		summary: "Get bot usage",
		description: "Get this month's AI reply count and the monthly limit (read only)",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.output(
		z.object({
			month: z.string(),
			count: z.number(),
			limit: z.number(),
		}),
	)
	.handler(async ({ input: { organizationId }, context: { user } }) => {
		await assertOrganizationPermission(organizationId, user.id, "organization.manage");

		const month = getTaipeiMonthKey();
		const count = await getBotUsageCountByOrganizationId(organizationId, month);
		const store = await getBotStoreByOrganizationId(organizationId);

		return { month, count, limit: resolveMonthlyLimit(store?.monthlyLimit) };
	});
