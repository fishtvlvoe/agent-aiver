import { lt } from "drizzle-orm";

import { db } from "../client";
import { lineLiffTokenClaim } from "../schema/sqlite";

export async function deleteExpiredLineLiffTokenClaims(now: Date) {
	await db.delete(lineLiffTokenClaim).where(lt(lineLiffTokenClaim.expiresAt, now));
}

// 回傳 false 表示 tokenHash 已存在（重放）
export async function insertLineLiffTokenClaim(row: typeof lineLiffTokenClaim.$inferInsert) {
	const inserted = await db
		.insert(lineLiffTokenClaim)
		.values(row)
		.onConflictDoNothing()
		.returning({ tokenHash: lineLiffTokenClaim.tokenHash });
	return inserted.length > 0;
}
