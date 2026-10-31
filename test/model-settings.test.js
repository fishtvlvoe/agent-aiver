import { test } from "node:test";
import assert from "node:assert/strict";
import { handleModelSettings } from "../src/api/model-settings.js";
import { handleLineEvents } from "../src/reply.js";
import { wrapSecret } from "../src/lib/crypto.js";

const PASSWORD = "dev-master";

function makeFakeKv() {
  const store = new Map();
  store.set("sess:tok", JSON.stringify({ role: "store", tenantId: "t-A", userId: "Ua", name: "A", exp: Date.now() + 3600_000 }));
  return {
    async get(k, t) {
      const v = store.get(k);
      return t === "json" && v !== undefined ? JSON.parse(v) : v;
    },
    async put(k, v) {
      store.set(k, v);
    },
  };
}

// 假 D1：tenants 列可更新，記錄 ops
function makeFakeDb(tenantRow = {}) {
  const ops = [];
  const row = { id: "t-A", slug: "store-a", model_mode: "platform", model_base_url: null, model_name: null, model_key_mask: null, ...tenantRow };
  return {
    ops,
    row,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants")) return row;
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              ops.push({ sql, args });
            },
          };
        },
      };
    },
  };
}

const env = (db) => ({ FORM_STATE: makeFakeKv(), DB: db, LINE_CHANNEL_SECRET: PASSWORD });
const headers = { authorization: "Bearer tok", "content-type": "application/json" };
const put = (body) => new Request("http://x/api/model-settings/store-a", { method: "PUT", headers, body: JSON.stringify(body) });

const modelsOkFetch = async (url, opts) => {
  assert.match(url, /\/models$/);
  assert.equal(opts.headers.authorization, "Bearer custom-key-1234");
  return { status: 200, ok: true, json: async () => ({ data: [] }) };
};
const modelsFailFetch = async () => ({ status: 401, ok: false, json: async () => ({}) });

test("9.3 GET 回 mode/baseUrl/model/apiKeyMask", async () => {
  const db = makeFakeDb({ model_mode: "custom", model_base_url: "https://custom.example/v1", model_name: "cheap-model", model_key_mask: "••••1234" });
  const res = await handleModelSettings(new Request("http://x/api/model-settings/store-a", { headers }), env(db), "store-a");
  assert.deepEqual(await res.json(), { mode: "custom", baseUrl: "https://custom.example/v1", model: "cheap-model", apiKeyMask: "••••1234" });
});

test("9.3 PUT custom：驗證通過才寫入（enc+mask）", async () => {
  const db = makeFakeDb();
  const res = await handleModelSettings(put({ mode: "custom", baseUrl: "https://custom.example/v1", apiKey: "custom-key-1234", model: "cheap-model" }), env(db), "store-a", modelsOkFetch);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.mode, "custom");
  assert.equal(json.apiKeyMask, "••••1234");
  assert.match(db.ops[0].sql, /UPDATE tenants/);
  // 寫入的是 wrapped，不是明文
  const writeArgs = JSON.stringify(db.ops[0].args);
  assert.ok(!writeArgs.includes("custom-key-1234"));
});

test("9.3 PUT custom：驗證失敗 400，不寫入", async () => {
  const db = makeFakeDb();
  const res = await handleModelSettings(put({ mode: "custom", baseUrl: "https://bad.example/v1", apiKey: "wrong-key", model: "m" }), env(db), "store-a", modelsFailFetch);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "金鑰無效，請確認後重試" });
  assert.equal(db.ops.length, 0);
});

test("9.3 PUT platform：清空 custom 欄位回預設", async () => {
  const db = makeFakeDb({ model_mode: "custom" });
  const res = await handleModelSettings(put({ mode: "platform" }), env(db), "store-a");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.mode, "platform");
  assert.equal(json.baseUrl, null);
  assert.match(db.ops[0].sql, /model_key_enc = NULL/);
});

test("9.3 整合：tenant custom 時 chat 走自訂 baseUrl", async () => {
  const db = makeFakeDb();
  // 預先寫入 custom 設定（enc 用同一 master key）
  db.row.model_mode = "custom";
  db.row.model_base_url = "https://custom.example/v1";
  db.row.model_name = "cheap-model";
  db.row.model_key_enc = await wrapSecret(PASSWORD, "custom-key-1234");

  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, auth: opts.headers?.authorization });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    return { status: 200, ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} }) };
  };
  const tenant = { id: "t-A", slug: "store-a", name: "A", model_mode: "custom", model_base_url: "https://custom.example/v1", model_name: "cheap-model", model_key_enc: db.row.model_key_enc };
  const event = { type: "message", replyToken: "rt", source: { userId: "U1" }, message: { type: "text", text: "hi" } };
  await handleLineEvents({ DB: db, FORM_STATE: null, LINE_CHANNEL_SECRET: PASSWORD }, tenant, [event], { fetchImpl: mockFetch });

  const aiCall = calls.find((c) => c.url.includes("chat/completions"));
  assert.ok(aiCall);
  assert.match(aiCall.url, /^https:\/\/custom\.example\/v1\/chat\/completions/); // 走自訂供應商
  assert.equal(aiCall.auth, "Bearer custom-key-1234"); // 用解密後的自訂 key
});
