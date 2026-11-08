import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

vi.mock("@repo/database", () => ({
	getOrganizationMembership: vi.fn(),
	listBotConversationsByOrganizationId: vi.fn(),
	getBotUsageCountByOrganizationId: vi.fn(),
}));

vi.mock("./lib/bot-store", () => ({
	getBotStoreByOrganizationId: vi.fn(),
	upsertBotModelSettings: vi.fn(),
	CF_OAUTH_CLEARED: {
		cfRefreshTokenEnc: null,
		cfAccessExpiresAt: null,
		cfRefreshingUntil: null,
		cfOauthStatus: null,
	},
}));

import { auth } from "@repo/auth";
import {
	getBotUsageCountByOrganizationId,
	getOrganizationMembership,
	listBotConversationsByOrganizationId,
} from "@repo/database";

import { getBotStoreByOrganizationId, upsertBotModelSettings } from "./lib/bot-store";
import { decryptSecret, encryptSecret } from "./lib/crypto";
import { getModelSettings } from "./procedures/get-model-settings";
import { getUsage } from "./procedures/get-usage";
import { listConversations } from "./procedures/list-conversations";
import { listModels } from "./procedures/list-models";
import { saveModelSettings } from "./procedures/save-model-settings";

const TEST_ENC_KEY = "vitest-only-enc-key";
const STORED_KEY = "sk-stored-plain-0009";
const NEW_KEY = "sk-new-plain-0042";

const authenticatedSession = {
	session: {
		id: "session-1",
		createdAt: new Date(),
		updatedAt: new Date(),
		userId: "user-1",
		expiresAt: new Date(Date.now() + 60_000),
		token: "session-token",
		ipAddress: null,
		userAgent: null,
		impersonatedBy: null,
		activeOrganizationId: null,
	},
	user: {
		id: "user-1",
		name: "Test User",
		email: "test@example.com",
		emailVerified: true,
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		role: "user",
		banned: null,
		banReason: null,
		banExpires: null,
		onboardingComplete: true,
		locale: null,
		twoFactorEnabled: false,
		lastActiveOrganizationId: null,
	},
} satisfies Session;

function membershipOf(organizationId: string, role: string) {
	return {
		id: `membership-${organizationId}`,
		organizationId,
		userId: "user-1",
		role,
		createdAt: new Date(),
		organization: {
			id: organizationId,
			name: `Organization ${organizationId}`,
			slug: `${organizationId}-slug`,
			logo: null,
			createdAt: new Date(),
			metadata: null,
			paymentsCustomerId: null,
		},
	} satisfies NonNullable<Awaited<ReturnType<typeof getOrganizationMembership>>>;
}

const context = { context: { headers: new Headers() } };

function conversationRow(id: string, userId: string, createdAt: Date) {
	return {
		id,
		userId,
		userText: `問題 ${id}`,
		aiText: `回覆 ${id}`,
		status: "handoff",
		createdAt,
	};
}

