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
import { getOrganizationMembership } from "@repo/database";

import { getBotStoreByOrganizationId, upsertBotModelSettings } from "./lib/bot-store";
import { getModelSettings } from "./procedures/get-model-settings";
import { listModels } from "./procedures/list-models";
import { saveModelSettings } from "./procedures/save-model-settings";

// 6.2：Cloudflare 缺 Account ID 或 token 不能儲存、金鑰不外露、未填不呼叫外部 API
const TEST_ENC_KEY = "vitest-only-enc-key";
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const TOKEN = "cf-token-plain-gate";
const ENCRYPTED_MARK = "ENC-MARK-SHOULD-NEVER-LEAK";
const MODEL = "@cf/meta/llama-3.1-8b-instruct";

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

const context = { context: { headers: new Headers() } };

function membershipOf(organizationId: string) {
	return {
		id: `membership-${organizationId}`,
		organizationId,
		userId: "user-1",
		role: "owner",
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

describe("cloudflare key gate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
		process.env.CREDENTIAL_ENC_KEY = TEST_ENC_KEY;
		vi.mocked(auth.api.getSession).mockResolvedValue(authenticatedSession);
		vi.mocked(getOrganizationMembership).mockResolvedValue(membershipOf("org-a"));
		vi.mocked(getBotStoreByOrganizationId).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.CREDENTIAL_ENC_KEY;
	});

	it("rejects a malformed Account ID before it can reach the URL or the database", async () => {
		await expect(
			call(
				saveModelSettings,
				{
					organizationId: "org-a",
					mode: "custom",
					provider: "cloudflare",
					modelName: MODEL,
					accountId: "../evil",
					apiKey: TOKEN,
				},
				context,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(upsertBotModelSettings).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("saving a complete Cloudflare config makes no external API call", async () => {
		await call(
			saveModelSettings,
			{
				organizationId: "org-a",
				mode: "custom",
				provider: "cloudflare",
				modelName: MODEL,
				accountId: ACCOUNT_ID,
				apiKey: TOKEN,
			},
			context,
		);

		expect(upsertBotModelSettings).toHaveBeenCalledTimes(1);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("listing models without an API Token is rejected and calls nothing external", async () => {
		await expect(
			call(
				listModels,
				{ organizationId: "org-a", provider: "cloudflare", accountId: ACCOUNT_ID },
				context,
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(fetch).not.toHaveBeenCalled();
	});

	it("reading model settings returns only the mask, never the encrypted key or the token", async () => {
		vi.mocked(getBotStoreByOrganizationId).mockResolvedValue({
			modelMode: "custom",
			modelProvider: "cloudflare",
			modelName: MODEL,
			modelBaseUrl: null,
			modelAccountId: ACCOUNT_ID,
			modelKeyEnc: ENCRYPTED_MARK,
			modelKeyMask: "••••gate",
			usePlatformModel: false,
		} as never);

		const result = await call(getModelSettings, { organizationId: "org-a" }, context);

		expect(result).toEqual({
			mode: "custom",
			provider: "cloudflare",
			modelName: MODEL,
			baseUrl: null,
			accountId: ACCOUNT_ID,
			apiKeyMask: "••••gate",
			usePlatformModel: false,
			cfOauthStatus: null,
		});
		expect(JSON.stringify(result)).not.toContain(ENCRYPTED_MARK);
		expect(JSON.stringify(result)).not.toContain(TOKEN);
	});
});
