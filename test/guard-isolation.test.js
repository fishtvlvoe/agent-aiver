import { test } from "node:test";
import assert from "node:assert/strict";
import { handleFaqs } from "../src/api/faqs.js";
import { handleUsage } from "../src/api/usage.js";
import { handleConversations } from "../src/api/conversations.js";
import { handleConsole } from "../src/api/console.js";

// 假 KV：預種 session
function makeFakeKv(sessions) {
  const store = new Map();
  for (const [token, sess] of Object.entries(sessions)) {
    store.set(`sess:${token}`, JSON.stringify(sess));
  }
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

// 假 D1：兩個租戶
function makeFakeDb() {
  const tenants = { a: { id: "t-A", slug: "store-a" }, b: { id: "t-B", slug: "store-b" } };
  return {
    tenants,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants")) {
                return Object.values(tenants).find((t) => t.slug === args[0]) ?? null;
              }
              if (sql.includes("FROM usage_counters")) return { count: 10 };
              return null;
            },
            async all() {
              if (sql.includes("FROM faqs")) return { results: [{ question: "Q", answer: "A" }] };
              if (sql.includes("FROM conversations")) return { results: [] };
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

const exp = Date.now() + 3600_000;
const SESS = {
  storeA: { role: "store", tenantId: "t-A", userId: "Ua", name: "A", exp },
  storeB: { role: "store", tenantId: "t-B", userId: "Ub", name: "B", exp },
  admin: { role: "admin", tenantId: null, userId: "Uadm", name: "Fish", exp },
};
const req = (token) => new Request("http://localhost/api/faqs/store-a", { headers: token ? { authorization: `Bearer ${token}` } : {} });

test("8.3 隔離：店家 A 拿自己資料 → 200", async () => {
  const env = { FORM_STATE: makeFakeKv(SESS), DB: makeFakeDb() };
  const res = await handleFaqs(req("storeA"), env, "store-a");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).faqs.length, 1);
});

test("8.3 隔離：店家 A 拿店家 B 資料 → 403", async () => {
  const env = { FORM_STATE: makeFakeKv(SESS), DB: makeFakeDb() };
  assert.equal((await handleFaqs(req("storeA"), env, "store-b")).status, 403);
  assert.equal((await handleConversations(req("storeB"), env, "store-a")).status, 403);
  assert.equal((await handleUsage(req("storeA"), env, "store-b")).status, 403);
});

test("8.3 隔離：admin 讀任何租戶 → 200", async () => {
  const env = { FORM_STATE: makeFakeKv(SESS), DB: makeFakeDb() };
  assert.equal((await handleFaqs(req("admin"), env, "store-a")).status, 200);
  assert.equal((await handleFaqs(req("admin"), env, "store-b")).status, 200);
  assert.equal((await handleUsage(req("admin"), env, "store-b")).status, 200);
});

test("8.3 隔離：無 session → 401", async () => {
  const env = { FORM_STATE: makeFakeKv(SESS), DB: makeFakeDb() };
  assert.equal((await handleFaqs(req(null), env, "store-a")).status, 401);
});

test("8.5 console：store 身分 → 403，admin → 200，無 session → 401", async () => {
  const env = { FORM_STATE: makeFakeKv(SESS), DB: makeFakeDb() };
  assert.equal((await handleConsole(req("storeA"), env)).status, 403);
  assert.equal((await handleConsole(req("admin"), env)).status, 200);
  assert.equal((await handleConsole(req(null), env)).status, 401);
});
