import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLineSettings, handleApplyWebhook } from "../src/api/line-settings.js";

function makeFakeKv() {
  const store = new Map();
  store.set("sess:tok", JSON.stringify({ role: "store", tenantId: "t-A", slug: "store-a", userId: "Ua", name: "A", exp: Date.now() + 3600_000 }));
  return {
    async get(k, t) {
      const v = store.get(k);
      return t === "json" && v !== undefined ? JSON.parse(v) : v;
    },
    async put(k, v) { store.set(k, v); },
  };
}

function makeFakeDb() {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants")) {
                return args[0] === "store-a" ? { id: "t-A", slug: "store-a", line_token_enc: null } : { id: "t-B", slug: "store-b", line_token_enc: null };
              }
              return null;
            },
          };
        },
      };
    },
  };
}

const env = () => ({ FORM_STATE: makeFakeKv(), DB: makeFakeDb(), LINE_CHANNEL_ACCESS_TOKEN: "line-token-abc" });
const req = (url = "http://localhost/api/line-settings/store-a") =>
  new Request(url, { headers: { authorization: "Bearer tok" } });

// mock LINE API：依 path 回對應資料
function lineMockFetch(calls, { fail = false } = {}) {
  return async (url, opts) => {
    calls.push({ url, auth: opts?.headers?.authorization, body: opts?.body });
    if (fail) return { ok: false, status: 401, json: async () => ({}) };
    if (url.endsWith("/v2/bot/info/webhook")) return { ok: true, status: 200, json: async () => ({ endpoint: "https://old.example/webhook", active: true }) };
    if (url.endsWith("/v2/bot/chat/setting/greeting")) return { ok: true, status: 200, json: async () => ({ enabled: false }) };
    if (url.endsWith("/v2/bot/richmenu/list")) return { ok: true, status: 200, json: async () => ({ richmenus: [{ richMenuId: "rm-1", name: "主選單", size: { width: 2500, height: 1686 } }] }) };
    if (url.endsWith("/v2/bot/channel/webhook/endpoint")) return { ok: true, status: 200, json: async () => ({}) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test("GET：組裝四個 LINE 欄位＋用 tenant token 呼叫", async () => {
  const calls = [];
  const res = await handleLineSettings(req(), env(), "store-a", lineMockFetch(calls));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.webhookUrl, "/webhook/store-a");
  assert.equal(json.lineWebhookUrl, "https://old.example/webhook");
  assert.equal(json.webhookActive, true);
  assert.equal(json.greeting, false);
  assert.deepEqual(json.richmenus, [{ name: "主選單", richMenuId: "rm-1", size: { width: 2500, height: 1686 } }]);
  // 三個 GET 都帶 Bearer tenant token
  assert.equal(calls.length, 3);
  for (const c of calls) assert.equal(c.auth, "Bearer line-token-abc");
});

test("GET：token 失效 → 各欄位 null，整體仍 200（降級）", async () => {
  const res = await handleLineSettings(req(), env(), "store-a", lineMockFetch([], { fail: true }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    webhookUrl: "/webhook/store-a",
    lineWebhookUrl: null,
    webhookActive: null,
    greeting: null,
    richmenus: null,
  });
});

test("apply-webhook：POST endpoint body 正確（用 request origin）", async () => {
  const calls = [];
  const res = await handleApplyWebhook(
    req("http://localhost:8787/api/line-settings/store-a/apply-webhook"),
    env(),
    "store-a",
    lineMockFetch(calls),
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, endpoint: "http://localhost:8787/webhook/store-a" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.line.me/v2/bot/channel/webhook/endpoint");
  assert.deepEqual(JSON.parse(calls[0].body), { endpoint: "http://localhost:8787/webhook/store-a" });
});

test("apply-webhook：LINE 失敗 → 502", async () => {
  const res = await handleApplyWebhook(req("http://x/api/line-settings/store-a/apply-webhook"), env(), "store-a", lineMockFetch([], { fail: true }));
  assert.equal(res.status, 502);
});

test("requireStore：無 session → 401；他戶 → 403", async () => {
  const noSess = { FORM_STATE: { async get() { return null; }, async put() {} }, DB: makeFakeDb() };
  assert.equal((await handleLineSettings(new Request("http://x/api/line-settings/store-a"), noSess, "store-a")).status, 401);
  // store-a session 打 store-b → 403
  assert.equal((await handleLineSettings(req(), env(), "store-b")).status, 403);
});
