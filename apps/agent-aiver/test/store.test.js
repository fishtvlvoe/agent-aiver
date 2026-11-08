import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getTenantBySlug,
  writeAudit,
  writeConversation,
  getUsageCount,
  getFaqs,
  incrementUsage,
  markSecretVerified,
} from "../src/lib/store.js";

// 遷移 SQL 副本（來源：cf-wt-line-admin/packages/database/drizzle/migrations，0000/0002/0003/0004）
const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = [
  "0000_clear_red_shift.sql",
  "0002_keen_hardball.sql",
  "0003_conscious_polaris.sql",
  "0004_bot_store_monthly_limit.sql",
  "0005_bot_store_secret_verified.sql",
  "0006_bot_store_use_platform_model.sql",
  "0007_bot_store_model_account_id.sql",
  "0008_bot_store_cf_oauth.sql",
  "0009_bot_store_persona.sql",
];

// node:sqlite 回傳的 row 是無原型物件，轉成一般物件（與 D1 相同）
const plain = (row) => ({ ...row });

// 把 node:sqlite 包成與 D1 相同的 prepare().bind().first()/all()/run() 介面
function makeD1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind(...args) {
          return {
            async first() {
              const row = stmt.get(...args);
              return row ? plain(row) : null;
            },
            async all() {
              return { results: stmt.all(...args).map(plain) };
            },
            async run() {
              stmt.run(...args);
              return {};
            },
          };
        },
      };
    },
  };
}

// 記憶體庫 + 套用遷移 + 兩家店（A、B）與一家沒有 bot_store 列的店（C）
function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const f of MIGRATIONS) db.exec(readFileSync(path.join(here, "fixtures/bot-migrations", f), "utf8"));
  db.exec(`
    INSERT INTO organization (id, name, slug, createdAt) VALUES
      ('org-a', 'A 店', 'store-a', 0),
      ('org-b', 'B 店', 'store-b', 0),
      ('org-c', 'C 店', 'store-c', 0);
    INSERT INTO bot_store (organizationId, status, lineSecretEnc, lineTokenEnc, modelMode, modelProvider, modelBaseUrl, modelName, modelKeyEnc) VALUES
      ('org-a', 'bound', 'enc-secret-a', 'enc-token-a', 'custom', 'openai', 'https://a.example/v1', 'gpt-a', 'enc-key-a'),
      ('org-b', 'bound', 'enc-secret-b', 'enc-token-b', 'platform', NULL, NULL, NULL, NULL);
    INSERT INTO bot_faq (id, organizationId, question, answer, updatedAt) VALUES
      ('f-a', 'org-a', '運費？', '滿 599 免運', 1),
      ('f-b', 'org-b', '批發價？', 'B 店機密批發價', 1);
  `);
  return db;
}

const EVENT_A = { source: { userId: "U-A" } };
const EVENT_B = { source: { userId: "U-B" } };

test("getTenantBySlug：回傳 snake_case 欄位（沿用舊 tenant 物件形狀）", async () => {
  const env = { DB: makeD1(freshDb()) };
  const t = await getTenantBySlug(env, "store-a");
  assert.deepEqual(t, {
    id: "org-a",
    slug: "store-a",
    name: "A 店",
    status: "bound",
    line_secret_enc: "enc-secret-a",
    line_token_enc: "enc-token-a",
    model_mode: "custom",
    model_base_url: "https://a.example/v1",
    model_name: "gpt-a",
    model_key_enc: "enc-key-a",
    model_provider: "openai",
    model_account_id: null,
    monthly_limit: null,
    persona: null,
    line_secret_verified_at: null,
    use_platform_model: 0,
    cf_refresh_token_enc: null,
    cf_access_expires_at: null,
    cf_oauth_version: 0,
    cf_refreshing_until: null,
    cf_oauth_status: null,
  });
});

test("getTenantBySlug：cloudflare 的 Account ID 回傳為 model_account_id", async () => {
  const db = freshDb();
  db.exec("UPDATE bot_store SET modelProvider = 'cloudflare', modelAccountId = '0123456789abcdef0123456789abcdef' WHERE organizationId = 'org-a'");
  const env = { DB: makeD1(db) };
  assert.equal((await getTenantBySlug(env, "store-a")).model_account_id, "0123456789abcdef0123456789abcdef");
  assert.equal((await getTenantBySlug(env, "store-b")).model_account_id, null);
});

test("getTenantBySlug：usePlatformModel 預設 0，開通後回傳 1（use_platform_model）", async () => {
  const db = freshDb();
  db.exec("UPDATE bot_store SET usePlatformModel = 1 WHERE organizationId = 'org-b'");
  const env = { DB: makeD1(db) };
  assert.equal((await getTenantBySlug(env, "store-a")).use_platform_model, 0);
  assert.equal((await getTenantBySlug(env, "store-b")).use_platform_model, 1);
});

test("getTenantBySlug：monthlyLimit 有設定時回傳店家自訂值（monthly_limit）", async () => {
  const db = freshDb();
  db.exec("UPDATE bot_store SET monthlyLimit = 3 WHERE organizationId = 'org-a'");
  const env = { DB: makeD1(db) };
  const a = await getTenantBySlug(env, "store-a");
  assert.equal(a.monthly_limit, 3);
  assert.equal((await getTenantBySlug(env, "store-b")).monthly_limit, null);
});

