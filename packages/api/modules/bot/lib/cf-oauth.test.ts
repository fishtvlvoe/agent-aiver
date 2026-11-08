import { describe, expect, it, vi } from "vitest";

import {
	assertCfOauthBinding,
	CfOauthError,
	exchangeCfOauthCode,
	fetchCfOauthAccountId,
	openCfOauthCookie,
	readCfOauthConfig,
	sealCfOauthCookie,
	signOauthState,
	verifyOauthState,
} from "./cf-oauth";

const STATE_KEY = "vitest-state-key";
const COOKIE_KEY = "vitest-cookie-key";
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const NOW = 1_800_000_000;

function basePayload(overrides: Partial<{ orgId: string; nonce: string; exp: number }> = {}) {
	return {
		orgId: "org-a",
		nonce: "nonce-1",
		returnUrl: "https://example.test/api/bot/cf-oauth/callback",
		exp: NOW + 600,
		...overrides,
	};
}

function jsonResponse(body: unknown, init: { ok?: boolean } = {}) {
	return {
		ok: init.ok ?? true,
		json: async () => body,
	} as unknown as Response;
}

describe("oauth state", () => {
	it("verifies a freshly signed state", async () => {
		const state = await signOauthState(basePayload(), STATE_KEY);
		const payload = await verifyOauthState(state, STATE_KEY, NOW);
		expect(payload.orgId).toBe("org-a");
		expect(payload.nonce).toBe("nonce-1");
	});

	it("rejects a tampered payload", async () => {
		const state = await signOauthState(basePayload(), STATE_KEY);
		const [, signature] = state.split(".");
		const forged = await signOauthState(basePayload({ orgId: "org-b" }), "other-key");
		const [forgedBody] = forged.split(".");
		await expect(verifyOauthState(`${forgedBody}.${signature}`, STATE_KEY, NOW)).rejects.toMatchObject({
			code: "state",
		});
	});

	it("rejects a state signed with a different key", async () => {
		const state = await signOauthState(basePayload(), "wrong-key");
		await expect(verifyOauthState(state, STATE_KEY, NOW)).rejects.toBeInstanceOf(CfOauthError);
	});

	it("rejects an expired state", async () => {
		const state = await signOauthState(basePayload({ exp: NOW - 1 }), STATE_KEY);
		await expect(verifyOauthState(state, STATE_KEY, NOW)).rejects.toMatchObject({ code: "state" });
	});

	it("rejects malformed state strings", async () => {
		await expect(verifyOauthState("no-dot-here", STATE_KEY, NOW)).rejects.toMatchObject({ code: "state" });
		await expect(verifyOauthState("", STATE_KEY, NOW)).rejects.toMatchObject({ code: "state" });
	});

	it("rejects when the nonce does not match the cookie", () => {
		expect(() =>
			assertCfOauthBinding({ nonce: "nonce-1", orgId: "org-a" }, { nonce: "nonce-2", orgId: "org-a" }),
		).toThrow(CfOauthError);
	});

	it("rejects when the orgId does not match the cookie", () => {
		expect(() =>
			assertCfOauthBinding({ nonce: "nonce-1", orgId: "org-a" }, { nonce: "nonce-1", orgId: "org-b" }),
		).toThrow(CfOauthError);
	});

	it("accepts matching nonce and orgId", () => {
		expect(() =>
			assertCfOauthBinding({ nonce: "nonce-1", orgId: "org-a" }, { nonce: "nonce-1", orgId: "org-a" }),
		).not.toThrow();
	});
});

describe("oauth cookie", () => {
	const cookie = {
		verifier: "verifier-value",
		nonce: "nonce-1",
		orgId: "org-a",
		settingsUrl: "https://example.test/org-a/model-settings",
	};

	it("round-trips with the same key", async () => {
		const sealed = await sealCfOauthCookie(cookie, COOKIE_KEY);
		expect(await openCfOauthCookie(sealed, COOKIE_KEY)).toEqual(cookie);
	});

	it("does not expose the verifier in the sealed value", async () => {
		const sealed = await sealCfOauthCookie(cookie, COOKIE_KEY);
		expect(sealed).not.toContain(cookie.verifier);
	});

	it("returns null for a different key or garbage", async () => {
		const sealed = await sealCfOauthCookie(cookie, COOKIE_KEY);
		expect(await openCfOauthCookie(sealed, "wrong-key")).toBeNull();
		expect(await openCfOauthCookie("garbage", COOKIE_KEY)).toBeNull();
	});
});

