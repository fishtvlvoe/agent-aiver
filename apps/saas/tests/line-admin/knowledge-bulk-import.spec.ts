import type { APIRequestContext, Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// 對應 feature：knowledge-bulk-import.feature。依賴本機 3100 預覽站與種子帳號 owner-a。
const BASE = "http://localhost:3100";
const KNOWLEDGE_URL = `${BASE}/store-a/knowledge`;

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
			headers: { "Content-Type": "application/json" },
			data: { email, password },
		});
		status = res.status();
		if (status !== 429) break;
		await new Promise((resolve) => setTimeout(resolve, 10_000));
	}
	expect(status, `${email} 登入失敗`).toBe(200);
}

async function ownerPage(browser: Browser, width = 1440): Promise<Page> {
	const context = await browser.newContext({ viewport: { width, height: 900 } });
	await signIn(context.request, "owner-a@e2e.test", requireEnv("E2E_OWNER_PASSWORD"));
	return context.newPage();
}

async function openBulkDialog(page: Page) {
	await page.goto(KNOWLEDGE_URL, { waitUntil: "networkidle" });
	await page.getByRole("button", { name: "批次貼上", exact: true }).click();
	await expect(page.locator('[role="dialog"]:not([data-slot="toast"])')).toBeVisible();
}

test.setTimeout(120_000);

test("貼上兩則問答後列表新增兩筆", async ({ browser }) => {
	const stamp = Date.now().toString(36);
	const q1 = `批次測試問題A-${stamp}`;
	const q2 = `批次測試問題B-${stamp}`;
	const page = await ownerPage(browser);

	await openBulkDialog(page);
	await page.getByLabel("貼上問答內容").fill(`問:${q1}\n答:回答A\n\n問:${q2}\n答:回答B`);

	await expect(page.getByText("可匯入 2 則", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "匯入問答", exact: true }).click();

	await expect(page.locator('[role="dialog"]:not([data-slot="toast"])')).toBeHidden();
	await expect(page.getByText("已匯入 2 則問答", { exact: true })).toBeVisible();
	await expect(page.getByRole("cell", { name: q1, exact: true })).toBeVisible();
	await expect(page.getByRole("cell", { name: q2, exact: true })).toBeVisible();
	await page.context().close();
});

test("貼上 101 則時顯示錯誤且不可匯入", async ({ browser }) => {
	const page = await ownerPage(browser);
	const text = Array.from(
		{ length: 101 },
		(_, i) => `問:超量題目${i + 1}\n答:超量回答${i + 1}`,
	).join("\n\n");
	await openBulkDialog(page);
	await expect.poll(() => page.locator("table tbody tr").count(), { timeout: 20_000 }).toBeGreaterThan(0);
	const rowsBefore = await page.locator("table tbody tr").count();
	await page.getByLabel("貼上問答內容").fill(text);

	await expect(page.getByRole("alert")).toContainText("一次最多 100 則");
	await expect(page.getByText(/可匯入/)).toHaveCount(0);
	await expect(page.getByRole("button", { name: "匯入問答", exact: true })).toBeDisabled();

	await page.getByRole("button", { name: "取消", exact: true }).click();
	await expect(page.locator('[role="dialog"]:not([data-slot="toast"])')).toBeHidden();
	await expect(page.locator("table tbody tr")).toHaveCount(rowsBefore);
	await page.context().close();
});

test("手機 375 寬的批次貼上對話框不橫向溢出", async ({ browser }) => {
	const page = await ownerPage(browser, 375);

	await openBulkDialog(page);
	await page.getByLabel("貼上問答內容").fill("問:手機測試\n答:回答");
	await expect(page.getByText("可匯入 1 則", { exact: true })).toBeVisible();

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow, "頁面不應有橫向捲軸").toBeLessThanOrEqual(0);
	await page.context().close();
});
