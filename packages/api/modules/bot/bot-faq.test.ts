import { call } from "@orpc/server";
import type { Session } from "@repo/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth", () => ({
	auth: {
		api: {
			getSession: vi.fn(),
		},
	},
}));

vi.mock("@repo/database", () => ({
	getOrganizationMembership: vi.fn(),
	listBotFaqsByOrganizationId: vi.fn(),
	insertBotFaq: vi.fn(),
	updateBotFaqByOrganizationId: vi.fn(),
	deleteBotFaqByOrganizationId: vi.fn(),
}));

import { auth } from "@repo/auth";
import {
	deleteBotFaqByOrganizationId,
	getOrganizationMembership,
	insertBotFaq,
	listBotFaqsByOrganizationId,
	updateBotFaqByOrganizationId,
} from "@repo/database";

import { createFaq } from "./procedures/create-faq";
import { deleteFaq } from "./procedures/delete-faq";
import { listFaqs } from "./procedures/list-faqs";
import { updateFaq } from "./procedures/update-faq";

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

describe("bot FAQ procedures", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(auth.api.getSession).mockResolvedValue(authenticatedSession);
	});

	it("rejects unauthenticated requests", async () => {
		vi.mocked(auth.api.getSession).mockResolvedValueOnce(null);

		await expect(call(listFaqs, { organizationId: "org-a" }, context)).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(listBotFaqsByOrganizationId).not.toHaveBeenCalled();
	});

	it("rejects listing FAQs of an organization the user does not belong to", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(null);

		await expect(call(listFaqs, { organizationId: "org-b" }, context)).rejects.toMatchObject({
			code: "FORBIDDEN",
		});
		expect(listBotFaqsByOrganizationId).not.toHaveBeenCalled();
	});

	it("lists only the FAQs of the requested organization", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));
		vi.mocked(listBotFaqsByOrganizationId).mockResolvedValueOnce([
			{
				id: "faq-1",
				question: "營業時間幾點？",
				answer: "早上九點到晚上九點。",
				updatedAt: new Date("2026-11-01T00:00:00.000Z"),
			},
		]);

		const result = await call(listFaqs, { organizationId: "org-a" }, context);

		expect(listBotFaqsByOrganizationId).toHaveBeenCalledWith("org-a");
		expect(result).toEqual({
			faqs: [
				{
					id: "faq-1",
					question: "營業時間幾點？",
					answer: "早上九點到晚上九點。",
					updatedAt: "2026-11-01T00:00:00.000Z",
				},
			],
		});
	});

	it("rejects creating a FAQ by a regular member who cannot manage the organization", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "member"));

		await expect(
			call(
				createFaq,
				{ organizationId: "org-a", question: "可以刷卡嗎？", answer: "可以。" },
				context,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(insertBotFaq).not.toHaveBeenCalled();
	});

	it("creates a FAQ inside the caller's organization", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));

		const { id } = await call(
			createFaq,
			{ organizationId: "org-a", question: "可以刷卡嗎？", answer: "可以。" },
			context,
		);

		expect(id).toEqual(expect.any(String));
		expect(insertBotFaq).toHaveBeenCalledWith(
			expect.objectContaining({
				id,
				organizationId: "org-a",
				question: "可以刷卡嗎？",
				answer: "可以。",
			}),
		);
	});

	it("does not update a FAQ that belongs to organization B when called with organization A", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));
		vi.mocked(updateBotFaqByOrganizationId).mockResolvedValueOnce(false);

		await expect(
			call(
				updateFaq,
				{
					organizationId: "org-a",
					faqId: "faq-of-org-b",
					question: "被竄改的問題",
					answer: "被竄改的回答",
				},
				context,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(updateBotFaqByOrganizationId).toHaveBeenCalledWith(
			"org-a",
			"faq-of-org-b",
			expect.objectContaining({ question: "被竄改的問題", answer: "被竄改的回答" }),
		);
	});

	it("rejects updating a FAQ by a regular member who cannot manage the organization", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "member"));

		await expect(
			call(
				updateFaq,
				{ organizationId: "org-a", faqId: "faq-1", question: "問", answer: "答" },
				context,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(updateBotFaqByOrganizationId).not.toHaveBeenCalled();
	});

	it("does not delete a FAQ that belongs to organization B when called with organization A", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(membershipOf("org-a", "owner"));
		vi.mocked(deleteBotFaqByOrganizationId).mockResolvedValueOnce(false);

		await expect(
			call(deleteFaq, { organizationId: "org-a", faqId: "faq-of-org-b" }, context),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
		expect(deleteBotFaqByOrganizationId).toHaveBeenCalledWith("org-a", "faq-of-org-b");
	});

	it("rejects deleting a FAQ by a user who is not a member of the organization", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(null);

		await expect(
			call(deleteFaq, { organizationId: "org-b", faqId: "faq-of-org-b" }, context),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(deleteBotFaqByOrganizationId).not.toHaveBeenCalled();
	});
});
