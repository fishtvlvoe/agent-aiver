import { z } from "zod";

import { CLOUDFLARE_ACCOUNT_ID_PATTERN } from "./model-providers";

// 店家連結 Cloudflare 授權的核心邏輯：PKCE、state 簽章、cookie 加密、換 token、取 Account ID
// 所有對外 fetch 都可注入，方便測試

export type CfOauthErrorCode = "denied" | "no_account" | "exchange" | "state";

export class CfOauthError extends Error {
	readonly code: CfOauthErrorCode;

	constructor(code: CfOauthErrorCode) {
		super(code);
		this.name = "CfOauthError";
		this.code = code;
	}
}

export const CF_OAUTH_AUTHORIZE_URL = "https://dash.cloudflare.com/oauth2/auth";
export const CF_OAUTH_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
export const CF_API_BASE_URL = "https://api.cloudflare.com/client/v4";
export const CF_OAUTH_SCOPE = "ai.read ai.write memberships.read offline_access";
export const CF_OAUTH_STATE_TTL_SECONDS = 600;
export const CF_OAUTH_REQUEST_TIMEOUT_MS = 10_000;
export const CF_OAUTH_COOKIE_NAME = "cf_oauth";
export const CF_OAUTH_COOKIE_PATH = "/api/bot/cf-oauth";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const statePayloadSchema = z.object({
	orgId: z.string().min(1),
	nonce: z.string().min(1),
	returnUrl: z.string().min(1),
	exp: z.number().int(),
});

export const cfOauthCookieSchema = z.object({
	verifier: z.string().min(1),
	nonce: z.string().min(1),
	orgId: z.string().min(1),
	settingsUrl: z.string().min(1),
});

export type CfOauthStatePayload = z.infer<typeof statePayloadSchema>;
export type CfOauthCookie = z.infer<typeof cfOauthCookieSchema>;

export type CfOauthConfig = {
	stateKey: string;
	cookieKey: string;
	redirectUri: string;
	clientId: string;
};

// 缺少環境變數時丟出明確訊息（只列變數名，不印值）
export function readCfOauthConfig(env: Record<string, string | undefined> = process.env): CfOauthConfig {
	const names = [
		"CF_OAUTH_STATE_KEY",
		"CF_OAUTH_COOKIE_KEY",
		"CF_OAUTH_REDIRECT_URI",
		"CF_OAUTH_CLIENT_ID",
	] as const;
	const missing = names.filter((name) => !env[name]);

	if (missing.length > 0) {
		throw new Error(`Cloudflare 授權設定缺少環境變數：${missing.join(", ")}`);
	}

	return {
		stateKey: env.CF_OAUTH_STATE_KEY as string,
		cookieKey: env.CF_OAUTH_COOKIE_KEY as string,
		redirectUri: env.CF_OAUTH_REDIRECT_URI as string,
		clientId: env.CF_OAUTH_CLIENT_ID as string,
	};
}

