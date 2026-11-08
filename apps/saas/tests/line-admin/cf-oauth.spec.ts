import { expect, test } from "@playwright/test";

// 對應 feature：cf-oauth.feature（C1～C4）。依賴本機 3100 預覽站（需 CF_OAUTH_* 環境變數）與種子帳號。
const BASE = "http://localhost:3100";
const STORE_A = "org-store-a";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`缺少環境變數 ${name}：請先 set -a; . ./.env.e2e.local; set +a`);
	}
	return value;
}

async function signedInContext(
	playwright: import("@playwright/test").PlaywrightWorkerArgs["playwright"],
	email: string,
	envName: string,
) {
	const context = await playwright.request.newContext();
	let status = 0;
	for (let attempt = 0; attempt < 6; attempt++) {
		const res = await context.post(`${BASE}/api/auth/sign-in/email`, {
			headers: { Origin: BASE, "Content-Type": "application/json" },
			data: { email, password: requireEnv(envName) },
		});
		status = res.status();
		if (status !== 429) break;
		await new Promise((resolve) => setTimeout(resolve, 10_000));
	}
	expect(status, `${email} 登入失敗`).toBe(200);
	return context;
}

test.setTimeout(120_000);

test("C1 未登入呼叫授權入口被拒絕", async ({ request }) => {
	const res = await request.get(`${BASE}/api/bot/cf-oauth/start?organizationId=${STORE_A}`, {
		maxRedirects: 0,
	});
	expect(res.status()).toBe(401);
});

test("C2 店家 owner 開始授權會被導向 Cloudflare 並帶 PKCE", async ({ playwright }) => {
	const owner = await signedInContext(playwright, "owner-a@e2e.test", "E2E_OWNER_PASSWORD");
	const res = await owner.get(`${BASE}/api/bot/cf-oauth/start?organizationId=${STORE_A}`, {
		maxRedirects: 0,
	});
	expect(res.status()).toBe(302);
	const location = new URL(res.headers().location);
	expect(location.origin + location.pathname).toBe("https://dash.cloudflare.com/oauth2/auth");
	expect(location.searchParams.get("code_challenge_method")).toBe("S256");
	expect(location.searchParams.get("code_challenge")).toBeTruthy();
	expect(location.searchParams.get("state")).toBeTruthy();
	expect(res.headers()["set-cookie"] ?? "").toContain("HttpOnly");
	await owner.dispose();
});

test("C3 一般成員不能替店家開始授權", async ({ playwright }) => {
	const member = await signedInContext(playwright, "member-a@e2e.test", "E2E_MEMBER_PASSWORD");
	const res = await member.get(`${BASE}/api/bot/cf-oauth/start?organizationId=${STORE_A}`, {
		maxRedirects: 0,
	});
	expect(res.status()).toBe(403);
	await member.dispose();
});

test("C4 沒有授權 cookie 就打回呼會被拒絕", async ({ request }) => {
	const res = await request.get(`${BASE}/api/bot/cf-oauth/callback?code=x&state=y`, {
		maxRedirects: 0,
	});
	expect(res.status()).toBe(400);
});
