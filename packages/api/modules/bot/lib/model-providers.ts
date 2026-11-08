import { z } from "zod";

export const MODEL_PROVIDERS = ["gemini", "cloudflare", "custom"] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

export const MODEL_LIST_TIMEOUT_MS = 8_000;

const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";

// Cloudflare Account ID 為 32 位十六進位字元；先驗證格式，避免被拼進網址路徑
export const CLOUDFLARE_ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;

const openAiModelListSchema = z.object({
	data: z.array(z.object({ id: z.string() })),
});

const cloudflareModelSearchSchema = z.object({
	success: z.boolean(),
	result: z.array(z.object({ name: z.string() })),
});

export function isModelProvider(value: string | null | undefined): value is ModelProvider {
	return MODEL_PROVIDERS.includes(value as ModelProvider);
}

// 店家畫面看到的模型設定；沒有自訂設定時一律顯示 Gemini 預設
export function toModelSettingsView(
	store:
		| {
				modelMode: string | null;
				modelProvider: string | null;
				modelName: string | null;
				modelBaseUrl: string | null;
				modelKeyMask: string | null;
				modelAccountId?: string | null;
				usePlatformModel?: boolean | null;
				cfOauthStatus?: string | null;
		  }
		| null
		| undefined,
) {
	const usePlatformModel = store?.usePlatformModel === true;

	if (store?.modelMode !== "custom") {
		return {
			mode: "platform" as const,
			provider: "gemini" as ModelProvider,
			modelName: null,
			baseUrl: null,
			accountId: null,
			apiKeyMask: null,
			usePlatformModel,
			cfOauthStatus: null,
		};
	}

	const provider = isModelProvider(store.modelProvider) ? store.modelProvider : "custom";
	// 只有 linked / invalid 兩種有效狀態，其餘（含未連結）一律視為 null
	const cfOauthStatus: CfOauthStatusView =
		provider === "cloudflare" && (store.cfOauthStatus === "linked" || store.cfOauthStatus === "invalid")
			? store.cfOauthStatus
			: null;

	return {
		mode: "custom" as const,
		provider,
		modelName: store.modelName,
		baseUrl: provider === "custom" ? store.modelBaseUrl : null,
		accountId: provider === "cloudflare" ? (store.modelAccountId ?? null) : null,
		apiKeyMask: store.modelKeyMask,
		usePlatformModel,
		cfOauthStatus,
	};
}

export const CF_OAUTH_STATUS_VALUES = ["linked", "invalid"] as const;
export type CfOauthStatusView = (typeof CF_OAUTH_STATUS_VALUES)[number] | null;

// 從供應商拉模型清單。失敗一律丟錯，由呼叫端轉成明確訊息；不寫任何資料
export async function fetchProviderModels({
	provider,
	baseUrl,
	apiKey,
	accountId,
}: {
	provider: ModelProvider;
	baseUrl?: string | null;
	apiKey?: string | null;
	accountId?: string | null;
}): Promise<string[]> {
	if (provider === "cloudflare") {
		// 用店家自己的 Account ID 與 API Token 即時查 Workers AI 目錄，不寫死模型
		if (!accountId || !apiKey) {
			throw new Error("cloudflare provider requires accountId and apiKey");
		}
		return fetchCloudflareTextModelNames(accountId, apiKey);
	}

	if (provider === "gemini") {
		// 有傳入金鑰用店家自己的；沒有才用平台金鑰（呼叫端已確認店家有權使用）
		const geminiKey = apiKey ?? process.env.GEMINI_API_KEY;
		if (!geminiKey) {
			throw new Error("GEMINI_API_KEY is not configured");
		}
		const ids = await fetchOpenAiModelIds(GEMINI_OPENAI_BASE_URL, geminiKey);
		// 只列 Flash 系列（免費額度內可用），去掉 Google 回傳的 models/ 前綴
		return ids
			.map((id) => id.replace(/^models\//, ""))
			.filter((id) => /flash/i.test(id))
			.sort();
	}

	if (!baseUrl || !apiKey) {
		throw new Error("custom provider requires baseUrl and apiKey");
	}
	// 自訂供應商無法判斷哪些模型免費，因此全部列出
	return (await fetchOpenAiModelIds(baseUrl, apiKey)).sort();
}

async function fetchOpenAiModelIds(baseUrl: string, apiKey: string) {
	const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
		headers: { authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`provider responded with ${response.status}`);
	}

	const parsed = openAiModelListSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new Error("provider returned an unexpected model list");
	}

	return parsed.data.data.map((model) => model.id);
}

async function fetchCloudflareTextModelNames(accountId: string, apiKey: string) {
	const url = `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/ai/models/search?task=${encodeURIComponent("Text Generation")}`;
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
	});

	if (!response.ok) {
		throw new Error(`cloudflare responded with ${response.status}`);
	}

	const parsed = cloudflareModelSearchSchema.safeParse(await response.json());
	if (!parsed.success || !parsed.data.success) {
		throw new Error("cloudflare returned an unexpected model list");
	}

	return parsed.data.result.map((model) => model.name).sort();
}
