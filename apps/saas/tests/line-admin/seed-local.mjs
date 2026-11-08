// 本機 LINE 後台 e2e 種子資料（只寫本機 .wrangler/state，不碰遠端 D1、不碰線上）。
// 用法：node tests/line-admin/seed-local.mjs [--keep-server]
// 冪等：可重複執行；帳號與資料列都用 UPSERT / OR IGNORE。
// 密碼只從 .env.e2e.local 讀取，不印出。
// 帳號不走 sign-up API：本機 preview 沒有 Resend 金鑰，註冊會在寄信模組載入時 500。
// 改為直接寫 user / account（credential），密碼雜湊用 better-auth 同一套 hashPassword。
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const AUTH_DIR = path.resolve(APP_DIR, "../../packages/auth");
const BASE = "http://localhost:3100";
const KEEP_SERVER = process.argv.includes("--keep-server");

// 本機預覽用的假值（非正式金鑰）。Worker 讀的是 .dev.vars，不是父行程環境變數，
// 所以寫成 .dev.vars（已被 .gitignore 排除），腳本結束時若是自己建的就刪除。
const DEV_VARS_PATH = path.join(APP_DIR, ".dev.vars");
const LOCAL_PREVIEW_VARS = {
	NEXT_PUBLIC_SAAS_URL: BASE,
	AUTH_REQUIRE_EMAIL_VERIFICATION: "false",
	RESEND_API_KEY: "re_local_build_placeholder",
	BETTER_AUTH_SECRET: "local-e2e-placeholder-secret-0123456789",
};
const LOCAL_PREVIEW_ENV = LOCAL_PREVIEW_VARS;

function ensureDevVars() {
	if (existsSync(DEV_VARS_PATH)) return false;
	const body = Object.entries(LOCAL_PREVIEW_VARS).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
	writeFileSync(DEV_VARS_PATH, body, { mode: 0o600 });
	return true;
}

function loadE2eEnv() {
	const text = readFileSync(path.join(APP_DIR, ".env.e2e.local"), "utf8");
	const env = {};
	for (const line of text.split("\n")) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
	return env;
}

function wrangler(args) {
	// 安全閘：所有 wrangler 指令都必須是本機模式
	if (!args.includes("--local")) throw new Error(`拒絕執行非本機 wrangler 指令：${args.join(" ")}`);
	execFileSync("npx", ["wrangler", ...args], { cwd: APP_DIR, stdio: ["ignore", "pipe", "pipe"] });
}

function wranglerQuery(sql) {
	const file = path.join(os.tmpdir(), `seed-local-${process.pid}.sql`);
	writeFileSync(file, sql);
	try {
		wrangler(["d1", "execute", "DB", "--local", `--file=${file}`]);
	} finally {
		rmSync(file, { force: true });
	}
}

async function loadHashPassword() {
	const require = createRequire(path.join(AUTH_DIR, "package.json"));
	const mod = await import(pathToFileURL(require.resolve("better-auth/crypto")).href);
	return mod.hashPassword;
}

async function serverUp() {
	try {
		const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(5000) });
		return res.status === 200;
	} catch {
		return false;
	}
}

async function startServer() {
	const child = spawn("npx", ["opennextjs-cloudflare", "preview", "--port", "3100"], {
		cwd: APP_DIR,
		detached: true,
		stdio: "ignore",
		env: { ...process.env, ...LOCAL_PREVIEW_ENV },
	});
	child.unref();
	for (let i = 0; i < 60; i++) {
		if (await serverUp()) return child;
		await new Promise((r) => setTimeout(r, 3000));
	}
	throw new Error("3100 預覽站 180 秒內未就緒");
}