describe("bot console procedures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
		process.env.CREDENTIAL_ENC_KEY = TEST_ENC_KEY;
		process.env.GEMINI_API_KEY = "platform-gemini-key";
		vi.mocked(auth.api.getSession).mockResolvedValue(authenticatedSession);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.CREDENTIAL_ENC_KEY;
		delete process.env.GEMINI_API_KEY;
	});

	describe("listConversations", () => {
		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(
				call(listConversations, { organizationId: "org-a" }, context),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			expect(listBotConversationsByOrganizationId).not.toHaveBeenCalled();
		});

		it("rejects reading an organization the user does not belong to", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(null);

			await expect(
				call(listConversations, { organizationId: "org-a" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(listBotConversationsByOrganizationId).not.toHaveBeenCalled();
		});

		it("rejects reading organization B with a membership of organization A", async () => {
			vi.mocked(getOrganizationMembership).mockImplementation(async (organizationId) =>
				organizationId === "org-a" ? membershipOf("org-a", "owner") : null,
			);

			await expect(
				call(listConversations, { organizationId: "org-b" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(listBotConversationsByOrganizationId).not.toHaveBeenCalled();
		});

		it("returns guest tags instead of raw LINE user ids and reports paging", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(listBotConversationsByOrganizationId).mockResolvedValueOnce([
				conversationRow("c-1", "U1234567890abcd", new Date("2026-11-05T01:00:00Z")),
			]);

			const result = await call(
				listConversations,
				{ organizationId: "org-a", status: "handoff", offset: 0 },
				context,
			);

			expect(listBotConversationsByOrganizationId).toHaveBeenCalledWith("org-a", {
				status: "handoff",
				offset: 0,
				limit: 51,
			});
			expect(result).toEqual({
				conversations: [
					{
						id: "c-1",
						guestTag: "#abcd",
						userText: "問題 c-1",
						aiText: "回覆 c-1",
						status: "handoff",
						createdAt: "2026-11-05T01:00:00.000Z",
					},
				],
				hasMore: false,
				nextOffset: null,
			});
			expect(JSON.stringify(result)).not.toContain("U1234567890abcd");
		});

		it("drops the extra row and sets nextOffset when there is a next page", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			const rows = Array.from({ length: 51 }, (_, index) =>
				conversationRow(`c-${index}`, "Uabcd", new Date("2026-11-05T01:00:00Z")),
			);
			vi.mocked(listBotConversationsByOrganizationId).mockResolvedValueOnce(rows);

			const result = await call(listConversations, { organizationId: "org-a" }, context);

			expect(result.conversations).toHaveLength(50);
			expect(result.hasMore).toBe(true);
			expect(result.nextOffset).toBe(50);
		});
	});

	describe("getUsage", () => {
		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(
				call(getUsage, { organizationId: "org-a" }, context),
			).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			expect(getBotUsageCountByOrganizationId).not.toHaveBeenCalled();
		});

		it("rejects reading an organization the user does not belong to", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(null);

			await expect(
				call(getUsage, { organizationId: "org-a" }, context),
			).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(getBotUsageCountByOrganizationId).not.toHaveBeenCalled();
		});

		it("rejects reading organization B with a membership of organization A", async () => {
			vi.mocked(getOrganizationMembership).mockImplementation(async (organizationId) =>
				organizationId === "org-a" ? membershipOf("org-a", "owner") : null,
			);

			await expect(
				call(getUsage, { organizationId: "org-b" }, context),
			).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(getBotUsageCountByOrganizationId).not.toHaveBeenCalled();
		});

		it("returns this month's count and the limit with no sensitive fields", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotUsageCountByOrganizationId).mockResolvedValueOnce(123);

			const result = await call(getUsage, { organizationId: "org-a" }, context);

			expect(getBotUsageCountByOrganizationId).toHaveBeenCalledWith(
				"org-a",
				expect.stringMatching(/^\d{4}-\d{2}$/),
			);
			expect(result).toEqual({ month: expect.any(String), count: 123, limit: 5000 });
		});

		it("returns the store's own monthly limit when one is configured", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotUsageCountByOrganizationId).mockResolvedValueOnce(2);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				monthlyLimit: 3,
			} as Awaited<ReturnType<typeof getBotStoreByOrganizationId>>);

			const result = await call(getUsage, { organizationId: "org-a" }, context);

			expect(result).toEqual({ month: expect.any(String), count: 2, limit: 3 });
		});

		it("falls back to the platform default 5000 when the store's monthlyLimit is empty", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotUsageCountByOrganizationId).mockResolvedValueOnce(0);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				monthlyLimit: null,
			} as Awaited<ReturnType<typeof getBotStoreByOrganizationId>>);

			const result = await call(getUsage, { organizationId: "org-a" }, context);

			expect(result).toEqual({ month: expect.any(String), count: 0, limit: 5000 });
		});
	});

	describe("getModelSettings", () => {
		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(
				call(getModelSettings, { organizationId: "org-a" }, context),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
		});

		it("rejects reading an organization the user does not belong to", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(null);

			await expect(
				call(getModelSettings, { organizationId: "org-a" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
		});

		it("rejects reading organization B with a membership of organization A", async () => {
			vi.mocked(getOrganizationMembership).mockImplementation(async (organizationId) =>
				organizationId === "org-a" ? membershipOf("org-a", "owner") : null,
			);

			await expect(
				call(getModelSettings, { organizationId: "org-b" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
		});

		it("returns only the masked key and never the encrypted key", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				organizationId: "org-a",
				modelMode: "custom",
				modelProvider: "custom",
				modelName: "my-model",
				modelBaseUrl: "https://llm.example.com/v1",
				modelKeyEnc: "ENC-VALUE-SHOULD-NOT-LEAK",
				modelKeyMask: "••••0009",
			} as never);

			const result = await call(getModelSettings, { organizationId: "org-a" }, context);

			expect(result).toEqual({
				mode: "custom",
				provider: "custom",
				modelName: "my-model",
				baseUrl: "https://llm.example.com/v1",
				accountId: null,
				apiKeyMask: "••••0009",
				usePlatformModel: false,
				cfOauthStatus: null,
			});
			expect(JSON.stringify(result)).not.toContain("ENC-VALUE-SHOULD-NOT-LEAK");
		});
	});

	describe("saveModelSettings", () => {
		const input = {
			organizationId: "org-a",
			mode: "custom" as const,
			provider: "custom" as const,
			modelName: "my-model",
			baseUrl: "https://llm.example.com/v1",
			apiKey: NEW_KEY,
		};

		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(call(saveModelSettings, input, context)).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});

		it("rejects a regular member who cannot manage the organization", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "member"),
			);

			await expect(call(saveModelSettings, input, context)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});

		it("rejects saving to organization B with a membership of organization A", async () => {
			vi.mocked(getOrganizationMembership).mockImplementation(async (organizationId) =>
				organizationId === "org-a" ? membershipOf("org-a", "owner") : null,
			);

			await expect(
				call(saveModelSettings, { ...input, organizationId: "org-b" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});

		it("stores the key encrypted and returns no plaintext or encrypted key", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);

			const result = await call(saveModelSettings, input, context);

			expect(upsertBotModelSettings).toHaveBeenCalledTimes(1);
			const [organizationId, settings] = vi.mocked(upsertBotModelSettings).mock.calls[0];
			expect(organizationId).toBe("org-a");
			expect(settings.modelKeyEnc).not.toContain(NEW_KEY);
			expect(settings.modelKeyMask).toBe("••••0042");
			expect(await decryptSecret(settings.modelKeyEnc as string)).toBe(NEW_KEY);

			expect(JSON.stringify(result)).not.toContain(NEW_KEY);
			expect(JSON.stringify(result)).not.toContain(settings.modelKeyEnc as string);
			expect(result).toEqual({
				mode: "custom",
				provider: "custom",
				modelName: "my-model",
				baseUrl: "https://llm.example.com/v1",
				accountId: null,
				apiKeyMask: "••••0042",
				usePlatformModel: false,
				cfOauthStatus: null,
			});
		});

		it("keeps the stored key when a custom provider is saved without a new key", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			const storedEnc = await encryptSecret(STORED_KEY);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				modelProvider: "custom",
				modelKeyEnc: storedEnc,
				modelKeyMask: "••••0009",
			} as never);

			await call(saveModelSettings, { ...input, apiKey: undefined }, context);

			const [, settings] = vi.mocked(upsertBotModelSettings).mock.calls[0];
			expect(settings.modelKeyEnc).toBe(storedEnc);
			expect(settings.modelKeyMask).toBe("••••0009");
		});

		it("clears the key and base url when switching to a built-in provider", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				usePlatformModel: true,
			} as never);

			await call(
				saveModelSettings,
				{
					organizationId: "org-a",
					mode: "custom",
					provider: "gemini",
					modelName: "gemini-2.5-flash",
				},
				context,
			);

			const [, settings] = vi.mocked(upsertBotModelSettings).mock.calls[0];
			expect(settings).toEqual({
				modelMode: "custom",
				modelProvider: "gemini",
				modelName: "gemini-2.5-flash",
				modelBaseUrl: null,
				modelAccountId: null,
				modelKeyEnc: null,
				modelKeyMask: null,
				cfRefreshTokenEnc: null,
				cfAccessExpiresAt: null,
				cfRefreshingUntil: null,
				cfOauthStatus: null,
			});
		});

		it("rejects a custom provider with no stored key and no new key, writing nothing", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce(undefined);

			await expect(
				call(saveModelSettings, { ...input, apiKey: undefined }, context),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});

		it("restores the platform defaults when mode is platform", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);

			const result = await call(
				saveModelSettings,
				{ organizationId: "org-a", mode: "platform" },
				context,
			);

			expect(upsertBotModelSettings).toHaveBeenCalledWith(
				"org-a",
				expect.objectContaining({
					modelMode: "platform",
					modelKeyEnc: null,
					modelKeyMask: null,
				}),
			);
			expect(result).toEqual({
				mode: "platform",
				provider: "gemini",
				modelName: null,
				baseUrl: null,
				accountId: null,
				apiKeyMask: null,
				usePlatformModel: false,
				cfOauthStatus: null,
			});
		});

		it("requires the store to enter its own Gemini key when platform access is off", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);

			await expect(
				call(
					saveModelSettings,
					{ organizationId: "org-a", mode: "custom", provider: "gemini", modelName: "gemini-2.5-flash" },
					context,
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST", message: "請填入 API 金鑰" });
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});

		it("stores the store's own Gemini key encrypted and shows its mask", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);

			const result = await call(
				saveModelSettings,
				{
					organizationId: "org-a",
					mode: "custom",
					provider: "gemini",
					modelName: "gemini-2.5-flash",
					apiKey: NEW_KEY,
				},
				context,
			);

			const [, settings] = vi.mocked(upsertBotModelSettings).mock.calls[0];
			expect(await decryptSecret(settings.modelKeyEnc as string)).toBe(NEW_KEY);
			expect(result).toMatchObject({ provider: "gemini", apiKeyMask: "••••0042" });
			expect(JSON.stringify(result)).not.toContain(NEW_KEY);
		});

		it("does not reuse a stored key from another provider for Gemini", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				modelProvider: "custom",
				modelKeyEnc: await encryptSecret(STORED_KEY),
				modelKeyMask: "••••0009",
			} as never);

			await expect(
				call(
					saveModelSettings,
					{ organizationId: "org-a", mode: "custom", provider: "gemini", modelName: "gemini-2.5-flash" },
					context,
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});
	});

	describe("listModels", () => {
		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(
				call(listModels, { organizationId: "org-a", provider: "gemini" }, context),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			expect(fetch).not.toHaveBeenCalled();
		});

		it("rejects a regular member who cannot manage the organization", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "member"),
			);

			await expect(
				call(listModels, { organizationId: "org-a", provider: "gemini" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(fetch).not.toHaveBeenCalled();
		});

		it("rejects listing for organization B with a membership of organization A", async () => {
			vi.mocked(getOrganizationMembership).mockImplementation(async (organizationId) =>
				organizationId === "org-a" ? membershipOf("org-a", "owner") : null,
			);

			await expect(
				call(listModels, { organizationId: "org-b", provider: "gemini" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(fetch).not.toHaveBeenCalled();
		});

		it("returns only Flash models for Gemini and writes nothing", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				usePlatformModel: true,
			} as never);
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						data: [
							{ id: "models/gemini-2.5-pro" },
							{ id: "models/gemini-2.5-flash" },
							{ id: "models/gemini-2.0-flash-lite" },
						],
					}),
					{ status: 200 },
				),
			);

			const result = await call(
				listModels,
				{ organizationId: "org-a", provider: "gemini" },
				context,
			);

			expect(result).toEqual({ models: ["gemini-2.0-flash-lite", "gemini-2.5-flash"] });
			expect(fetch).toHaveBeenCalledWith(
				"https://generativelanguage.googleapis.com/v1beta/openai/models",
				expect.objectContaining({
					headers: { authorization: "Bearer platform-gemini-key" },
				}),
			);
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});

		it("uses the stored encrypted key when the custom key is left blank", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				modelProvider: "custom",
				modelKeyEnc: await encryptSecret(STORED_KEY),
			} as never);
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(JSON.stringify({ data: [{ id: "m-1" }] }), { status: 200 }),
			);

			const result = await call(
				listModels,
				{
					organizationId: "org-a",
					provider: "custom",
					baseUrl: "https://llm.example.com/v1",
				},
				context,
			);

			expect(result).toEqual({ models: ["m-1"] });
			expect(fetch).toHaveBeenCalledWith(
				"https://llm.example.com/v1/models",
				expect.objectContaining({
					headers: { authorization: `Bearer ${STORED_KEY}` },
				}),
			);
		});

		it("returns a clear BAD_GATEWAY error and writes nothing when the provider fails", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 500 }));

			await expect(
				call(
					listModels,
					{
						organizationId: "org-a",
						provider: "custom",
						baseUrl: "https://llm.example.com/v1",
						apiKey: NEW_KEY,
					},
					context,
				),
			).rejects.toMatchObject({
				code: "BAD_GATEWAY",
				message: "無法從供應商取得模型清單，請確認網址與金鑰後重試",
			});
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});
	});
});
