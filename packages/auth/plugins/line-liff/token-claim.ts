export type LineLiffTokenClaimRow = {
	tokenHash: string;
	lineUserId: string;
	expiresAt: Date;
	createdAt: Date;
};

export type LineLiffTokenClaimStore = {
	deleteExpired: (now: Date) => Promise<void>;
	// 回傳 false 表示 tokenHash 已存在
	insert: (row: LineLiffTokenClaimRow) => Promise<boolean>;
};

export async function hashLineIdToken(idToken: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(idToken));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

export async function claimLineLiffToken(
	store: LineLiffTokenClaimStore,
	input: { idToken: string; lineUserId: string; expiresAt: Date; now: Date },
) {
	const tokenHash = await hashLineIdToken(input.idToken);
	await store.deleteExpired(input.now);
	const claimed = await store.insert({
		tokenHash,
		lineUserId: input.lineUserId,
		expiresAt: input.expiresAt,
		createdAt: input.now,
	});
	return { claimed, tokenHash };
}
