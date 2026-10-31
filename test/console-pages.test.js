import { test } from "node:test";
import assert from "node:assert/strict";
import { handleConsole } from "../src/api/console.js";
import { handleLineEvents } from "../src/reply.js";

function makeFakeKv({ role = "admin", platformModel = null } = {}) {
  const store = new Map();
  if (role) {
    store.set("sess:tok", JSON.stringify({ role, tenantId: null, userId: "Uadm", name: "Fish", exp: Date.now() + 3600_000 }));
  }
  if (platformModel) store.set("platform:model_settings", JSON.stringify(platformModel));
  return {
    store,
    async get(k, t) {
      const v = store.get(k);
      return t === "json" && v !== undefined ? JSON.parse(v) : v;
    },
    async put(k, v) {
      store.set(k, v);
    },
  };
}

function makeFakeDb() {
  const tenants = [
    { id: "t-A", slug: "store-a", name: "A 店", status: "active", admin_line_user_id: null, created_at: "2026-10-01" },
    { id: "t-B", slug: "store-b", name: "B 店", status: "disabled", admin_line_user_id: null, created_at: "2026-10-02" },
  ];
  const ops = [];
  return {
    ops,
    tenants,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants WHERE slug")) return tenants.find((t) => t.slug === args[0]) ?? null;
              if (sql.includes("COUNT(*) AS c FROM tenants")) return { c: tenants.length };
              if (sql.includes("SUM(count)")) return { s: 1234 };
              if (sql.includes("status = 'handoff'")) return { c: 5 };
              return null;
            },
            async all() {
              if (sql.includes("FROM tenants t ORDER BY")) {
                return { results: tenants.map((t) => ({ slug: t.slug, name: t.name, status: t.status, month_count: t.slug === "store-a" ? 100 : null })) };
              }
              if (sql.includes("LEFT JOIN usage_counters")) {
                return {
                  results: [
                    { slug: "store-a", name: "A 店", count: 3200 },
                    { slug: "store-b", name: "B 店", count: 0 },
                  ],
                };
              }
              return { results: [] };
            },
            async run() {
              ops.push({ sql, args });
              if (sql.includes("UPDATE tenants SET admin_line_user_id")) {
                const t = tenants.find((x) => x.id === args[1]);
                if (t) t.admin_line_user_id = args[0];
              }
            },
          };
        },
      };
    },
  };
}

const req = (method, path, body) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { authorization: "Bearer tok", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const env = (db, kv) => ({ FORM_STATE: kv, DB: db, OPENAI_API_KEY: "platform-key" });

// 問題 11-1：PATCH admin 開通店家管理員
test("PATCH admin：開通後 tenants.admin_line_user_id 更新", async () => {
  const db = makeFakeDb();
  const res = await handleConsole(req("PATCH", "/api/console/tenants/store-a/admin", { lineUserId: "U-new-admin" }), env(db, makeFakeKv()));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(db.tenants[0].admin_line_user_id, "U-new-admin");
});

test("PATCH admin：缺 lineUserId → 400；未知 slug → 404", async () => {
  const db = makeFakeDb();
  assert.equal((await handleConsole(req("PATCH", "/api/console/tenants/store-a/admin", {}), env(db, makeFakeKv()))).status, 400);
  assert.equal((await handleConsole(req("PATCH", "/api/console/tenants/nope/admin", { lineUserId: "U1" }), env(db, makeFakeKv()))).status, 404);
});

// 問題 11-2：平台預設模型 GET/PUT
test("model-settings GET：預設 null；PUT 驗證通過才寫 KV", async () => {
  const db = makeFakeDb();
  const kv = makeFakeKv();
  const get1 = await handleConsole(req("GET", "/api/console/model-settings"), env(db, kv));
  assert.deepEqual(await get1.json(), { baseUrl: null, model: null });

  // stub global fetch：/models 驗證
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, "https://platform.example/v1/models");
    assert.equal(opts.headers.authorization, "Bearer platform-key");
    return { status: 200, ok: true, json: async () => ({}) };
  };
  try {
    const put = await handleConsole(req("PUT", "/api/console/model-settings", { baseUrl: "https://platform.example/v1", model: "gpt-5.6-luna" }), env(db, kv));
    assert.equal(put.status, 200);
  } finally {
    globalThis.fetch = realFetch;
  }
  const get2 = await handleConsole(req("GET", "/api/console/model-settings"), env(db, kv));
  assert.deepEqual(await get2.json(), { baseUrl: "https://platform.example/v1", model: "gpt-5.6-luna" });
});

test("model-settings PUT：驗證失敗 400 不寫入", async () => {
  const db = makeFakeDb();
  const kv = makeFakeKv();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ status: 500, ok: false, json: async () => ({}) });
  try {
    const res = await handleConsole(req("PUT", "/api/console/model-settings", { baseUrl: "https://bad.example/v1", model: "m" }), env(db, kv));
    assert.equal(res.status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(kv.store.get("platform:model_settings"), undefined);
});

// 問題 11-3：各店本月用量
test("GET usage：回 month + tenants[{slug,name,count,limit}]", async () => {
  const db = makeFakeDb();
  const res = await handleConsole(req("GET", "/api/console/usage"), env(db, makeFakeKv()));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.match(json.month, /^\d{4}-\d{2}$/);
  assert.equal(json.limit, 5000);
  assert.deepEqual(json.tenants, [
    { slug: "store-a", name: "A 店", count: 3200, limit: 5000 },
    { slug: "store-b", name: "B 店", count: 0, limit: 5000 },
  ]);
});

// 問題 11-5：provider 順序 tenant custom > 平台 KV > env
test("resolveProviders 順序：平台 KV 設定優先於 env 預設", async () => {
  const db = { prepare: () => ({ bind: () => ({ async first() { return null; }, async all() { return { results: [] }; }, async run() {} }) }) };
  const kv = makeFakeKv({ platformModel: { baseUrl: "https://platform.example/v1", model: "platform-model" } });
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, auth: opts.headers?.authorization });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    return { status: 200, ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} }) };
  };
  const env = { DB: db, FORM_STATE: kv, OPENAI_API_KEY: "platform-key", LINE_CHANNEL_ACCESS_TOKEN: "t" };
  const tenant = { id: "t-A", slug: "store-a", name: "A", model_mode: "platform" };
  const event = { type: "message", replyToken: "rt", source: { userId: "U1" }, message: { type: "text", text: "hi" } };
  await handleLineEvents(env, tenant, [event], { fetchImpl: mockFetch });

  const aiCall = calls.find((c) => c.url.includes("chat/completions"));
  assert.match(aiCall.url, /^https:\/\/platform\.example\/v1\/chat\/completions/); // 平台 KV 設定勝出
  assert.equal(aiCall.auth, "Bearer platform-key"); // key 用平台 env key
});

// requireAdmin 不得略過
test("store session 打新 API → 403", async () => {
  const db = makeFakeDb();
  const storeKv = makeFakeKv({ role: "store" });
  assert.equal((await handleConsole(req("GET", "/api/console/usage"), env(db, storeKv))).status, 403);
  assert.equal((await handleConsole(req("PATCH", "/api/console/tenants/store-a/admin", { lineUserId: "U1" }), env(db, storeKv))).status, 403);
});
