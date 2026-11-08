import { botAuditEvent, botStore, clearBotCfOauthLink, db, upsertBotCfOauthLink } from "@repo/database";
import { nanoid } from "nanoid";

import { encryptSecret, maskSecret } from "./crypto";

export function getBotStoreByOrganizationId(organizationId: string) {
	return db.query.botStore.findFirst({
		where: (store, { eq }) => eq(store.organizationId, organizationId),
	});
}

// 手動貼 Token 或改用其他供應商時，清掉 OAuth 連結狀態，避免續期把手動金鑰蓋掉
export const CF_OAUTH_CLEARED = {
	cfRefreshTokenEnc: null,
	cfAccessExpiresAt: null,
	cfRefreshingUntil: null,
	cfOauthStatus: null,
} as const;

export async function upsertBotLineBinding(
	organizationId: string,
	binding: Pick<
		typeof botStore.$inferInsert,
		"lineSecretEnc" | "lineTokenEnc" | "lineSecretMask" | "lineTokenMask" | "status" | "lineSecretVerifiedAt"
	>,
) {
	await db
		.insert(botStore)
		.values({ organizationId, createdAt: new Date(), ...binding })
		.onConflictDoUpdate({ target: botStore.organizationId, set: binding });
}

export async function upsertBotModelSettings(
	organizationId: string,
	settings: Pick<
		typeof botStore.$inferInsert,
		| "modelMode"
		| "modelProvider"
		| "modelName"
		| "modelBaseUrl"
		| "modelAccountId"
		| "modelKeyEnc"
		| "modelKeyMask"
		| "cfRefreshTokenEnc"
		| "cfAccessExpiresAt"
		| "cfRefreshingUntil"
		| "cfOauthStatus"
	>,
) {
	await db
		.insert(botStore)
		.values({ organizationId, createdAt: new Date(), ...settings })
		.onConflictDoUpdate({ target: botStore.organizationId, set: settings });
}

export async function upsertBotMonthlyLimit(organizationId: string, monthlyLimit: number | null) {
	await db
		.insert(botStore)
		.values({ organizationId, createdAt: new Date(), monthlyLimit })
		.onConflictDoUpdate({ target: botStore.organizationId, set: { monthlyLimit } });
}

export async function upsertBotUsePlatformModel(
	organizationId: string,
	usePlatformModel: boolean,
	adminUserId: string,
) {
	await db
		.insert(botStore)
		.values({ organizationId, createdAt: new Date(), usePlatformModel })
		.onConflictDoUpdate({ target: botStore.organizationId, set: { usePlatformModel } });

	await db.insert(botAuditEvent).values({
		id: nanoid(),
		organizationId,
		event: "use_platform_model_changed",
		detail: JSON.stringify({ usePlatformModel, adminUserId }),
		createdAt: new Date(),
	});
}

// 授權完成後寫入：modelKeyEnc 存目前的 access token，refresh token 另存；模型名稱只在原本就是 Cloudflare 時沿用
export async function saveCfOauthLink(
	organizationId: string,
	adminUserId: string,
	link: {
		accountId: string;
		accessToken: string;
		refreshToken: string;
		accessExpiresAt: number;
		membershipCount: number;
	},
) {
	const existing = await getBotStoreByOrganizationId(organizationId);

	await upsertBotCfOauthLink(organizationId, {
		modelMode: "custom",
		modelProvider: "cloudflare",
		modelName: existing?.modelProvider === "cloudflare" ? existing.modelName : null,
		modelBaseUrl: null,
		modelAccountId: link.accountId,
		modelKeyEnc: await encryptSecret(link.accessToken),
		modelKeyMask: maskSecret(link.accessToken),
		cfRefreshTokenEnc: await encryptSecret(link.refreshToken),
		cfAccessExpiresAt: link.accessExpiresAt,
		cfRefreshingUntil: null,
		cfOauthStatus: "linked",
	});

	await db.insert(botAuditEvent).values({
		id: nanoid(),
		organizationId,
		event: "cf_oauth_linked",
		detail: JSON.stringify({ adminUserId, membershipCount: link.membershipCount }),
		createdAt: new Date(),
	});
}

export async function disconnectCfOauthLink(organizationId: string, adminUserId: string) {
	await clearBotCfOauthLink(organizationId);

	await db.insert(botAuditEvent).values({
		id: nanoid(),
		organizationId,
		event: "cf_oauth_disconnected",
		detail: JSON.stringify({ adminUserId }),
		createdAt: new Date(),
	});
}
