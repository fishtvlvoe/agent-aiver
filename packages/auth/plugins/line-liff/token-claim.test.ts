import { describe, expect, it } from "vitest";

import {
	type LineLiffTokenClaimRow,
	type LineLiffTokenClaimStore,
	claimLineLiffToken,
	hashLineIdToken,
} from "./token-claim";

function createMemoryStore() {
	const rows = new Map<string, LineLiffTokenClaimRow>();
	const store: LineLiffTokenClaimStore = {
		async deleteExpired(now) {
			for (const [hash, row] of rows) {
				if (row.expiresAt.getTime() < now.getTime()) {
					rows.delete(hash);
				}
			}
		},
		async insert(row) {
			if (rows.has(row.tokenHash)) {
				return false;
			}
			rows.set(row.tokenHash, row);
			return true;
		},
	};
	return { store, rows };
}

const NOW = new Date("2026-11-01T00:00:00Z");
const LATER = new Date(NOW.getTime() + 300 * 1000);

describe("claimLineLiffToken", () => {
	it("拒絕同一個 idToken 第二次使用（重放）", async () => {
		const { store } = createMemoryStore();
		const input = { idToken: "token-a", lineUserId: "U1", expiresAt: LATER, now: NOW };

		const first = await claimLineLiffToken(store, input);
		const second = await claimLineLiffToken(store, input);

		expect(first.claimed).toBe(true);
		expect(second.claimed).toBe(false);
		expect(second.tokenHash).toBe(first.tokenHash);
	});

	it("不同 idToken 各自可以 claim", async () => {
		const { store } = createMemoryStore();

		const a = await claimLineLiffToken(store, {
			idToken: "token-a",
			lineUserId: "U1",
			expiresAt: LATER,
			now: NOW,
		});
		const b = await claimLineLiffToken(store, {
			idToken: "token-b",
			lineUserId: "U1",
			expiresAt: LATER,
			now: NOW,
		});

		expect(a.claimed).toBe(true);
		expect(b.claimed).toBe(true);
	});

	it("claim 時會清除已過期的列", async () => {
		const { store, rows } = createMemoryStore();
		const expired = await claimLineLiffToken(store, {
			idToken: "old-token",
			lineUserId: "U1",
			expiresAt: new Date(NOW.getTime() - 1000),
			now: new Date(NOW.getTime() - 60_000),
		});
		expect(rows.has(expired.tokenHash)).toBe(true);

		await claimLineLiffToken(store, {
			idToken: "new-token",
			lineUserId: "U2",
			expiresAt: LATER,
			now: NOW,
		});

		expect(rows.has(expired.tokenHash)).toBe(false);
		expect(rows.size).toBe(1);
	});

	it("未過期的列不會被清除", async () => {
		const { store, rows } = createMemoryStore();
		const active = await claimLineLiffToken(store, {
			idToken: "active-token",
			lineUserId: "U1",
			expiresAt: LATER,
			now: NOW,
		});

		await claimLineLiffToken(store, {
			idToken: "other-token",
			lineUserId: "U2",
			expiresAt: LATER,
			now: NOW,
		});

		expect(rows.has(active.tokenHash)).toBe(true);
	});

	it("第一次因政策被拒（例如未開放註冊）後，同一個 idToken 仍被拒絕", async () => {
		const { store } = createMemoryStore();
		const input = { idToken: "token-a", lineUserId: "U1", expiresAt: LATER, now: NOW };

		const first = await claimLineLiffToken(store, input);
		const retry = await claimLineLiffToken(store, input);

		expect(first.claimed).toBe(true);
		expect(retry.claimed).toBe(false);
	});
});

describe("hashLineIdToken", () => {
	it("輸出 SHA-256 十六進位雜湊，且不包含原始 token", async () => {
		const token = "eyJhbGciOiJSUzI1NiJ9.payload.signature";
		const hash = await hashLineIdToken(token);

		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(hash).not.toContain(token);
		expect(await hashLineIdToken(token)).toBe(hash);
	});
});
