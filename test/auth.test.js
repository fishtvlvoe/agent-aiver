import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLiff, handleMe } from "../src/api/auth.js";
import { createSession, getSession } from "../src/lib/session.js";

// 假 KV
function makeFakeKv(seed = {}) {
  const store = new Map(Object.entries(seed));
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

// 假 D1：platform_admins / tenants.admin_line_user_id
function makeFakeDb({ admins = [], tenantAdmins = {} } = {}) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM platform_admins")) return admins.includes(args[0]) ? { line_user_id: args[0] } : null;
              if (sql.includes("admin_line_user_id")) return tenantAdmins[args[0]] ? { id: tenantAdmins[args[0]], slug: "lao-zhang" } : null;
              return null;
            },
          };
        },
      };
    },
  };
}

const verifyOkFetch = (sub, name) => async (url, options = {}) => {
  assert.equal(url, "https://api.line.me/oauth2/v2.1/verify");
  assert.equal(options.method, "POST");
  const params = new URLSearchParams(options.body);
  assert.equal(params.get("id_token"), "tok");
  assert.equal(params.get("client_id"), "login-channel-id");
  return { status: 200, ok: true, json: async () => ({ sub, name }) };
};
const verifyFailFetch = async () => ({ status: 400, ok: false, json: async () => ({}) });

const liffReq = (idToken) =>
  new Request("http://localhost/api/auth/liff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

const ENV = { LINE_LOGIN_CHANNEL_ID: "login-channel-id" };

test("8.2 LIFF：platform_admins 的 userId → admin session", async () => {
  const kv = makeFakeKv();
  const env = { ...ENV, FORM_STATE: kv, DB: makeFakeDb({ admins: ["U-admin-1"] }) };
  const res = await handleLiff(liffReq("tok"), env, verifyOkFetch("U-admin-1", "Fish"));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.role, "admin");
  assert.ok(json.token);
  assert.ok(kv.store.has(`sess:${json.token}`));
});

test("8.2 LIFF：tenants.admin_line_user_id 的 userId → store session", async () => {
  const kv = makeFakeKv();
  const env = { ...ENV, FORM_STATE: kv, DB: makeFakeDb({ tenantAdmins: { "U-store-1": "t-lao-zhang" } }) };
  const res = await handleLiff(liffReq("tok"), env, verifyOkFetch("U-store-1", "老張"));
  const json = await res.json();
  assert.equal(json.role, "store");
  // session 內含店家 slug（前端 API 都走 slug）
  const sess = JSON.parse(kv.store.get(`sess:${json.token}`));
  assert.equal(sess.slug, "lao-zhang");
});

test("8.2 LIFF：兩者皆無 → 403", async () => {
  const kv = makeFakeKv();
  const env = { ...ENV, FORM_STATE: kv, DB: makeFakeDb() };
  const res = await handleLiff(liffReq("tok"), env, verifyOkFetch("U-nobody", "路人"));
  assert.equal(res.status, 403);
  assert.equal(kv.store.size, 0); // 不發 session
});

test("8.2 LIFF：idToken 驗證失敗 → 401", async () => {
  const env = { ...ENV, FORM_STATE: makeFakeKv(), DB: makeFakeDb() };
  const res = await handleLiff(liffReq("bad-tok"), env, verifyFailFetch);
  assert.equal(res.status, 401);
});

test("8.2 me：有效 session → 回身分；無效/過期 → 401", async () => {
  const kv = makeFakeKv();
  const env = { FORM_STATE: kv };
  const { token } = await createSession(kv, { role: "store", tenantId: "t1", userId: "U-store-1", name: "老張" });
  const res = await handleMe(new Request("http://localhost/api/auth/me", { headers: { authorization: `Bearer ${token}` } }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { role: "store", tenantId: "t1", slug: null, userId: "U-store-1", name: "老張" });

  assert.equal((await handleMe(new Request("http://localhost/api/auth/me"), env)).status, 401);
  assert.equal((await handleMe(new Request("http://localhost/api/auth/me", { headers: { authorization: "Bearer nope" } }), env)).status, 401);
});

test("8.2 session：過期（exp 已過）視為無效", async () => {
  const kv = makeFakeKv({
    "sess:expired": JSON.stringify({ role: "admin", tenantId: null, userId: "U1", name: null, exp: Date.now() - 1000 }),
  });
  assert.equal(await getSession(kv, "expired"), null);
});
