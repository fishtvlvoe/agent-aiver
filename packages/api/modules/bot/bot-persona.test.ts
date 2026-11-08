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
	upsertBotPersona: vi.fn(),
}));

import { auth } from "@repo/auth";
import { getOrganizationMembership } from "@repo/database";

import { getBotStoreByOrganizationId, upsertBotPersona } from "./lib/bot-store";
import { getPersona } from "./procedures/get-persona";
import { savePersona } from "./procedures/save-persona";

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

describe("bot persona procedures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(auth.api.getSession).mockResolvedValue(authenticatedSession);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("getPersona", () => {
		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(
				call(getPersona, { organizationId: "org-a" }, context),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
			expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
		});

		it("rejects a regular member who cannot manage the organization", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "member"),
			);

			await expect(
				call(getPersona, { organizationId: "org-a" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
		});

		it("rejects reading organization B with a membership of organization A", async () => {
			vi.mocked(getOrganizationMembership).mockImplementation(async (organizationId) =>
				organizationId === "org-a" ? membershipOf("org-a", "owner") : null,
			);

			await expect(
				call(getPersona, { organizationId: "org-b" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(getBotStoreByOrganizationId).not.toHaveBeenCalled();
		});

		it("returns the saved persona", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce({
				persona: "親切簡短",
			} as never);

			const result = await call(getPersona, { organizationId: "org-a" }, context);

			expect(result).toEqual({ persona: "親切簡短" });
		});

		it("returns null when no persona has been saved", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);
			vi.mocked(getBotStoreByOrganizationId).mockResolvedValueOnce(undefined);

			const result = await call(getPersona, { organizationId: "org-a" }, context);

			expect(result).toEqual({ persona: null });
		});
	});

	describe("savePersona", () => {
		const input = { organizationId: "org-a", persona: "  親切簡短  " };

		it("rejects unauthenticated requests", async () => {
			vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

			await expect(call(savePersona, input, context)).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			expect(upsertBotPersona).not.toHaveBeenCalled();
		});

		it("rejects a regular member who cannot manage the organization", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "member"),
			);

			await expect(call(savePersona, input, context)).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(upsertBotPersona).not.toHaveBeenCalled();
		});

		it("rejects saving to organization B with a membership of organization A", async () => {
			vi.mocked(getOrganizationMembership).mockImplementation(async (organizationId) =>
				organizationId === "org-a" ? membershipOf("org-a", "owner") : null,
			);

			await expect(
				call(savePersona, { ...input, organizationId: "org-b" }, context),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(upsertBotPersona).not.toHaveBeenCalled();
		});

		it("rejects a persona longer than 500 characters without writing", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);

			await expect(
				call(savePersona, { ...input, persona: "字".repeat(501) }, context),
			).rejects.toThrow();
			expect(upsertBotPersona).not.toHaveBeenCalled();
		});

		it("trims and stores the persona for the organization", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);

			const result = await call(savePersona, input, context);

			expect(upsertBotPersona).toHaveBeenCalledWith("org-a", "親切簡短");
			expect(result).toEqual({ persona: "親切簡短" });
		});

		it("clears the persona when the input is blank", async () => {
			vi.mocked(getOrganizationMembership).mockResolvedValueOnce(
				membershipOf("org-a", "owner"),
			);

			const result = await call(savePersona, { ...input, persona: "   " }, context);

			expect(upsertBotPersona).toHaveBeenCalledWith("org-a", null);
			expect(result).toEqual({ persona: null });
		});
	});
});
