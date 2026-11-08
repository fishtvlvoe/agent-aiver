import { getBotAdminTotals } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { getTaipeiMonthKey } from "../lib/usage";

export const getTotals = adminProcedure
	.route({
		method: "GET",
		path: "/bot/admin/totals",
		tags: ["Bot"],
		summary: "Get bot platform totals",
		description:
			"Platform admin only. Store count, bound count, this month's replies and pending handoffs",
	})
	.output(
		z.object({
			month: z.string(),
			stores: z.number().int().nonnegative(),
			bound: z.number().int().nonnegative(),
			monthReplies: z.number().int().nonnegative(),
			pendingHandoff: z.number().int().nonnegative(),
		}),
	)
	.handler(async () => {
		const month = getTaipeiMonthKey();
		const totals = await getBotAdminTotals(month);

		return { month, ...totals };
	});
