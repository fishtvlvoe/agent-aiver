import { describe, expect, it } from "vitest";

import { resolveLiffLoginTarget, sanitizeLoginTarget } from "./target";

describe("LIFF 登入目標頁", () => {
	it.each([
		["//evil.com", "/"],
		["https://other.site", "/"],
		["javascript:alert(1)", "/"],
		["", "/"],
		[null, "/"],
		[undefined, "/"],
		["/line", "/"],
		["/line/", "/"],
		["/line/?from=menu", "/"],
	] as const)("不接受不安全目標：%s", (target, expected) => {
		expect(sanitizeLoginTarget(target)).toBe(expected);
	});

	it.each(["/", "/pay/123", "/settings/security?from=line", "/zh-TW/login"])(
		"保留站內路徑：%s",
		(target) => {
			expect(sanitizeLoginTarget(target)).toBe(target);
		},
	);

	it.each([
		[{ state: "%2Fpay%2Flink%2F123" }, "/pay/link/123"],
		[{ state: "/line/pay/link/123" }, "/pay/link/123"],
		[{ to: "/settings/security" }, "/settings/security"],
		[{ path: ["pay", "link", "123"] }, "/pay/link/123"],
		[{ state: "https%3A%2F%2Fevil.example" }, "/"],
	] as const)("解析 LIFF 目標：%s", (input, expected) => {
		expect(resolveLiffLoginTarget(input)).toBe(expected);
	});
});
