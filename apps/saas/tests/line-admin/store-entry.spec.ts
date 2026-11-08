import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// 對應 feature：store-entry.feature（S1～S3）。依賴本機 3100 預覽站與種子帳號。
const BASE = "http://localhost:3100";
const HIDDEN_TEXTS = ["建立新的組織", "您的組織", "個人帳號"];

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`缺少環境變數 ${name}：請先 set -a; . ./.env.e2e.local; set +a`);
	}
	return value;
}

async function signInRequest(request: APIRequestContext, email: string, password: string) {
	const res = await request.post(`${BASE}/api/auth/sign-in/email`, {
		headers: { Origin: BASE, "Content-Type": "application/json" },
		data: { email, password },
	});
	expect(res.status(), `${email} 登入失敗`).toBe(200);
}

async function roleContext(browser: Browser, email: string, envName: string) {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await signInRequest(context.request, email, requireEnv(envName));
	return context;
}

async function expectNoHiddenTexts(page: Page) {
	for (const text of HIDDEN_TEXTS) {
		await expect(page.getByText(text, { exact: true }), `頁面不應含「${text}」`).toHaveCount(0);
	}
}

test.setTimeout(120_000);

test("S1 全新使用者登入後自動建店並進入 /{slug}", async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const stamp = Date.now().toString(36);
	const email = `store-entry-${stamp}@e2e.test`;
	const password = `E2e-${stamp}-Pass!`;

	const signUp = await context.request.post(`${BASE}/api/auth/sign-up/email`, {
		headers: { Origin: BASE, "Content-Type": "application/json" },
		data: { name: `新店主${stamp}`, email, password },
	});
	expect(signUp.status(), "註冊失敗").toBe(200);
	await signInRequest(context.request, email, password);

	// 等同完成 onboarding 最後一步（OnboardingForm 的 onCompleted）
	const onboarded = await context.request.post(`${BASE}/api/auth/update-user`, {
		headers: { Origin: BASE, "Content-Type": "application/json" },
		data: { onboardingComplete: true },
	});
	expect(onboarded.status(), "onboarding 完成失敗").toBe(200);

	const page = await context.newPage();
	await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
	await page.waitForURL(/\/[a-z0-9-]+$/, { timeout: 30_000 });
	const slugPath = new URL(page.url()).pathname;
	expect(slugPath).not.toBe("/new-organization");
	await expectNoHiddenTexts(page);

	await page.reload({ waitUntil: "networkidle" });
	expect(new URL(page.url()).pathname, "重新整理後不應換成另一個組織").toBe(slugPath);
	await context.close();
});

test("S2 一般成員看不到組織切換器", async ({ browser }) => {
	const member = await roleContext(browser, "member-a@e2e.test", "E2E_MEMBER_PASSWORD");
	const page = await member.newPage();
	await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
	await expectNoHiddenTexts(page);
	await member.close();
});

test("S3 平台管理員看得到組織切換器", async ({ browser }) => {
	const admin = await roleContext(browser, "platform-admin@e2e.test", "E2E_ADMIN_PASSWORD");
	const page = await admin.newPage();
	await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
	await page.locator('nav button[aria-haspopup="menu"]').first().click();
	await expect(page.getByText("建立新的組織", { exact: true })).toBeVisible();
	await admin.close();
});
