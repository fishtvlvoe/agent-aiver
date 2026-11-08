import { eq, sql } from "drizzle-orm";

import { db } from "../client";
import { botStore } from "../schema/sqlite";

type BotStoreValues = Omit<typeof botStore.$inferInsert, "organizationId">;

// cfOauthVersion 在 SQL 端遞增，與續期時的樂觀鎖使用同一個計數
export async function upsertBotCfOauthLink(organizationId: string, values: BotStoreValues) {
	await db
		.insert(botStore)
		.values({ organizationId, createdAt: new Date(), ...values })
		.onConflictDoUpdate({
			target: botStore.organizationId,
			set: { ...values, cfOauthVersion: sql`${botStore.cfOauthVersion} + 1` },
		});
}

// 只清本地欄位與加密金鑰，不呼叫 Cloudflare 撤銷
export async function clearBotCfOauthLink(organizationId: string) {
	await db
		.update(botStore)
		.set({
			modelKeyEnc: null,
			modelKeyMask: null,
			cfRefreshTokenEnc: null,
			cfAccessExpiresAt: null,
			cfRefreshingUntil: null,
			cfOauthStatus: null,
			cfOauthVersion: sql`${botStore.cfOauthVersion} + 1`,
		})
		.where(eq(botStore.organizationId, organizationId));
}
