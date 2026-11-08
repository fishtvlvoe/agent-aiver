import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureFreshCfToken } from "../src/lib/cf-oauth-refresh.js";
import { getTenantBySlug } from "../src/lib/store.js";
import { handleLineEvents, NO_MODEL_REPLY } from "../src/reply.js";
import { wrapSecret, unwrapSecret } from "../src/lib/crypto.js";

// Cloudflare OAuth 續期：規格 §8 的 6 類案例（未到期、成功寫入、invalid_grant、暫時性錯誤、鎖競態、invalid 走 NO_MODEL_REPLY）
const PASSWORD = "test-master-password";
const NOW = 1_700_000_000;
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";

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

// node:sqlite 包成與 D1 相同介面；run() 回 meta.changes 與 D1 一致，樂觀鎖才判得出輸贏
function makeD1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind(...args) {
          return {
            async first() {
              const row = stmt.get(...args);
              return row ? { ...row } : null;
            },
            async all() {
              return { results: stmt.all(...args).map((row) => ({ ...row })) };
            },
            async run() {
              const info = stmt.run(...args);
              return { meta: { changes: info.changes } };
            },
          };
        },
      };
    },
  };
}

// 記憶體庫 + 全部遷移 + 一家 OAuth 已連結的店（預設 access token 還很新）
async function freshEnv({ status = "linked", accessExpiresAt = NOW + 600, version = 0, refreshingUntil = null } = {}) {
  const db = new DatabaseSync(":memory:");
  for (const f of MIGRATIONS) db.exec(readFileSync(path.join(here, "fixtures/bot-migrations", f), "utf8"));
  const key = await wrapSecret(PASSWORD, "access-old");
  const refresh = await wrapSecret(PASSWORD, "refresh-old");
  db.prepare("INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)").run("org-cf", "CF 店", "cf-store", 0);
  db.prepare(
    `INSERT INTO bot_store (organizationId, status, lineTokenEnc, modelMode, modelProvider, modelAccountId, modelKeyEnc,
       cfRefreshTokenEnc, cfAccessExpiresAt, cfOauthVersion, cfRefreshingUntil, cfOauthStatus)
     VALUES (?, 'bound', NULL, 'custom', 'cloudflare', ?, ?, ?, ?, ?, ?, ?)`,
  ).run("org-cf", ACCOUNT_ID, key, refresh, accessExpiresAt, version, refreshingUntil, status);
  const env = { DB: makeD1(db), MASTER_KEY: PASSWORD, LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  return { db, env };
}

const rawRow = (db) => db.prepare("SELECT * FROM bot_store WHERE organizationId = ?").get("org-cf");
const auditCount = (db, event) =>
  db.prepare("SELECT COUNT(*) AS n FROM bot_audit_event WHERE event = ?").get(event).n;

// 假 fetch：記錄每次呼叫，回應由 handler 決定
function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return handler(url, opts);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}
const okRes = (body) => ({ ok: true, status: 200, json: async () => body });
const errRes = (status, body = {}) => ({ ok: false, status, json: async () => body });

test("未到期不續期：access 還剩 >120 秒就直接用既有 token，不呼叫 token endpoint", async () => {
  const { env, db } = await freshEnv({ accessExpiresAt: NOW + 600 });
  const tenant = await getTenantBySlug(env, "cf-store");
  const fetchImpl = fakeFetch(() => assert.fail("不應呼叫 token endpoint"));

  const res = await ensureFreshCfToken(env, tenant, { now: NOW, fetchImpl });

  assert.deepEqual(res, { ok: true, accessToken: "access-old" });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(rawRow(db).cfOauthVersion, 0);
});

test("成功續期寫入：新 access 與新 refresh 加密寫回，版本 +1，鎖清除", async () => {
  const { env, db } = await freshEnv({ accessExpiresAt: NOW + 10 });
  const tenant = await getTenantBySlug(env, "cf-store");
  const fetchImpl = fakeFetch(() =>
    okRes({ access_token: "access-new", refresh_token: "refresh-new", expires_in: 3600 }),
  );

  const res = await ensureFreshCfToken(env, tenant, { now: NOW, fetchImpl });

  assert.deepEqual(res, { ok: true, accessToken: "access-new" });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, "https://dash.cloudflare.com/oauth2/token");
  const sent = new URLSearchParams(fetchImpl.calls[0].opts.body);
  assert.equal(sent.get("grant_type"), "refresh_token");
  assert.equal(sent.get("client_id"), "4945fa51a38ffdc8a49fbe6af858f1c1");
  assert.equal(sent.get("refresh_token"), "refresh-old");
  assert.equal(sent.has("client_secret"), false);

  const row = rawRow(db);
  assert.equal(row.cfOauthVersion, 1);
  assert.equal(row.cfAccessExpiresAt, NOW + 3600);
  assert.equal(row.cfRefreshingUntil, null);
  assert.equal(await unwrapSecret(PASSWORD, row.modelKeyEnc), "access-new");
  assert.equal(await unwrapSecret(PASSWORD, row.cfRefreshTokenEnc), "refresh-new");
});

