import { asc, eq, sql } from "drizzle-orm";

import { db } from "../client";
import { botConversation, botStore, botUsageCounter, organization } from "../schema/sqlite";

// 平台中台：所有組織（沒有 bot_store 列的視為未綁定），附本月回覆數與待真人／未命中數（全期間）
export function listBotStoreAdminRows(month: string) {
	return db
		.select({
			organizationId: organization.id,
			name: organization.name,
			status: botStore.status,
			monthlyLimit: botStore.monthlyLimit,
			usePlatformModel: botStore.usePlatformModel,
			monthCount: sql<number>`(SELECT COALESCE(SUM(${botUsageCounter.count}), 0) FROM ${botUsageCounter} WHERE ${botUsageCounter.organizationId} = ${organization.id} AND ${botUsageCounter.month} = ${month})`,
			handoffCount: sql<number>`(SELECT COUNT(*) FROM ${botConversation} WHERE ${botConversation.organizationId} = ${organization.id} AND ${botConversation.status} = 'handoff')`,
			missedCount: sql<number>`(SELECT COUNT(*) FROM ${botConversation} WHERE ${botConversation.organizationId} = ${organization.id} AND ${botConversation.status} = 'missed')`,
		})
		.from(organization)
		.leftJoin(botStore, eq(botStore.organizationId, organization.id))
		.orderBy(asc(organization.name));
}

export async function getBotAdminTotals(month: string) {
	const [stores] = await db.select({ count: sql<number>`count(*)` }).from(organization);
	const [bound] = await db
		.select({ count: sql<number>`count(*)` })
		.from(botStore)
		.where(eq(botStore.status, "bound"));
	const [replies] = await db
		.select({ total: sql<number>`COALESCE(SUM(${botUsageCounter.count}), 0)` })
		.from(botUsageCounter)
		.where(eq(botUsageCounter.month, month));
	const [handoff] = await db
		.select({ count: sql<number>`count(*)` })
		.from(botConversation)
		.where(eq(botConversation.status, "handoff"));

	return {
		stores: Number(stores?.count ?? 0),
		bound: Number(bound?.count ?? 0),
		monthReplies: Number(replies?.total ?? 0),
		pendingHandoff: Number(handoff?.count ?? 0),
	};
}

export async function getOrganizationBrief(organizationId: string) {
	const rows = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);
	return rows.length > 0 ? rows[0] : null;
}
