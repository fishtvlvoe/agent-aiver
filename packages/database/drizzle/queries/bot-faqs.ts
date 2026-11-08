import { and, desc, eq } from "drizzle-orm";

import { db } from "../client";
import { botFaq } from "../schema/sqlite";

export function listBotFaqsByOrganizationId(organizationId: string) {
	return db
		.select({
			id: botFaq.id,
			question: botFaq.question,
			answer: botFaq.answer,
			updatedAt: botFaq.updatedAt,
		})
		.from(botFaq)
		.where(eq(botFaq.organizationId, organizationId))
		.orderBy(desc(botFaq.updatedAt));
}

export async function insertBotFaq(row: typeof botFaq.$inferInsert) {
	await db.insert(botFaq).values(row);
}

// 回傳 false 表示該組織下找不到這筆問答（含屬於其他組織的 id）
export async function updateBotFaqByOrganizationId(
	organizationId: string,
	id: string,
	values: Pick<typeof botFaq.$inferInsert, "question" | "answer" | "updatedAt">,
) {
	const rows = await db
		.update(botFaq)
		.set(values)
		.where(and(eq(botFaq.id, id), eq(botFaq.organizationId, organizationId)))
		.returning({ id: botFaq.id });
	return rows.length > 0;
}

// 回傳 false 表示該組織下找不到這筆問答（含屬於其他組織的 id）
export async function deleteBotFaqByOrganizationId(organizationId: string, id: string) {
	const rows = await db
		.delete(botFaq)
		.where(and(eq(botFaq.id, id), eq(botFaq.organizationId, organizationId)))
		.returning({ id: botFaq.id });
	return rows.length > 0;
}
