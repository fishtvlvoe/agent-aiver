import { ORPCError } from "@orpc/server";
import { getOrganizationBrief } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { upsertBotMonthlyLimit } from "../lib/bot-store";
import { resolveMonthlyLimit } from "../lib/usage";

const MAX_MONTHLY_LIMIT = 1_000_000;

// 平台管理員調整店家每月 AI 回覆上限；null 代表還原平台預設（5000）
export const setMonthlyLimit = adminProcedure
	.route({
		method: "PUT",
		path: "/bot/admin/stores/{organizationId}/monthly-limit",
		tags: ["Bot"],
		summary: "Set store monthly limit",
		description:
			"Platform admin only. Set 1 to 1000000, or null to restore the platform default",
	})
	.input(
		z.object({
			organizationId: z.string(),
			limit: z.number().int().min(1).max(MAX_MONTHLY_LIMIT).nullable(),
		}),
	)
	.output(
		z.object({
			organizationId: z.string(),
			monthlyLimit: z.number().nullable(),
			limit: z.number(),
		}),
	)
	.handler(async ({ input: { organizationId, limit } }) => {
		const organization = await getOrganizationBrief(organizationId);

		if (!organization) {
			throw new ORPCError("NOT_FOUND");
		}

		await upsertBotMonthlyLimit(organizationId, limit);

		return {
			organizationId,
			monthlyLimit: limit,
			limit: resolveMonthlyLimit(limit),
		};
	});