test("getTenantBySlug：未知 slug → null；已建 organization 但無 bot_store 列 → null（JOIN 語意）", async () => {
  const env = { DB: makeD1(freshDb()) };
  assert.equal(await getTenantBySlug(env, "nope"), null);
  assert.equal(await getTenantBySlug(env, "store-c"), null);
});

test("getTenantBySlug 隔離：查 B 店只拿到 B 店的金鑰，不會拿到 A 店", async () => {
  const env = { DB: makeD1(freshDb()) };
  const b = await getTenantBySlug(env, "store-b");
  assert.equal(b.id, "org-b");
  assert.equal(b.line_secret_enc, "enc-secret-b");
  assert.equal(b.model_key_enc, null);
});

test("writeAudit：寫入本店 organizationId、detail 為 JSON、createdAt 為整數秒", async () => {
  const db = freshDb();
  const env = { DB: makeD1(db) };
  const a = await getTenantBySlug(env, "store-a");
  const before = Math.floor(Date.now() / 1000);
  await writeAudit(env, a, "rate_limited", { userId: "U-A" });
  const row = db.prepare("SELECT organizationId, event, detail, createdAt FROM bot_audit_event").get();
  assert.equal(row.organizationId, "org-a");
  assert.equal(row.event, "rate_limited");
  assert.deepEqual(JSON.parse(row.detail), { userId: "U-A" });
  assert.equal(typeof row.createdAt, "number");
  assert.ok(row.createdAt >= before && row.createdAt <= before + 5, "createdAt 應為秒級 Unix 時間");
  const bCount = db.prepare("SELECT COUNT(*) AS c FROM bot_audit_event WHERE organizationId = 'org-b'").get().c;
  assert.equal(bCount, 0, "A 店寫入不可出現在 B 店");
});

test("writeConversation：寫入 userId/文字/status，且 A、B 店互不混入", async () => {
  const db = freshDb();
  const env = { DB: makeD1(db) };
  const a = await getTenantBySlug(env, "store-a");
  const b = await getTenantBySlug(env, "store-b");
  await writeConversation(env, a, EVENT_A, "運費？", "滿 599 免運", "missed");
  await writeConversation(env, b, EVENT_B, "哈囉", "你好", "handoff");
  const rowsA = db.prepare("SELECT organizationId, userId, userText, aiText, status, createdAt FROM bot_conversation WHERE organizationId = 'org-a'").all();
  assert.equal(rowsA.length, 1);
  assert.equal(rowsA[0].userId, "U-A");
  assert.equal(rowsA[0].userText, "運費？");
  assert.equal(rowsA[0].aiText, "滿 599 免運");
  assert.equal(rowsA[0].status, "missed");
  assert.equal(typeof rowsA[0].createdAt, "number");
  const rowsB = db.prepare("SELECT status FROM bot_conversation WHERE organizationId = 'org-b'").all().map(plain);
  assert.deepEqual(rowsB, [{ status: "handoff" }]);
});

test("writeConversation：沒有 event.source 時 userId 為 NULL", async () => {
  const db = freshDb();
  const env = { DB: makeD1(db) };
  const a = await getTenantBySlug(env, "store-a");
  await writeConversation(env, a, {}, "hi", "hello", "missed");
  assert.equal(db.prepare("SELECT userId FROM bot_conversation").get().userId, null);
});

test("getUsageCount / incrementUsage：無列為 0，遞增後正確，按店家與月份分開計", async () => {
  const env = { DB: makeD1(freshDb()) };
  const a = await getTenantBySlug(env, "store-a");
  const b = await getTenantBySlug(env, "store-b");
  assert.equal(await getUsageCount(env, a, "2026-11"), 0);
  await incrementUsage(env, a, "2026-11");
  await incrementUsage(env, a, "2026-11");
  assert.equal(await getUsageCount(env, a, "2026-11"), 2);
  assert.equal(await getUsageCount(env, a, "2026-12"), 0, "不同月份互不影響");
  assert.equal(await getUsageCount(env, b, "2026-11"), 0, "B 店計數不受 A 店影響");
});

test("getFaqs：只回本店 FAQ（question/answer），不混入他店", async () => {
  const env = { DB: makeD1(freshDb()) };
  const a = await getTenantBySlug(env, "store-a");
  const b = await getTenantBySlug(env, "store-b");
  assert.deepEqual(await getFaqs(env, a), [{ question: "運費？", answer: "滿 599 免運" }]);
  assert.deepEqual(await getFaqs(env, b), [{ question: "批發價？", answer: "B 店機密批發價" }]);
  const c = { id: "org-c" };
  assert.deepEqual(await getFaqs(env, c), []);
});

test("markSecretVerified：只寫自己那店、已有值不覆蓋", async () => {
  const env = { DB: makeD1(freshDb()) };
  const a = await getTenantBySlug(env, "store-a");
  assert.equal(a.line_secret_verified_at, null);
  await markSecretVerified(env, a);
  const a1 = await getTenantBySlug(env, "store-a");
  assert.ok(a1.line_secret_verified_at > 0);
  const b = await getTenantBySlug(env, "store-b");
  assert.equal(b.line_secret_verified_at, null, "B 店不受影響");
  await new Promise((r) => setTimeout(r, 1100));
  await markSecretVerified(env, a);
  assert.equal((await getTenantBySlug(env, "store-a")).line_secret_verified_at, a1.line_secret_verified_at);
});
