import { listBotStoreAdminRows } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { getTaipeiMonthKey, resolveMonthlyLimit } from "../lib/usage";

// 平台中台店家總覽：只回傳列表需要的欄位，不回傳任何 enc（加密金鑰）欄位
export const listStores = adminProcedure
	.route({
		method: "GET",
		path: "/bot/admin/stores",
		tags: ["Bot"],
		summary: "List all bot stores",
		description:
			"Platform admin only. All organizations with bot status, this month's replies and limit",
	})
	.output(
		z.object({
			month: z.string(),
			stores: z.array(
				z.object({
					organizationId: z.string(),
					name: z.string(),
					status: z.string(),
					monthlyLimit: z.number().nullable(),
					limit: z.number(),
					usePlatformModel: z.boolean(),
					monthCount: z.number(),
					handoffCount: z.number(),
					missedCount: z.number(),
				}),
			),
		}),
	)
	.handler(async () => {
		const month = getTaipeiMonthKey();
		const rows = await listBotStoreAdminRows(month);

		return {
			month,
			stores: rows.map((row) => ({
				organizationId: row.organizationId,
				name: row.name,
				status: row.status ?? "unbound",
				monthlyLimit: row.monthlyLimit ?? null,
				limit: resolveMonthlyLimit(row.monthlyLimit),
				usePlatformModel: row.usePlatformModel === true,
				monthCount: Number(row.monthCount ?? 0),
				handoffCount: Number(row.handoffCount ?? 0),
				missedCount: Number(row.missedCount ?? 0),
			})),
		};
	});