async function signIn(email, password) {
	const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { Origin: BASE, "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	return res.status;
}

const ACCOUNTS = [
	{ id: "user-owner-a", name: "Owner A", email: "owner-a@e2e.test", envKey: "E2E_OWNER_PASSWORD" },
	{ id: "user-member-a", name: "Member A", email: "member-a@e2e.test", envKey: "E2E_MEMBER_PASSWORD" },
	{ id: "user-platform-admin", name: "Platform Admin", email: "platform-admin@e2e.test", envKey: "E2E_ADMIN_PASSWORD" },
];

function accountSql(hashes) {
	const rows = ACCOUNTS.map((a) => {
		const hash = hashes[a.email].replace(/'/g, "''");
		return `INSERT OR IGNORE INTO user (id, name, email, emailVerified, onboardingComplete, role, createdAt, updatedAt)
  VALUES ('${a.id}', '${a.name}', '${a.email}', 1, 1, NULL, strftime('%s','now'), strftime('%s','now'));
INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
  VALUES ('acc-${a.id}', '${a.id}', 'credential', '${a.id}', '${hash}', strftime('%s','now'), strftime('%s','now'))
  ON CONFLICT(id) DO UPDATE SET password = excluded.password, updatedAt = excluded.updatedAt;`;
	}).join("\n");
	return `${rows}
UPDATE user SET onboardingComplete = 1 WHERE email IN ('owner-a@e2e.test','member-a@e2e.test','platform-admin@e2e.test');
UPDATE user SET role = 'admin' WHERE email = 'platform-admin@e2e.test';
`;
}

const SEED_SQL = `
INSERT INTO organization (id, name, slug, createdAt) VALUES
  ('org-store-a', '店家A', 'store-a', strftime('%s','now')),
  ('org-store-b', '店家B', 'store-b', strftime('%s','now'))
ON CONFLICT(id) DO UPDATE SET name = excluded.name, slug = excluded.slug;

INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
  SELECT 'mem-owner-a-store-a', 'org-store-a', id, 'owner', strftime('%s','now') FROM user WHERE email = 'owner-a@e2e.test';
INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
  SELECT 'mem-member-a-store-a', 'org-store-a', id, 'member', strftime('%s','now') FROM user WHERE email = 'member-a@e2e.test';

INSERT INTO bot_store (organizationId, lineSecretMask, status, modelMode, usePlatformModel, monthlyLimit, lineSecretVerifiedAt, createdAt)
  VALUES ('org-store-a', '****a1b2', 'bound', 'platform', 0, NULL, NULL, strftime('%s','now'))
ON CONFLICT(organizationId) DO UPDATE SET
  lineSecretMask = excluded.lineSecretMask, status = excluded.status,
  monthlyLimit = NULL, lineSecretVerifiedAt = NULL;
INSERT INTO bot_store (organizationId, lineSecretMask, status, modelMode, usePlatformModel, monthlyLimit, lineSecretVerifiedAt, createdAt)
  VALUES ('org-store-b', '****c3d4', 'bound', 'platform', 0, NULL, NULL, strftime('%s','now'))
ON CONFLICT(organizationId) DO UPDATE SET
  lineSecretMask = excluded.lineSecretMask, status = excluded.status,
  monthlyLimit = NULL, lineSecretVerifiedAt = NULL;

INSERT INTO bot_faq (id, organizationId, question, answer, updatedAt) VALUES
  ('faq-store-a-hours', 'org-store-a', '營業時間', '週一至週五 09:00–18:00', strftime('%s','now')),
  ('faq-store-b-parking', 'org-store-b', '停車資訊', '地下停車場 2 小時免費', strftime('%s','now'))
ON CONFLICT(id) DO UPDATE SET question = excluded.question, answer = excluded.answer;
`;

async function main() {
	const env = loadE2eEnv();
	for (const a of ACCOUNTS) {
		if (!env[a.envKey]) throw new Error(`.env.e2e.local 缺少 ${a.envKey}`);
	}

	console.log("[1/4] 套用本機 migrations");
	wrangler(["d1", "migrations", "apply", "DB", "--local"]);

	console.log("[2/4] 寫入種子帳號（credential，已存在則更新密碼雜湊）");
	const hashPassword = await loadHashPassword();
	const hashes = {};
	for (const a of ACCOUNTS) hashes[a.email] = await hashPassword(env[a.envKey]);
	wranglerQuery(accountSql(hashes));
	console.log(`  寫入 ${ACCOUNTS.length} 個帳號`);

	console.log("[3/4] 寫入組織、成員、bot_store、FAQ（本機 D1）");
	wranglerQuery(SEED_SQL);

	console.log("[4/4] 確認 3100 預覽站並驗證三個帳號可登入（只印 HTTP 狀態）");
	const createdDevVars = ensureDevVars();
	let started = null;
	if (await serverUp()) {
		console.log("  3100 已在跑，沿用（若登入 500 請先停掉舊的 3100 再重跑）");
	} else {
		started = await startServer();
		console.log("  已啟動 3100（由本腳本啟動）");
	}
	for (const a of ACCOUNTS) {
		console.log(`  ${a.email}: sign-in HTTP ${await signIn(a.email, env[a.envKey])}`);
		// better-auth 登入有限流，間隔一下避免自己觸發 429
		await new Promise((r) => setTimeout(r, 4000));
	}

	if (started && !KEEP_SERVER) {
		// 只殺本腳本啟動的預覽站程序群組
		process.kill(-started.pid, "SIGTERM");
		console.log("已停止本腳本啟動的 3100 預覽站");
		if (createdDevVars) rmSync(DEV_VARS_PATH, { force: true });
	}
	console.log("種子完成");
}

main().catch((err) => {
	console.error(`種子失敗：${err.message}`);
	process.exit(1);
});
