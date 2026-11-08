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
import { decryptSecret } from "./lib/crypto";
import { listModels } from "./procedures/list-models";
import { saveModelSettings } from "./procedures/save-model-settings";

const TEST_ENC_KEY = "vitest-only-enc-key";
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const TOKEN = "cf-token-plain-0007";

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

describe("cloudflare provider", () => {
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

	describe("saveModelSettings", () => {
		it("refuses to save cloudflare without an Account ID", async () => {
			await expect(
				call(
					saveModelSettings,
					{
						organizationId: "org-a",
						mode: "custom",
						provider: "cloudflare",
						modelName: "@cf/meta/llama-3.1-8b-instruct",
						apiKey: TOKEN,
					},
					context,
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});

		it("refuses to save cloudflare without an API Token", async () => {
			await expect(
				call(
					saveModelSettings,
					{
						organizationId: "org-a",
						mode: "custom",
						provider: "cloudflare",
						modelName: "@cf/meta/llama-3.1-8b-instruct",
						accountId: ACCOUNT_ID,
					},
					context,
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(upsertBotModelSettings).not.toHaveBeenCalled();
		});

		it("encrypts the token and never returns or stores it in plain text", async () => {
			const result = await call(
				saveModelSettings,
				{
					organizationId: "org-a",
					mode: "custom",
					provider: "cloudflare",
					modelName: "@cf/meta/llama-3.1-8b-instruct",
					accountId: ACCOUNT_ID,
					apiKey: TOKEN,
				},
				context,
			);

			expect(upsertBotModelSettings).toHaveBeenCalledTimes(1);
			const [, saved] = vi.mocked(upsertBotModelSettings).mock.calls[0];
			expect(saved.modelAccountId).toBe(ACCOUNT_ID);
			expect(saved.modelKeyEnc).toBeTruthy();
			expect(saved.modelKeyEnc).not.toContain(TOKEN);
			expect(await decryptSecret(saved.modelKeyEnc as string)).toBe(TOKEN);
			expect(JSON.stringify(saved)).not.toContain(TOKEN);
			expect(JSON.stringify(result)).not.toContain(TOKEN);
			expect(result).toMatchObject({ provider: "cloudflare", accountId: ACCOUNT_ID });
		});
	});

	describe("listModels", () => {
		it("refuses without an Account ID", async () => {
			await expect(
				call(
					listModels,
					{ organizationId: "org-a", provider: "cloudflare", apiKey: TOKEN },
					context,
				),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			expect(fetch).not.toHaveBeenCalled();
		});

		it("calls the account model search with the Bearer token and returns the names", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						success: true,
						result: [{ name: "@cf/meta/llama-3.1-8b-instruct" }],
					}),
					{ status: 200 },
				),
			);

			const result = await call(
				listModels,
				{ organizationId: "org-a", provider: "cloudflare", accountId: ACCOUNT_ID, apiKey: TOKEN },
				context,
			);

			const [url, init] = vi.mocked(fetch).mock.calls[0];
			expect(String(url)).toBe(
				`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/models/search?task=Text%20Generation`,
			);
			expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
			expect(result).toEqual({ models: ["@cf/meta/llama-3.1-8b-instruct"] });
		});

		it("returns an empty list with an error message when Cloudflare fails", async () => {
			vi.mocked(fetch).mockResolvedValueOnce(new Response("denied", { status: 403 }));

			const result = await call(
				listModels,
				{ organizationId: "org-a", provider: "cloudflare", accountId: ACCOUNT_ID, apiKey: TOKEN },
				context,
			);

			expect(result.models).toEqual([]);
			expect(result.error).toEqual(expect.any(String));
			expect(JSON.stringify(result)).not.toContain(TOKEN);
		});
	});
});
