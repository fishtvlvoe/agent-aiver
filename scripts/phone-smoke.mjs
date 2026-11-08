// 手機實機冒煙:連到 adb 轉接的手機 Chrome,登入後台並走過各頁,量橫向溢出。
// 前置:bash scripts/verify-reset-password.sh 先改密碼並寫入 $PW_FILE(預設 /tmp/aiver-test-pw);
//       adb forward tcp:9333 localabstract:chrome_devtools_remote
// 用法:node scripts/phone-smoke.mjs [email]  測完請刪 $PW_FILE 並 adb forward --remove tcp:9333
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const ADMIN = process.env.ADMIN ?? "https://admin.aiver.me";
const email = process.argv[2] ?? "fish-xiaoou@agentmail.to";
const pw = fs.readFileSync(process.env.PW_FILE ?? "/tmp/aiver-test-pw", "utf8").trim();

const browser = await chromium.connectOverCDP("http://localhost:9333");
const p = await browser.contexts()[0].newPage();
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
let bad = 0;

await p.goto(`${ADMIN}/login`);
await p.fill('input[type="email"],input[name="email"]', email);
await p.fill('input[type="password"]', pw);
await p.click('button[type="submit"]');
await p.waitForURL((u) => u.pathname.split("/").filter(Boolean).length >= 2, { timeout: 20000 });
const slug = new URL(p.url()).pathname.split("/")[1];
for (const path of ["knowledge", "conversations", "usage", "line-settings", "model-settings", "settings/general"]) {
	const r = await p.goto(`${ADMIN}/${slug}/${path}`);
	await p.waitForTimeout(2500);
	const ov = await overflow();
	const ok = r.status() === 200 && ov <= 0;
	if (!ok) bad = 1;
	console.log(`${ok ? "PASS" : "FAIL"} ${path} http=${r.status()} overflow=${ov}`);
}
await p.close();
process.exit(bad);
