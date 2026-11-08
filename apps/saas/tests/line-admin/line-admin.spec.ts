import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { type APIRequestContext, type Browser, expect, test } from "@playwright/test";

// 對應 feature：line-admin.feature（S1～S7）。依賴本機 3100 預覽站與種子資料。
const BASE = "http://localhost:3100";
const OUT_DIR = path.join(os.homedir(), "Downloads", "line-admin-e2e");
const WIDTHS = [390, 768, 1024, 1440];
const STORE_PAGES = ["knowledge", "conversations", "usage", "line-settings", "model-settings"];

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`缺少環境變數 ${name}：請先 set -a; . ./.env.e2e.local; set +a`);
	}
	return value;
}

// 本機登入端點有速率限制（429）；多次跑測試時退避重試，避免把限流誤判為功能失敗
async function signIn(request: APIRequestContext, email: string, password: string) {
	let status = 0;
	for (let attempt = 0; attempt < 6; attempt++) {
		const res = await request.post(`${BASE}/api/auth/sign-in/email`, {
			headers: { Origin: BASE, "Content-Type": "application/json" },
			data: { email, password },
		});
		status = res.status();
		if (status !== 429) break;
		await new Promise((resolve) => setTimeout(resolve, 10_000));
	}
	expect(status, `${email} 登入失敗`).toBe(200);
}

async function roleContext(browser: Browser, email: string, envName: string) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await signIn(context.request, email, requireEnv(envName));
	return context;
}

test.setTimeout(120_000);
test.beforeAll(() => {
	mkdirSync(OUT_DIR, { recursive: true });
});

test("S1 店家只能看到自己的資料", async ({ browser }) => {
	const owner = await roleContext(browser, "owner-a@e2e.test", "E2E_OWNER_PASSWORD");
	const page = await owner.newPage();

	await page.goto(`${BASE}/store-a/knowledge`, { waitUntil: "networkidle" });
	await expect(page.getByText("營業時間")).toBeVisible();
	await expect(page.getByText("停車資訊")).toHaveCount(0);

	const res = await owner.request.get(`${BASE}/api/bot/faqs?organizationId=org-store-b`);
	expect(res.status()).toBe(403);
	await owner.close();
});

test("S2 一般成員不能進後台頁面也不能呼叫後台 API", async ({ browser }) => {
	const member = await roleContext(browser, "member-a@e2e.test", "E2E_MEMBER_PASSWORD");
	const page = await member.newPage();

	for (const slug of STORE_PAGES) {
		const res = await page.goto(`${BASE}/store-a/${slug}`, { waitUntil: "networkidle" });
		expect(res?.status(), `/store-a/${slug}`).toBe(404);
	}

	const faqs = await member.request.get(`${BASE}/api/bot/faqs?organizationId=org-store-a`);
	expect(faqs.status()).toBe(403);
	const store = await member.request.get(`${BASE}/api/bot/store?organizationId=org-store-a`);
	expect(store.status()).toBe(403);
	const write = await member.request.post(`${BASE}/api/bot/line-binding`, {
		headers: { Origin: BASE, "Content-Type": "application/json" },
		data: { organizationId: "org-store-a", channelSecret: "x", accessToken: "y" },
	});
	expect(write.status()).toBe(403);
	await member.close();
});

test("S3 未登入者不能綁定 LINE，既有金鑰不變", async ({ browser, request }) => {
	const anon = await request.post(`${BASE}/api/bot/line-binding`, {
		headers: { Origin: BASE, "Content-Type": "application/json" },
		data: { organizationId: "org-store-a", channelSecret: "x", accessToken: "y" },
	});
	expect(anon.status()).toBe(401);

	const owner = await roleContext(browser, "owner-a@e2e.test", "E2E_OWNER_PASSWORD");
	const store = await owner.request.get(`${BASE}/api/bot/store?organizationId=org-store-a`);
	expect(store.status()).toBe(200);
	expect(await store.text()).toContain("****a1b2");
	await owner.close();
});