describe("readCfOauthConfig", () => {
	it("names the missing variables without printing any values", () => {
		expect(() =>
			readCfOauthConfig({
				CF_OAUTH_STATE_KEY: "secret-value-should-not-leak",
				CF_OAUTH_COOKIE_KEY: "",
				CF_OAUTH_REDIRECT_URI: "https://example.test/cb",
			}),
		).toThrow(/CF_OAUTH_COOKIE_KEY.*CF_OAUTH_CLIENT_ID/);

		try {
			readCfOauthConfig({ CF_OAUTH_STATE_KEY: "secret-value-should-not-leak" });
		} catch (error) {
			expect(String(error)).not.toContain("secret-value-should-not-leak");
		}
	});

	it("returns all values when complete", () => {
		const config = readCfOauthConfig({
			CF_OAUTH_STATE_KEY: "s",
			CF_OAUTH_COOKIE_KEY: "c",
			CF_OAUTH_REDIRECT_URI: "https://example.test/cb",
			CF_OAUTH_CLIENT_ID: "client",
		});
		expect(config).toEqual({
			stateKey: "s",
			cookieKey: "c",
			redirectUri: "https://example.test/cb",
			clientId: "client",
		});
	});
});

describe("exchangeCfOauthCode", () => {
	const input = { code: "code-1", verifier: "v", clientId: "client", redirectUri: "https://example.test/cb" };

	it("returns tokens and an absolute access expiry", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
		);
		const result = await exchangeCfOauthCode({ ...input, fetchImpl, nowSeconds: NOW });
		expect(result).toEqual({ accessToken: "at", refreshToken: "rt", accessExpiresAt: NOW + 3600 });

		const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://dash.cloudflare.com/oauth2/token");
		expect(String(init.body)).toContain("code_verifier=v");
	});

	it("maps a non-ok response to exchange", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { ok: false }));
		await expect(exchangeCfOauthCode({ ...input, fetchImpl })).rejects.toMatchObject({ code: "exchange" });
	});

	it("maps a network failure to exchange", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
		await expect(exchangeCfOauthCode({ ...input, fetchImpl })).rejects.toMatchObject({ code: "exchange" });
	});

	it("maps a response without refresh_token to exchange", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ access_token: "at", expires_in: 3600 }));
		await expect(exchangeCfOauthCode({ ...input, fetchImpl })).rejects.toMatchObject({ code: "exchange" });
	});
});

describe("fetchCfOauthAccountId", () => {
	it("maps zero memberships to no_account", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true, result: [] }));
		await expect(fetchCfOauthAccountId({ accessToken: "at", fetchImpl })).rejects.toMatchObject({
			code: "no_account",
		});
	});

	it("takes the first membership when there are several", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse({
				success: true,
				result: [{ account: { id: ACCOUNT_ID } }, { account: { id: "fedcba9876543210fedcba9876543210" } }],
			}),
		);
		const result = await fetchCfOauthAccountId({ accessToken: "at", fetchImpl });
		expect(result).toEqual({ accountId: ACCOUNT_ID, membershipCount: 2 });
	});

	it("rejects an account id that is not a Cloudflare account id", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse({ success: true, result: [{ account: { id: "not-an-id" } }] }),
		);
		await expect(fetchCfOauthAccountId({ accessToken: "at", fetchImpl })).rejects.toMatchObject({
			code: "exchange",
		});
	});

	it("sends the access token as a bearer header", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse({ success: true, result: [{ account: { id: ACCOUNT_ID } }] }),
		);
		await fetchCfOauthAccountId({ accessToken: "at-123", fetchImpl });
		const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer at-123");
	});
});
