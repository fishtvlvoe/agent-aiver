import { desc, eq, and } from "drizzle-orm";

import { db } from "../client";
import { botConversation } from "../schema/sqlite";

export function listBotConversationsByOrganizationId(
	organizationId: string,
	{ status, offset, limit }: { status?: string; offset: number; limit: number },
) {
	return db
		.select({
			id: botConversation.id,
			userId: botConversation.userId,
			userText: botConversation.userText,
			aiText: botConversation.aiText,
			status: botConversation.status,
			createdAt: botConversation.createdAt,
		})
		.from(botConversation)
		.where(
			and(
				eq(botConversation.organizationId, organizationId),
				status ? eq(botConversation.status, status) : undefined,
			),
		)
		.orderBy(desc(botConversation.createdAt))
		.limit(limit)
		.offset(offset);
}
