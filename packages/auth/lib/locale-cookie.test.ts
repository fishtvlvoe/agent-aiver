import { config, resolveLocale } from "@repo/i18n";
import { describe, expect, it } from "vitest";

describe("locale cookie", () => {
	it("只支援繁體中文", () => {
		expect(Object.keys(config.locales)).toEqual(["zh-TW"]);
	});

	it("舊使用者 cookie 為 en 時退回 zh-TW", () => {
		expect(resolveLocale("en")).toBe("zh-TW");
	});

	it("沒有 cookie 或值不合法時退回 zh-TW", () => {
		expect(resolveLocale(undefined)).toBe("zh-TW");
		expect(resolveLocale(null)).toBe("zh-TW");
		expect(resolveLocale("")).toBe("zh-TW");
	});

	it("zh-TW cookie 保持 zh-TW", () => {
		expect(resolveLocale("zh-TW")).toBe("zh-TW");
	});
});