test("S4 登入與註冊頁社群登入只有 LINE", async ({ browser }) => {
	const anon = await browser.newContext();
	const page = await anon.newPage();

	for (const [slug, label] of [
		["login", "login"],
		["signup", "signup"],
	] as const) {
		for (const width of [390, 1440]) {
			await page.setViewportSize({ width, height: 900 });
			await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle" });
			await page.screenshot({
				path: path.join(OUT_DIR, `task42-${label}-${width}.png`),
				fullPage: true,
			});
		}
	}

	// 決定(Q167 前後):社群登入只留 LINE;Email/密碼、登入連結、通行金鑰按先前決定保留
	for (const slug of ["login", "signup"]) {
		await page.goto(`${BASE}/${slug}`, { waitUntil: "networkidle" });
		await expect.soft(page.locator("button", { hasText: "LINE" }).first(), `${slug} LINE`).toBeVisible();
		for (const other of ["Google", "GitHub", "Apple", "Facebook", "Discord"]) {
			await expect.soft(page.locator("button", { hasText: other }), `${slug} 不應有 ${other}`).toHaveCount(0);
		}
		await expect.soft(page.locator('input[type="password"]'), `${slug} 密碼欄保留`).toHaveCount(1);
	}
	await anon.close();
});

test("S5 平台管理員設定每月上限", async ({ browser }) => {
	const admin = await roleContext(browser, "platform-admin@e2e.test", "E2E_ADMIN_PASSWORD");
	const page = await admin.newPage();

	await page.goto(`${BASE}/admin/bot-stores`, { waitUntil: "networkidle" });
	const row = page.locator("tr", { hasText: "店家A" });
	const input = row.getByLabel("每月上限");

	await input.fill("3");
	await row.getByRole("button", { name: "儲存" }).click();
	await expect(page.getByText("已儲存每月上限")).toBeVisible();

	await page.reload({ waitUntil: "networkidle" });
	await expect(page.locator("tr", { hasText: "店家A" }).getByLabel("每月上限")).toHaveValue("3");

	await page.locator("tr", { hasText: "店家A" }).getByLabel("每月上限").fill("");
	await page.locator("tr", { hasText: "店家A" }).getByRole("button", { name: "儲存" }).click();
	await expect(page.getByText("已儲存每月上限")).toBeVisible();

	await page.reload({ waitUntil: "networkidle" });
	const cleared = page.locator("tr", { hasText: "店家A" }).getByLabel("每月上限");
	await expect(cleared).toHaveValue("");
	await expect(cleared).toHaveAttribute("placeholder", "預設 5000");
	await admin.close();
});

test("S6 後台頁面在各寬度下沒有整頁橫向溢出", async ({ browser }) => {
	const owner = await roleContext(browser, "owner-a@e2e.test", "E2E_OWNER_PASSWORD");
	const admin = await roleContext(browser, "platform-admin@e2e.test", "E2E_ADMIN_PASSWORD");
	const pages = [
		...STORE_PAGES.map((slug) => ({ ctx: owner, url: `/store-a/${slug}` })),
		{ ctx: admin, url: "/admin/bot-stores" },
	];

	for (const width of WIDTHS) {
		for (const { ctx, url } of pages) {
			const page = await ctx.newPage();
			await page.setViewportSize({ width, height: 900 });
			await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
			const overflow = await page.evaluate(() => ({
				scroll: document.documentElement.scrollWidth,
				client: document.documentElement.clientWidth,
			}));
			expect(overflow.scroll, `${url} @${width}`).toBeLessThanOrEqual(overflow.client);
			await page.close();
		}
	}
	await owner.close();
	await admin.close();
});

test("S7 LINE 設定頁顯示 Channel secret 尚未確認", async ({ browser }) => {
	const owner = await roleContext(browser, "owner-a@e2e.test", "E2E_OWNER_PASSWORD");
	const page = await owner.newPage();

	for (const width of [390, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		await page.goto(`${BASE}/store-a/line-settings`, { waitUntil: "networkidle" });
		await expect(
			page.getByText("Channel secret 尚未確認,請傳一則訊息測試"),
		).toBeVisible();
		await page.screenshot({
			path: path.join(OUT_DIR, `task42-line-settings-${width}.png`),
			fullPage: true,
		});
	}
	await owner.close();
});