test("invalid_grant 才把狀態改成 invalid，並寫稽核，回傳 reason invalid", async () => {
  const { env, db } = await freshEnv({ accessExpiresAt: NOW + 10 });
  const tenant = await getTenantBySlug(env, "cf-store");
  const fetchImpl = fakeFetch(() => errRes(400, { error: "invalid_grant" }));

  const res = await ensureFreshCfToken(env, tenant, { now: NOW, fetchImpl });

  assert.deepEqual(res, { ok: false, reason: "invalid" });
  assert.equal(rawRow(db).cfOauthStatus, "invalid");
  assert.equal(auditCount(db, "cf_oauth_invalid"), 1);
});

test("暫時性錯誤（5xx、429、逾時、網路錯誤）不改狀態：舊 token 未過期繼續用，已過期回 transient", async () => {
  const failures = [
    () => errRes(500, { error: "server_error" }),
    () => errRes(429, { error: "rate_limited" }),
    () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    },
    () => {
      throw new TypeError("fetch failed");
    },
  ];
  for (const fail of failures) {
    const { env, db } = await freshEnv({ accessExpiresAt: NOW + 10 });
    const tenant = await getTenantBySlug(env, "cf-store");
    const stillValid = await ensureFreshCfToken(env, tenant, { now: NOW, fetchImpl: fakeFetch(fail) });
    assert.deepEqual(stillValid, { ok: true, accessToken: "access-old" });
    assert.equal(rawRow(db).cfOauthStatus, "linked");
    assert.equal(auditCount(db, "cf_oauth_invalid"), 0);

    const { env: env2, db: db2 } = await freshEnv({ accessExpiresAt: NOW - 1 });
    const expired = await getTenantBySlug(env2, "cf-store");
    const res = await ensureFreshCfToken(env2, expired, { now: NOW, fetchImpl: fakeFetch(fail) });
    assert.deepEqual(res, { ok: false, reason: "transient" });
    assert.equal(rawRow(db2).cfOauthStatus, "linked");
  }
});

test("鎖競態輸家：別人正在續期時等待並重讀；對方寫入新版本就用新 token，未完成就用未過期的舊 token", async () => {
  // 情境 A：對方續期完成
  const { env, db } = await freshEnv({ accessExpiresAt: NOW + 10, refreshingUntil: NOW + 15 });
  const tenant = await getTenantBySlug(env, "cf-store");
  const won = await wrapSecret(PASSWORD, "access-won");
  const fetchImpl = fakeFetch(() => assert.fail("輸家不應呼叫 token endpoint"));
  let sleeps = 0;
  const sleep = async () => {
    sleeps++;
    if (sleeps === 1) {
      db.prepare(
        "UPDATE bot_store SET modelKeyEnc = ?, cfAccessExpiresAt = ?, cfOauthVersion = 1, cfRefreshingUntil = NULL WHERE organizationId = ?",
      ).run(won, NOW + 3600, "org-cf");
    }
  };

  const res = await ensureFreshCfToken(env, tenant, { now: NOW, fetchImpl, sleep });

  assert.deepEqual(res, { ok: true, accessToken: "access-won" });
  assert.equal(sleeps, 1);
  assert.equal(fetchImpl.calls.length, 0);

  // 情境 B：對方一直沒完成，三次重讀後舊 token 還沒過期 → 用舊的
  const { env: env2 } = await freshEnv({ accessExpiresAt: NOW + 10, refreshingUntil: NOW + 15 });
  const tenant2 = await getTenantBySlug(env2, "cf-store");
  let sleeps2 = 0;
  const res2 = await ensureFreshCfToken(env2, tenant2, {
    now: NOW,
    fetchImpl: fakeFetch(() => assert.fail("輸家不應呼叫 token endpoint")),
    sleep: async () => sleeps2++,
  });
  assert.deepEqual(res2, { ok: true, accessToken: "access-old" });
  assert.equal(sleeps2, 3);
});

test("invalid 狀態走 NO_MODEL_REPLY：不呼叫 AI、不續期，回固定話術", async () => {
  const { env, db } = await freshEnv({ status: "invalid", accessExpiresAt: NOW + 600 });
  const tenant = await getTenantBySlug(env, "cf-store");
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    assert.fail("invalid 不應呼叫 AI");
  };
  const event = {
    type: "message",
    replyToken: "rt-invalid",
    source: { userId: "U-invalid" },
    message: { type: "text", text: "運費多少" },
  };

  await handleLineEvents(env, tenant, [event], { fetchImpl, now: NOW * 1000 });

  const line = calls.find((c) => c.url.includes("api.line.me"));
  assert.equal(line.body.messages[0].text, NO_MODEL_REPLY);
  assert.equal(calls.filter((c) => c.url.includes("chat/completions")).length, 0);
  assert.equal(rawRow(db).cfOauthVersion, 0);
});

test("linked 且 token 有效：回覆時 provider 的 Authorization 用 OAuth access token", async () => {
  const { env } = await freshEnv({ accessExpiresAt: NOW + 600 });
  const tenant = await getTenantBySlug(env, "cf-store");
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    return {
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: "AI 回覆" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    };
  };
  const event = {
    type: "message",
    replyToken: "rt-linked",
    source: { userId: "U-linked" },
    message: { type: "text", text: "運費多少" },
  };

  await handleLineEvents(env, tenant, [event], { fetchImpl, now: NOW * 1000 });

  const ai = calls.find((c) => c.url.includes("chat/completions"));
  assert.equal(ai.opts.headers.Authorization, "Bearer access-old");
});
