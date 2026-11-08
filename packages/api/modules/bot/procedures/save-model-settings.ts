import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import {
	CF_OAUTH_CLEARED,
	getBotStoreByOrganizationId,
	upsertBotModelSettings,
} from "../lib/bot-store";
import { encryptSecret, maskSecret } from "../lib/crypto";
import {
	CF_OAUTH_STATUS_VALUES,
	CLOUDFLARE_ACCOUNT_ID_PATTERN,
	toModelSettingsView,
} from "../lib/model-providers";

const platformSettings = {
	modelMode: "platform",
	modelProvider: null,
	modelName: null,
	modelBaseUrl: null,
	modelAccountId: null,
	modelKeyEnc: null,
	modelKeyMask: null,
	...CF_OAUTH_CLEARED,
};

export const saveModelSettings = protectedProcedure
	.route({
		method: "PUT",
		path: "/bot/model-settings",
		tags: ["Bot"],
		summary: "Save model settings",
		description:
			"Save the AI model settings. The API key is encrypted before storing; 'platform' restores the defaults",
	})
	.input(
		z.object({
			organizationId: z.string(),
			mode: z.enum(["platform", "custom"]),
			provider: z.enum(["gemini", "cloudflare", "custom"]).optional(),
			modelName: z.string().trim().min(1).optional(),
			baseUrl: z.string().trim().url().optional(),
			accountId: z.string().trim().regex(CLOUDFLARE_ACCOUNT_ID_PATTERN).optional(),
			apiKey: z.string().trim().min(1).optional(),
		}),
	)
	.output(
		z.object({
			mode: z.enum(["platform", "custom"]),
			provider: z.enum(["gemini", "cloudflare", "custom"]),
			modelName: z.string().nullable(),
			baseUrl: z.string().nullable(),
			accountId: z.string().nullable(),
			apiKeyMask: z.string().nullable(),
			usePlatformModel: z.boolean(),
			cfOauthStatus: z.enum(CF_OAUTH_STATUS_VALUES).nullable(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await assertOrganizationPermission(input.organizationId, user.id, "organization.manage");

		const existing = await getBotStoreByOrganizationId(input.organizationId);
		const usePlatformModel = existing?.usePlatformModel === true;

		if (input.mode === "platform") {
			await upsertBotModelSettings(input.organizationId, platformSettings);
			return toModelSettingsView({ ...platformSettings, usePlatformModel });
		}

		if (!input.provider || !input.modelName) {
			throw new ORPCError("BAD_REQUEST", { message: "請選擇供應商與模型名稱" });
		}

		const isCustom = input.provider === "custom";
		if (isCustom && !input.baseUrl) {
			throw new ORPCError("BAD_REQUEST", { message: "自訂供應商需要服務網址" });
		}

		// Cloudflare 必須同時有 Account ID 與 API Token，缺一不存
		const isCloudflare = input.provider === "cloudflare";
		if (isCloudflare && !input.accountId) {
			throw new ORPCError("BAD_REQUEST", { message: "請填入 Cloudflare Account ID" });
		}

		// 沒填新金鑰時沿用同一供應商已存的加密金鑰；沒有舊值時，自訂供應商、Cloudflare 與未開通平台模型的 Gemini 必須填
		const keyProvider = isCustom || input.provider === "gemini" || isCloudflare;
		const reusable =
			existing?.modelKeyEnc && existing.modelProvider === input.provider ? existing : null;
		let keyEnc: string | null = null;
		let keyMask: string | null = null;

		if (keyProvider && input.apiKey) {
			keyEnc = await encryptSecret(input.apiKey);
			keyMask = maskSecret(input.apiKey);
		} else if (keyProvider && reusable) {
			keyEnc = reusable.modelKeyEnc;
			keyMask = reusable.modelKeyMask;
		} else if (isCustom || isCloudflare || (input.provider === "gemini" && !usePlatformModel)) {
			throw new ORPCError("BAD_REQUEST", { message: "請填入 API 金鑰" });
		}

		// 手動貼了新 Token，或不是 Cloudflare：OAuth 連結狀態一併清掉；沿用既有金鑰時保留連結
		const keepCfOauth = isCloudflare && !input.apiKey;

		const settings = {
			modelMode: "custom",
			modelProvider: input.provider,
			modelName: input.modelName,
			modelBaseUrl: isCustom ? (input.baseUrl ?? null) : null,
			modelAccountId: isCloudflare ? (input.accountId ?? null) : null,
			modelKeyEnc: keyEnc,
			modelKeyMask: keyMask,
			...(keepCfOauth ? {} : CF_OAUTH_CLEARED),
		};

		await upsertBotModelSettings(input.organizationId, settings);

		return toModelSettingsView({ ...settings, usePlatformModel });
	});
