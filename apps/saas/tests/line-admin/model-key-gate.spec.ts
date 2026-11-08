import type { APIRequestContext, Browser } from "@playwright/test";
import { expect, test } from "@playwright/test";

// 對應 feature：model-key-gate.feature（M1～M4）。依賴本機 3100 預覽站與種子帳號。
const BASE = "http://localhost:3100";
const STORE_A = "org-store-a";
const STORE_B = "org-store-b";
const OWN_KEY_HINT = "目前尚未開通平台模型";
const OWN_KEY_REQUIRED = "請先填入你自己的 AI 金鑰，機器人才會回覆客人";

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

async function setUsePlatformModel(
	request: APIRequestContext,
	organizationId: string,
	usePlatformModel: boolean,
) {
	return request.put(`${BASE}/api/bot/admin/stores/${organizationId}/use-platform-model`, {
		headers: { Origin: BASE, "Content-Type": "application/json" },
		data: { organizationId, usePlatformModel },
	});
}

async function readStoreFlag(request: APIRequestContext, organizationId: string) {
	const res = await request.get(`${BASE}/api/bot/admin/stores`);
	expect(res.status(), "管理員讀取店家列表").toBe(200);
	const body = (await res.json()) as {
		stores: { organizationId: string; usePlatformModel: boolean }[];
	};
	const store = body.stores.find((s) => s.organizationId === organizationId);
	if (!store) {
		throw new Error(`找不到 ${organizationId}`);
	}
	return store.usePlatformModel;
}

test.setTimeout(120_000);

test("M1 店家 owner 在模型設定頁看不到平台模型開關，也不能修改", async ({ browser }) => {
	const owner = await roleContext(browser, "owner-a@e2e.test", "E2E_OWNER_PASSWORD");
	const page = await owner.newPage();

	await page.goto(`${BASE}/store-a/model-settings`, { waitUntil: "networkidle" });
	await expect(page.getByText(OWN_KEY_HINT)).toBeVisible();
	await expect(page.getByRole("switch"), "店家頁不應有平台模型開關").toHaveCount(0);

	const put = await setUsePlatformModel(owner.request, STORE_A, true);
	expect(put.status(), "店家 owner 不應能修改 usePlatformModel").toBe(403);

	const flag = await owner.request.get(`${BASE}/api/bot/model-settings?organizationId=${STORE_A}`);
	expect(flag.status()).toBe(200);
	expect((await flag.json()).usePlatformModel).toBe(false);
	await owner.close();
});

test("M2 一般成員呼叫修改 usePlatformModel 的 API 被拒絕", async ({ browser }) => {
	const member = await roleContext(browser, "member-a@e2e.test", "E2E_MEMBER_PASSWORD");

	const put = await setUsePlatformModel(member.request, STORE_A, true);
	expect(put.status(), "一般成員不應能修改 usePlatformModel").toBe(403);

	const admin = await roleContext(browser, "platform-admin@e2e.test", "E2E_ADMIN_PASSWORD");
	expect(await readStoreFlag(admin.request, STORE_A), "店家A 旗標不應被改動").toBe(false);
	await admin.close();
	await member.close();
});

test("M3 平台管理員可在後台切換平台模型，切換後狀態改變", async ({ browser }) => {
	const admin = await roleContext(browser, "platform-admin@e2e.test", "E2E_ADMIN_PASSWORD");
	const original = await readStoreFlag(admin.request, STORE_B);
	const page = await admin.newPage();

	try {
		await page.goto(`${BASE}/admin/bot-stores`, { waitUntil: "networkidle" });
		const row = page.locator("tr", { hasText: "店家B" });
		const toggle = row.getByRole("switch", { name: "平台模型" });
		await expect(toggle).toHaveAttribute("aria-checked", String(original));

		await toggle.click();
		await expect(page.getByText("已更新平台模型設定")).toBeVisible();
		expect(await readStoreFlag(admin.request, STORE_B), "切換後 API 應讀回新值").toBe(!original);

		await page.reload({ waitUntil: "networkidle" });
		await expect(
			page.locator("tr", { hasText: "店家B" }).getByRole("switch", { name: "平台模型" }),
		).toHaveAttribute("aria-checked", String(!original));
	} finally {
		// 測完一律切回原值，避免影響其他測試與本機種子狀態
		await setUsePlatformModel(admin.request, STORE_B, original);
		expect(await readStoreFlag(admin.request, STORE_B), "店家B 應切回原值").toBe(original);
		await admin.close();
	}
});

test("M4 未填金鑰的店家模型設定頁顯示未設定狀態，不外露金鑰", async ({ browser }) => {
	const owner = await roleContext(browser, "owner-a@e2e.test", "E2E_OWNER_PASSWORD");
	const page = await owner.newPage();

	const settings = await owner.request.get(`${BASE}/api/bot/model-settings?organizationId=${STORE_A}`);
	expect(settings.status()).toBe(200);
	const view = (await settings.json()) as { apiKeyMask: string | null };
	expect(view.apiKeyMask, "API 不應回傳遮罩金鑰").toBeNull();

	await page.goto(`${BASE}/store-a/model-settings`, { waitUntil: "networkidle" });
	await expect(page.getByText(OWN_KEY_REQUIRED)).toBeVisible();
	await expect(page.locator('input[type="password"]')).toHaveValue("");
	const bodyText = await page.locator("body").innerText();
	expect(bodyText, "頁面不應外露遮罩金鑰").not.toMatch(/\*{4}/);
	await owner.close();
});
