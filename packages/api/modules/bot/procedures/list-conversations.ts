import { listBotConversationsByOrganizationId } from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";

const PAGE_SIZE = 50;

// 篩選對應舊 Worker 的 status：待真人 = handoff、未命中 = missed；全部則不篩
const STATUS_FILTER = {
	all: undefined,
	handoff: "handoff",
	missed: "missed",
} as const;

export const listConversations = protectedProcedure
	.route({
		method: "GET",
		path: "/bot/conversations",
		tags: ["Bot"],
		summary: "List bot conversations",
		description: "List recent LINE conversations of an organization, newest first (read only)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			status: z.enum(["all", "handoff", "missed"]).default("all"),
			offset: z.number().int().min(0).default(0),
		}),
	)
	.output(
		z.object({
			conversations: z.array(
				z.object({
					id: z.string(),
					guestTag: z.string(),
					userText: z.string().nullable(),
					aiText: z.string().nullable(),
					status: z.string().nullable(),
					createdAt: z.string().nullable(),
				}),
			),
			hasMore: z.boolean(),
			nextOffset: z.number().nullable(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await assertOrganizationPermission(input.organizationId, user.id, "organization.manage");

		// 多取一筆，用來判斷還有沒有下一頁，且不把原始 LINE userId 送到前端
		const rows = await listBotConversationsByOrganizationId(input.organizationId, {
			status: STATUS_FILTER[input.status],
			offset: input.offset,
			limit: PAGE_SIZE + 1,
		});

		const hasMore = rows.length > PAGE_SIZE;
		const page = rows.slice(0, PAGE_SIZE);

		return {
			conversations: page.map((row) => ({
				id: row.id,
				guestTag: row.userId ? `#${row.userId.slice(-4)}` : "—",
				userText: row.userText,
				aiText: row.aiText,
				status: row.status,
				createdAt: row.createdAt?.toISOString() ?? null,
			})),
			hasMore,
			nextOffset: hasMore ? input.offset + PAGE_SIZE : null,
		};
	});
