import { and, eq } from "drizzle-orm";

import { db } from "../client";
import { botUsageCounter } from "../schema/sqlite";

// 沒有該月紀錄時回傳 0
export async function getBotUsageCountByOrganizationId(organizationId: string, month: string) {
	const rows = await db
		.select({ count: botUsageCounter.count })
		.from(botUsageCounter)
		.where(
			and(
				eq(botUsageCounter.organizationId, organizationId),
				eq(botUsageCounter.month, month),
			),
		)
		.limit(1);
	return rows[0]?.count ?? 0;
}