function toBase64url(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string) {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function randomBase64url(byteLength: number) {
	return toBase64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function createNonce() {
	return randomBase64url(16);
}

// verifier 43 字元（32 bytes），challenge 為 S256
export async function createPkcePair() {
	const verifier = randomBase64url(32);
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
	return { verifier, challenge: toBase64url(new Uint8Array(digest)) };
}

function hmacKey(secret: string) {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

// state 格式：base64url(JSON payload) + "." + base64url(HMAC-SHA256)
export async function signOauthState(payload: CfOauthStatePayload, stateKey: string) {
	const body = toBase64url(encoder.encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign("HMAC", await hmacKey(stateKey), encoder.encode(body));
	return `${body}.${toBase64url(new Uint8Array(signature))}`;
}

// 驗簽章與 exp；任何異常一律回報 state，不區分原因以免洩漏判斷細節
export async function verifyOauthState(
	state: string,
	stateKey: string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<CfOauthStatePayload> {
	const parts = state.split(".");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new CfOauthError("state");
	}
	const [body, signature] = parts as [string, string];

	let valid = false;
	try {
		valid = await crypto.subtle.verify(
			"HMAC",
			await hmacKey(stateKey),
			fromBase64url(signature),
			encoder.encode(body),
		);
	} catch {
		valid = false;
	}
	if (!valid) {
		throw new CfOauthError("state");
	}

	let payload: CfOauthStatePayload;
	try {
		payload = statePayloadSchema.parse(JSON.parse(decoder.decode(fromBase64url(body))));
	} catch {
		throw new CfOauthError("state");
	}

	if (payload.exp <= nowSeconds) {
		throw new CfOauthError("state");
	}

	return payload;
}

// state 與 cookie 必須同一次發起：nonce 與 orgId 都要相同
export function assertCfOauthBinding(
	state: Pick<CfOauthStatePayload, "nonce" | "orgId">,
	cookie: Pick<CfOauthCookie, "nonce" | "orgId">,
) {
	if (state.nonce !== cookie.nonce || state.orgId !== cookie.orgId) {
		throw new CfOauthError("state");
	}
}

async function aesKey(secret: string) {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// cookie 用獨立金鑰 CF_OAUTH_COOKIE_KEY 加密，內容含 PKCE verifier
export async function sealCfOauthCookie(value: CfOauthCookie, cookieKey: string) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		await aesKey(cookieKey),
		encoder.encode(JSON.stringify(value)),
	);
	return toBase64url(new Uint8Array([...iv, ...new Uint8Array(cipher)]));
}

export async function openCfOauthCookie(sealed: string, cookieKey: string): Promise<CfOauthCookie | null> {
	try {
		const bytes = fromBase64url(sealed);
		const plain = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: bytes.slice(0, 12) },
			await aesKey(cookieKey),
			bytes.slice(12),
		);
		const parsed = cfOauthCookieSchema.safeParse(JSON.parse(decoder.decode(plain)));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export function buildCfOauthAuthorizeUrl({
	clientId,
	redirectUri,
	state,
	codeChallenge,
}: {
	clientId: string;
	redirectUri: string;
	state: string;
	codeChallenge: string;
}) {
	const url = new URL(CF_OAUTH_AUTHORIZE_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("scope", CF_OAUTH_SCOPE);
	url.searchParams.set("state", state);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	return url.toString();
}

function timeoutSignal() {
	return AbortSignal.timeout(CF_OAUTH_REQUEST_TIMEOUT_MS);
}

const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	refresh_token: z.string().min(1),
	expires_in: z.number().positive(),
});

// 公開應用（無 client_secret），以 PKCE verifier 換 token
export async function exchangeCfOauthCode({
	code,
	verifier,
	clientId,
	redirectUri,
	fetchImpl = fetch,
	nowSeconds = Math.floor(Date.now() / 1000),
}: {
	code: string;
	verifier: string;
	clientId: string;
	redirectUri: string;
	fetchImpl?: typeof fetch;
	nowSeconds?: number;
}) {
	let response: Response;
	try {
		response = await fetchImpl(CF_OAUTH_TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
				client_id: clientId,
				code_verifier: verifier,
			}),
			signal: timeoutSignal(),
		});
	} catch {
		throw new CfOauthError("exchange");
	}

	if (!response.ok) {
		throw new CfOauthError("exchange");
	}

	const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
	if (!parsed.success) {
		throw new CfOauthError("exchange");
	}

	return {
		accessToken: parsed.data.access_token,
		refreshToken: parsed.data.refresh_token,
		accessExpiresAt: nowSeconds + Math.floor(parsed.data.expires_in),
	};
}

const membershipsResponseSchema = z.object({
	success: z.boolean(),
	result: z.array(z.object({ account: z.object({ id: z.string() }) })),
});

// 0 筆 → no_account；多筆取第一筆（第一版，見規格 §3、§9）
export async function fetchCfOauthAccountId({
	accessToken,
	fetchImpl = fetch,
}: {
	accessToken: string;
	fetchImpl?: typeof fetch;
}) {
	let response: Response;
	try {
		response = await fetchImpl(`${CF_API_BASE_URL}/memberships`, {
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: timeoutSignal(),
		});
	} catch {
		throw new CfOauthError("exchange");
	}

	if (!response.ok) {
		throw new CfOauthError("exchange");
	}

	const parsed = membershipsResponseSchema.safeParse(await response.json().catch(() => null));
	if (!parsed.success || !parsed.data.success) {
		throw new CfOauthError("exchange");
	}

	const { result } = parsed.data;
	if (result.length === 0) {
		throw new CfOauthError("no_account");
	}

	const accountId = result[0]?.account.id ?? "";
	if (!CLOUDFLARE_ACCOUNT_ID_PATTERN.test(accountId)) {
		throw new CfOauthError("exchange");
	}

	return { accountId, membershipCount: result.length };
}
