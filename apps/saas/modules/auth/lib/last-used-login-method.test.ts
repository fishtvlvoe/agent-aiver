import { describe, expect, it } from "vitest";

import { isLastUsedLoginMethod, lastUsedLoginMethodIds } from "./last-used-login-method";

describe("last used login method", () => {
	it("maps UI methods to Better Auth lastLoginMethod ids", () => {
		expect(lastUsedLoginMethodIds.password).toBe("email");
		expect(lastUsedLoginMethodIds.magicLink).toBe("magic-link");
		expect(lastUsedLoginMethodIds.passkey).toBe("passkey");
	});

	it("matches only the stored method", () => {
		expect(isLastUsedLoginMethod("github", "github")).toBe(true);
		expect(isLastUsedLoginMethod("github", "google")).toBe(false);
		expect(isLastUsedLoginMethod(null, "email")).toBe(false);
	});
});
