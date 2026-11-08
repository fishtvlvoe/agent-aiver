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
	listBotStoreAdminRows: vi.fn(),
	getBotAdminTotals: vi.fn(),
	getOrganizationBrief: vi.fn(),
}));

vi.mock("./lib/bot-store", () => ({
	upsertBotMonthlyLimit: vi.fn(),
	upsertBotUsePlatformModel: vi.fn(),
}));

import { auth } from "@repo/auth";
import { getBotAdminTotals, getOrganizationBrief, listBotStoreAdminRows } from "@repo/database";

import { upsertBotMonthlyLimit, upsertBotUsePlatformModel } from "./lib/bot-store";
import { getTotals } from "./procedures/admin-get-totals";
import { listStores } from "./procedures/admin-list-stores";
import { setMonthlyLimit } from "./procedures/admin-set-monthly-limit";
import { setUsePlatformModel } from "./procedures/admin-set-use-platform-model";

function sessionWithRole(role: string) {
	return {
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
			role,
			banned: null,
			banReason: null,
			banExpires: null,
			onboardingComplete: true,
			locale: null,
			twoFactorEnabled: false,
			lastActiveOrganizationId: null,
		},
	} satisfies Session;
}

const context = { context: { headers: new Headers() } };

const ENC_SECRET = "enc-secret-should-not-leak";

function storeRow(overrides: Record<string, unknown> = {}) {
	return {
		organizationId: "org-a",
		name: "店家 A",
		status: "bound",
		monthlyLimit: null,
		monthCount: 12,
		handoffCount: 2,
		missedCount: 3,
		lineSecretEnc: ENC_SECRET,
		lineTokenEnc: ENC_SECRET,
		modelKeyEnc: ENC_SECRET,
		...overrides,
	};
}

describe("bot platform admin procedures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(auth.api.getSession).mockResolvedValue(sessionWithRole("admin"));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("listStores", () => {
		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(call(listStores, undefined, context)).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			expect(listBotStoreAdminRows).not.toHaveBeenCalled();
		});

		it("rejects a store owner who is not a platform admin", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(sessionWithRole("user"));

			await expect(call(listStores, undefined, context)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(listBotStoreAdminRows).not.toHaveBeenCalled();
		});

		it("returns stores with the default limit and never returns enc fields", async () => {
			vi.mocked(listBotStoreAdminRows).mockResolvedValueOnce([
				storeRow(),
				storeRow({
					organizationId: "org-b",
					name: "店家 B",
					status: null,
					monthlyLimit: 300,
				}),
			] as never);

			const result = await call(listStores, undefined, context);

			expect(result.stores).toEqual([
				{
					organizationId: "org-a",
					name: "店家 A",
					status: "bound",
					monthlyLimit: null,
					limit: 5000,
					usePlatformModel: false,
					monthCount: 12,
					handoffCount: 2,
					missedCount: 3,
				},
				{
					organizationId: "org-b",
					name: "店家 B",
					status: "unbound",
					monthlyLimit: 300,
					limit: 300,
					usePlatformModel: false,
					monthCount: 12,
					handoffCount: 2,
					missedCount: 3,
				},
			]);
			expect(JSON.stringify(result)).not.toContain(ENC_SECRET);
			expect(JSON.stringify(result)).not.toContain("Enc");
		});
	});

	describe("getTotals", () => {
		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(call(getTotals, undefined, context)).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			expect(getBotAdminTotals).not.toHaveBeenCalled();
		});

		it("rejects a store owner who is not a platform admin", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(sessionWithRole("user"));

			await expect(call(getTotals, undefined, context)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(getBotAdminTotals).not.toHaveBeenCalled();
		});

		it("returns totals without any enc field", async () => {
			vi.mocked(getBotAdminTotals).mockResolvedValueOnce({
				stores: 5,
				bound: 3,
				monthReplies: 420,
				pendingHandoff: 7,
			});

			const result = await call(getTotals, undefined, context);

			expect(result).toMatchObject({
				stores: 5,
				bound: 3,
				monthReplies: 420,
				pendingHandoff: 7,
			});
			expect(Object.keys(result).some((key) => key.toLowerCase().includes("enc"))).toBe(
				false,
			);
		});
	});

	describe("setMonthlyLimit", () => {
		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(
				call(setMonthlyLimit, { organizationId: "org-a", limit: 100 }, context),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			expect(upsertBotMonthlyLimit).not.toHaveBeenCalled();
		});

		it("rejects a store owner who is not a platform admin", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(sessionWithRole("user"));

			await expect(
				call(setMonthlyLimit, { organizationId: "org-a", limit: 100 }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(upsertBotMonthlyLimit).not.toHaveBeenCalled();
		});

		it.each([0, -1, 1.5, 1_000_001])("rejects invalid limit %s", async (limit) => {
			vi.mocked(getOrganizationBrief).mockResolvedValue({ id: "org-a" });

			await expect(
				call(setMonthlyLimit, { organizationId: "org-a", limit }, context),
			).rejects.toThrow();
			expect(upsertBotMonthlyLimit).not.toHaveBeenCalled();
		});

		it.each([1, 1_000_000])("accepts boundary limit %s", async (limit) => {
			vi.mocked(getOrganizationBrief).mockResolvedValueOnce({ id: "org-a" });

			const result = await call(setMonthlyLimit, { organizationId: "org-a", limit }, context);

			expect(upsertBotMonthlyLimit).toHaveBeenCalledWith("org-a", limit);
			expect(result).toEqual({ organizationId: "org-a", monthlyLimit: limit, limit });
		});

		it("restores the platform default when limit is null", async () => {
			vi.mocked(getOrganizationBrief).mockResolvedValueOnce({ id: "org-a" });

			const result = await call(
				setMonthlyLimit,
				{ organizationId: "org-a", limit: null },
				context,
			);

			expect(upsertBotMonthlyLimit).toHaveBeenCalledWith("org-a", null);
			expect(result).toEqual({ organizationId: "org-a", monthlyLimit: null, limit: 5000 });
		});

		it("returns NOT_FOUND for an unknown organization", async () => {
			vi.mocked(getOrganizationBrief).mockResolvedValueOnce(null);

			await expect(
				call(setMonthlyLimit, { organizationId: "missing", limit: 100 }, context),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect(upsertBotMonthlyLimit).not.toHaveBeenCalled();
		});
	});

	describe("setUsePlatformModel", () => {
		it("rejects a store owner who is not a platform admin", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(sessionWithRole("user"));

			await expect(
				call(setUsePlatformModel, { organizationId: "org-a", usePlatformModel: true }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(upsertBotUsePlatformModel).not.toHaveBeenCalled();
		});

		it("writes the switch with the admin id for the audit record", async () => {
			vi.mocked(getOrganizationBrief).mockResolvedValueOnce({ id: "org-a" });

			const result = await call(
				setUsePlatformModel,
				{ organizationId: "org-a", usePlatformModel: true },
				context,
			);

			expect(upsertBotUsePlatformModel).toHaveBeenCalledWith("org-a", true, "user-1");
			expect(result).toEqual({ organizationId: "org-a", usePlatformModel: true });
		});

		it("returns NOT_FOUND for an unknown organization", async () => {
			vi.mocked(getOrganizationBrief).mockResolvedValueOnce(null);

			await expect(
				call(setUsePlatformModel, { organizationId: "missing", usePlatformModel: true }, context),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			expect(upsertBotUsePlatformModel).not.toHaveBeenCalled();
		});
	});
});
