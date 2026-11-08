import { describe, expect, it } from "vitest";

import { mapLineProfileToUser } from "./line-profile";

describe("LINE profile", () => {
	it.each([
		["U" + "a".repeat(32), "U" + "a".repeat(32)],
		["u" + "ABCdef1234567890ABCdef1234567890", "Uabcdef1234567890abcdef1234567890"],
		["U" + "a".repeat(31), "U" + "a".repeat(31)],
		["X" + "a".repeat(32), "X" + "a".repeat(32)],
	] as const)("placeholder Email 使用固定 LINE 識別碼格式：%s", (sub, canonicalSub) => {
		expect(mapLineProfileToUser({ sub }).email).toBe(`line-user-${canonicalSub}@line.invalid`);
	});

	it("第一次 LINE 登入建立假 Email 並保留公開資料", () => {
		const result = mapLineProfileToUser({
			sub: "line-sub-001",
			name: "林測試",
			picture: "https://example.com/avatar.png",
		});

		expect(result).toEqual({
			name: "林測試",
			image: "https://example.com/avatar.png",
			email: "line-user-line-sub-001@line.invalid",
			emailVerified: false,
		});
	});

	it("第二次 LINE 登入沿用同一位使用者", () => {
		const first = mapLineProfileToUser({ sub: "line-sub-repeat", name: "重複登入" });
		const second = mapLineProfileToUser({ sub: "line-sub-repeat", name: "重複登入" });

		expect(second).toEqual(first);
	});

	it("不會因為 Email 相同而自動連結", () => {
		const first = mapLineProfileToUser({ sub: "line-sub-a" });
		const second = mapLineProfileToUser({ sub: "line-sub-b" });

		expect(first.email).not.toBe(second.email);
	});

	it("沒有名稱時使用固定顯示名稱", () => {
		expect(mapLineProfileToUser({ sub: "line-sub-002" }).name).toBe("LINE 使用者");
	});

	it("有 LINE Email 時使用該 Email，emailVerified 維持 false", () => {
		expect(mapLineProfileToUser({ sub: "line-sub-003", email: "member@example.com" })).toEqual({
			name: "LINE 使用者",
			image: undefined,
			email: "member@example.com",
			emailVerified: false,
		});
	});

	it("LINE Email 會去除空白並轉為小寫", () => {
		expect(
			mapLineProfileToUser({ sub: "line-sub-004", email: "  Member@Example.COM  " }).email,
		).toBe("member@example.com");
	});

	it("沒有 LINE Email 時維持假 Email", () => {
		expect(mapLineProfileToUser({ sub: "line-sub-005" }).email).toBe(
			"line-user-line-sub-005@line.invalid",
		);
	});

	it("LINE Email 為空白字串時維持假 Email", () => {
		expect(mapLineProfileToUser({ sub: "line-sub-006", email: "   " }).email).toBe(
			"line-user-line-sub-006@line.invalid",
		);
	});
});
