import { test } from "node:test";
import assert from "node:assert/strict";
import { handleWebhook } from "../src/webhook.js";
import { signLineBody } from "../src/lib/line-signature.js";

const SECRET = "test-channel-secret";

// 假 D1：只支援本測試用到的 organization 查詢與 bot_audit_event、bot_conversation 寫入
function makeFakeDb({ tenant }) {
  const inserts = [];
  return {
    inserts,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM organization") && args[0] === tenant.slug) return tenant;
              return null;
            },
            async run() {
              inserts.push({ sql, args });
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

const TENANT = { id: "t1", slug: "demo", status: "bound" };
const PAYLOAD = JSON.stringify({
  destination: "Uxxx",
  events: [{ type: "message", source: { userId: "U123" }, message: { type: "text", text: "hi" } }],
});

function makeRequest(body, signature) {
  const headers = { "content-type": "application/json" };
  if (signature !== undefined) headers["x-line-signature"] = signature;
  return new Request("http://localhost/webhook/demo", { method: "POST", headers, body });
}

test("webhook：正確簽名回 200，事件進入回覆管線（寫 conversations）", async () => {
  const db = makeFakeDb({ tenant: TENANT });
  const env = { DB: db, LINE_CHANNEL_SECRET: SECRET, LINE_CHANNEL_ACCESS_TOKEN: "t" };
  // 無 provider → 走兜底話術；stub fetch 攔下 LINE reply
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({}) });
  try {
    const sig = await signLineBody(SECRET, PAYLOAD);
    const res = await handleWebhook(makeRequest(PAYLOAD, sig), env, "demo");
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.handled, 1);
    // 回覆管線寫了一筆 conversations（店家未設定 AI → 固定話術，見 no-model-gate.test.js）
    assert.ok(db.inserts.some((i) => i.sql.includes("bot_conversation")));
    assert.ok(db.inserts.some((i) => i.sql.includes("bot_audit_event"))); // all_providers_failed
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("webhook：首次簽章成功寫入驗證時間，已有值不再寫", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({}) });
  try {
    const sig = await signLineBody(SECRET, PAYLOAD);
    const env1 = { DB: makeFakeDb({ tenant: TENANT }), LINE_CHANNEL_SECRET: SECRET, LINE_CHANNEL_ACCESS_TOKEN: "t" };
    await handleWebhook(makeRequest(PAYLOAD, sig), env1, "demo");
    assert.ok(env1.DB.inserts.some((i) => i.sql.includes("lineSecretVerifiedAt")));
    const env2 = {
      DB: makeFakeDb({ tenant: { ...TENANT, line_secret_verified_at: 1 } }),
      LINE_CHANNEL_SECRET: SECRET,
      LINE_CHANNEL_ACCESS_TOKEN: "t",
    };
    await handleWebhook(makeRequest(PAYLOAD, sig), env2, "demo");
    assert.ok(!env2.DB.inserts.some((i) => i.sql.includes("lineSecretVerifiedAt")));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("webhook：錯誤簽名回 401 且零副作用", async () => {
  const db = makeFakeDb({ tenant: TENANT });
  const env = { DB: db, LINE_CHANNEL_SECRET: SECRET };
  const sig = await signLineBody("wrong-secret", PAYLOAD);
  const res = await handleWebhook(makeRequest(PAYLOAD, sig), env, "demo");
  assert.equal(res.status, 401);
  assert.equal(db.inserts.length, 0); // 401 不寫任何資料
});

test("webhook：缺 x-line-signature header 回 401", async () => {
  const db = makeFakeDb({ tenant: TENANT });
  const env = { DB: db, LINE_CHANNEL_SECRET: SECRET };
  const res = await handleWebhook(makeRequest(PAYLOAD), env, "demo");
  assert.equal(res.status, 401);
  assert.equal(db.inserts.length, 0);
});

test("webhook：未知 slug 回 404", async () => {
  const db = makeFakeDb({ tenant: TENANT });
  const env = { DB: db, LINE_CHANNEL_SECRET: SECRET };
  const sig = await signLineBody(SECRET, PAYLOAD);
  const req = new Request("http://localhost/webhook/nope", {
    method: "POST",
    headers: { "x-line-signature": sig },
    body: PAYLOAD,
  });
  const res = await handleWebhook(req, env, "nope");
  assert.equal(res.status, 404);
});

test("webhook：per-tenant secret 優先於全域 fallback", async () => {
  const db = makeFakeDb({ tenant: TENANT });
  const env = {
    DB: db,
    LINE_CHANNEL_SECRET: "global-secret",
    LINE_SECRET_demo: "tenant-secret",
    LINE_CHANNEL_ACCESS_TOKEN: "t",
  };
  // 用 per-tenant secret 簽名 → 通過
  const okSig = await signLineBody("tenant-secret", PAYLOAD);
  // 用全域 secret 簽名 → 401
  const badSig = await signLineBody("global-secret", PAYLOAD);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({}) });
  try {
    assert.equal((await handleWebhook(makeRequest(PAYLOAD, okSig), env, "demo")).status, 200);
    assert.equal((await handleWebhook(makeRequest(PAYLOAD, badSig), env, "demo")).status, 401);
  } finally {
    globalThis.fetch = realFetch;
  }
});
