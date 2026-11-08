import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import { getBotStoreByOrganizationId } from "../lib/bot-store";
import { decryptSecret } from "../lib/crypto";
import { CLOUDFLARE_ACCOUNT_ID_PATTERN, fetchProviderModels } from "../lib/model-providers";

const LIST_FAILED_MESSAGE = "無法從供應商取得模型清單，請確認網址與金鑰後重試";
const CLOUDFLARE_LIST_FAILED_MESSAGE =
	"無法取得 Cloudflare 模型清單，請確認 Account ID 與 API Token 是否正確，且已開通 Workers AI 權限";

// 只拉清單、不寫入任何資料；失敗不影響已存的設定
export const listModels = protectedProcedure
	.route({
		method: "POST",
		path: "/bot/model-list",
		tags: ["Bot"],
		summary: "List provider models",
		description: "Fetch the free-usable model list from the provider without saving anything",
	})
	.input(
		z.object({
			organizationId: z.string(),
			provider: z.enum(["gemini", "cloudflare", "custom"]),
			baseUrl: z.string().trim().url().optional(),
			accountId: z.string().trim().regex(CLOUDFLARE_ACCOUNT_ID_PATTERN).optional(),
			apiKey: z.string().trim().min(1).optional(),
		}),
	)
	.output(
		z.object({
			models: z.array(z.string()),
			error: z.string().optional(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await assertOrganizationPermission(input.organizationId, user.id, "organization.manage");

		const store = await getBotStoreByOrganizationId(input.organizationId);
		const sameProviderStore = store?.modelProvider === input.provider ? store : null;
		let apiKey = input.apiKey;
		if (!apiKey && sameProviderStore?.modelKeyEnc) {
			// 金鑰留空時使用同一供應商已存的加密金鑰
			apiKey = await decryptSecret(sameProviderStore.modelKeyEnc);
		}

		if (input.provider === "cloudflare") {
			const accountId = input.accountId ?? sameProviderStore?.modelAccountId;
			if (!accountId) {
				throw new ORPCError("BAD_REQUEST", { message: "請填入 Cloudflare Account ID" });
			}
			if (!apiKey) {
				throw new ORPCError("BAD_REQUEST", { message: "請填入 Cloudflare API Token" });
			}
			try {
				const models = await fetchProviderModels({ provider: "cloudflare", accountId, apiKey });
				return { models };
			} catch {
				// Cloudflare 失敗回空清單與錯誤訊息，不沿用舊清單、不寫死模型
				return { models: [], error: CLOUDFLARE_LIST_FAILED_MESSAGE };
			}
		}

		const usesPlatformKey = input.provider === "gemini" && store?.usePlatformModel === true;
		if (!apiKey && !usesPlatformKey) {
			throw new ORPCError("BAD_REQUEST", { message: "請填入 API 金鑰" });
		}

		try {
			const models = await fetchProviderModels({
				provider: input.provider,
				baseUrl: input.baseUrl,
				apiKey,
			});
			return { models };
		} catch {
			throw new ORPCError("BAD_GATEWAY", { message: LIST_FAILED_MESSAGE });
		}
	});
