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
	upsertBotLineBinding: vi.fn(),
}));

import { auth } from "@repo/auth";
import { getOrganizationMembership } from "@repo/database";

import { getBotStoreByOrganizationId, upsertBotLineBinding } from "./lib/bot-store";
import { decryptSecret } from "./lib/crypto";
import { bindLine } from "./procedures/bind-line";
import { getStore } from "./procedures/get-store";
import { getWebhookUrl } from "./procedures/get-webhook-url";

const CHANNEL_SECRET = "channel-secret-plain-0001";
const ACCESS_TOKEN = "access-token-plain-0002";
const TEST_ENC_KEY = "vitest-only-enc-key";

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

describe("bot procedures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal("fetch", vi.fn());
		process.env.CREDENTIAL_ENC_KEY = TEST_ENC_KEY;
		vi.mocked(auth.api.getSession).mockResolvedValue(authenticatedSession);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.CREDENTIAL_ENC_KEY;
		delete process.env.BOT_WEBHOOK_BASE_URL;
	});

	it("(a) rejects unauthenticated requests", async () => {
		vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

		await expect(
			call(getStore, { organizationId: "org-a" }, context),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
	});

	it("(b) rejects reading an organization the user does not belong to", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(null);

		await expect(
			call(getStore, { organizationId: "org-b" }, context),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
	});

	it("(c) rejects binding by a regular member who cannot manage the organization", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "member"));

		await expect(
			call(
				bindLine,
				{ organizationId: "org-a", channelSecret: CHANNEL_SECRET, accessToken: ACCESS_TOKEN },
				context,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(fetch).not.toHaveBeenCalled();
		expect(upsertBotLineBinding).not.toHaveBeenCalled();
	});

	it("(d) keeps stored data unchanged when LINE rejects the access token", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "admin"));
		vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));

		await expect(
			call(
				bindLine,
				{ organizationId: "org-a", channelSecret: CHANNEL_SECRET, accessToken: ACCESS_TOKEN },
				context,
			),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "金鑰無效，請確認後重試",
		});
		expect(upsertBotLineBinding).not.toHaveBeenCalled();
	});

	it("(e) stores only encrypted secrets and masks, and returns no plaintext", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));
		vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));

		const result = await call(
			bindLine,
			{ organizationId: "org-a", channelSecret: CHANNEL_SECRET, accessToken: ACCESS_TOKEN },
			context,
		);

		expect(fetch).toHaveBeenCalledWith("https://api.line.me/v2/bot/info", {
			headers: { authorization: `Bearer ${ACCESS_TOKEN}` },
		});
		expect(upsertBotLineBinding).toHaveBeenCalledTimes(1);

		const [organizationId, binding] = vi.mocked(upsertBotLineBinding).mock.calls[0];
		expect(organizationId).toBe("org-a");
		expect(binding.status).toBe("bound");
		expect(binding.lineSecretMask).toBe("••••0001");
		expect(binding.lineTokenMask).toBe("••••0002");
		expect(binding.lineSecretEnc).not.toContain(CHANNEL_SECRET);
		expect(binding.lineTokenEnc).not.toContain(ACCESS_TOKEN);
		expect(await decryptSecret(binding.lineSecretEnc as string)).toBe(CHANNEL_SECRET);
		expect(await decryptSecret(binding.lineTokenEnc as string)).toBe(ACCESS_TOKEN);

		expect(JSON.stringify(result)).not.toContain(CHANNEL_SECRET);
		expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
		expect(result).toEqual({
			status: "bound",
			lineSecretMask: "••••0001",
			lineTokenMask: "••••0002",
		});
	});

	it("(f) rejects reading organization B with a membership of organization A", async () => {
		vi.mocked(getOrganizationMembership).mockImplementation(async (organizationId) =>
			organizationId === "org-a" ? membershipOf("org-a", "owner") : null,
		);

		await expect(
			call(getStore, { organizationId: "org-b" }, context),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
	});

	it("(g) returns the complete webhook URL built from the organization slug", async () => {
		process.env.BOT_WEBHOOK_BASE_URL = "https://bot.example.com";
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));

		const result = await call(getWebhookUrl, { organizationId: "org-a" }, context);

		expect(result).toEqual({
			webhookUrl: "https://bot.example.com/webhook/org-a-slug",
		});
	});

	it("(g2) strips trailing slashes from BOT_WEBHOOK_BASE_URL", async () => {
		process.env.BOT_WEBHOOK_BASE_URL = "https://bot.example.com//";
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));

		const result = await call(getWebhookUrl, { organizationId: "org-a" }, context);

		expect(result).toEqual({
			webhookUrl: "https://bot.example.com/webhook/org-a-slug",
		});
	});

	it("(g3) fails with 500 instead of returning an undefined URL when BOT_WEBHOOK_BASE_URL is missing", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));

		await expect(
			call(getWebhookUrl, { organizationId: "org-a" }, context),
		).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message: "缺少 BOT_WEBHOOK_BASE_URL 設定，無法產生 webhook 網址",
		});
	});

	it("(h) fails with 500 and writes nothing when CREDENTIAL_ENC_KEY is missing", async () => {
		delete process.env.CREDENTIAL_ENC_KEY;
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));
		vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));

		await expect(
			call(
				bindLine,
				{ organizationId: "org-a", channelSecret: CHANNEL_SECRET, accessToken: ACCESS_TOKEN },
				context,
			),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
		expect(upsertBotLineBinding).not.toHaveBeenCalled();
	});
});
