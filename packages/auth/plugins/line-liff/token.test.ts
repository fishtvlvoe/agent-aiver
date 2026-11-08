import { describe, expect, it, vi } from "vitest";

import { verifyLineIdToken } from "./token";

const now = 1_800_000_000;

function claims(overrides: Record<string, unknown> = {}) {
	return {
		sub: "line-sub-1",
		aud: "line-client-1",
		exp: now + 300,
		iat: now,
		nonce: "nonce-1",
		name: "LINE 使用者",
		picture: "https://example.com/avatar.png",
		email: "line@example.com",
		...overrides,
	};
}

describe("LIFF LINE ID token 驗證", () => {
	it("只接受 LINE 驗證函式回傳且符合 client、有效期限與 nonce 的身分", async () => {
		const verify = vi.fn().mockResolvedValue(claims());

		await expect(
			verifyLineIdToken({
				idToken: "opaque-id-token",
				nonce: "nonce-1",
				clientId: "line-client-1",
				now,
				verify,
			}),
		).resolves.toMatchObject({ sub: "line-sub-1", email: "line@example.com" });
		expect(verify).toHaveBeenCalledWith("opaque-id-token", "line-client-1");
	});

	it.each([
		["sub 為空", { sub: "" }],
		["audience 不符", { aud: "another-client" }],
		["token 已過期", { exp: now }],
		["nonce 不符", { nonce: "another-nonce" }],
		["欄位型別錯誤", { exp: "not-a-number" }],
	])("拒絕%s", async (_description, override) => {
		await expect(
			verifyLineIdToken({
				idToken: "opaque-id-token",
				nonce: "nonce-1",
				clientId: "line-client-1",
				now,
				verify: vi.fn().mockResolvedValue(claims(override)),
			}),
		).rejects.toMatchObject({ code: "LINE_LIFF_TOKEN_INVALID" });
	});

	it("ID token 沒有 nonce 仍可通過 LINE 驗證", async () => {
		await expect(
			verifyLineIdToken({
				idToken: "opaque-id-token",
				nonce: "nonce-1",
				clientId: "line-client-1",
				now,
				verify: vi.fn().mockResolvedValue(claims({ nonce: undefined })),
			}),
		).resolves.toMatchObject({ sub: "line-sub-1" });
	});

	it("ID token 有 nonce 但請求沒有 nonce 時拒絕", async () => {
		await expect(
			verifyLineIdToken({
				idToken: "opaque-id-token",
				clientId: "line-client-1",
				now,
				verify: vi.fn().mockResolvedValue(claims()),
			}),
		).rejects.toMatchObject({ code: "LINE_LIFF_TOKEN_INVALID" });
	});

	it("拒絕超過新鮮度視窗的 ID token", async () => {
		await expect(
			verifyLineIdToken({
				idToken: "opaque-id-token",
				nonce: "nonce-1",
				clientId: "line-client-1",
				now,
				verify: vi.fn().mockResolvedValue(claims({ iat: now - 301 })),
			}),
		).rejects.toMatchObject({ code: "LINE_LIFF_TOKEN_INVALID" });
	});

	it("允許伺服器時鐘慢 60 秒的 ID token", async () => {
		await expect(
			verifyLineIdToken({
				idToken: "opaque-id-token",
				nonce: "nonce-1",
				clientId: "line-client-1",
				now,
				verify: vi.fn().mockResolvedValue(claims({ iat: now + 60 })),
			}),
		).resolves.toMatchObject({ sub: "line-sub-1" });
	});

	it("拒絕超過 120 秒時鐘偏差容忍的 ID token", async () => {
		await expect(
			verifyLineIdToken({
				idToken: "opaque-id-token",
				nonce: "nonce-1",
				clientId: "line-client-1",
				now,
				verify: vi.fn().mockResolvedValue(claims({ iat: now + 121 })),
			}),
		).rejects.toMatchObject({ code: "LINE_LIFF_TOKEN_INVALID" });
	});

	it("LINE 驗證函式失敗時不會把瀏覽器傳入的身分當成可信資料", async () => {
		const verify = vi.fn().mockRejectedValue(new Error("LINE verify failed"));

		await expect(
			verifyLineIdToken({
				idToken: "opaque-id-token",
				nonce: "nonce-1",
				clientId: "line-client-1",
				now,
				verify,
			}),
		).rejects.toMatchObject({ code: "LINE_LIFF_TOKEN_INVALID" });
	});
});
