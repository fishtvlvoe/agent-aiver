import { test } from "node:test";
import assert from "node:assert/strict";
import { handleUsage, MONTHLY_LIMIT } from "../src/api/usage.js";

function makeFakeDb({ count }) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants")) return args[0] === "demo" ? { id: "t1" } : null;
              if (sql.includes("FROM usage_counters")) return count !== null ? { count } : null;
              return null;
            },
          };
        },
      };
    },
  };
}

// 假 KV：預種 admin session（任務 8.3 起改用 session 驗證）
function makeFakeKv() {
  const store = new Map();
  store.set(
    "sess:admintok",
    JSON.stringify({ role: "admin", tenantId: null, userId: "Uadm", name: "Fish", exp: Date.now() + 3600_000 }),
  );
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

const env = (count) => ({ DB: makeFakeDb({ count }), FORM_STATE: makeFakeKv() });
const makeReq = (auth) =>
  new Request("http://localhost/api/usage/demo", { headers: auth ? { authorization: auth } : {} });

test("6.3/8.3：無 session → 401", async () => {
  assert.equal((await handleUsage(makeReq(null), env(0), "demo")).status, 401);
});

test("6.3/8.3：無效 session → 401", async () => {
  assert.equal((await handleUsage(makeReq("Bearer wrong"), env(0), "demo")).status, 401);
});

test("6.3：有效 session → 200 回 {month, count, limit, exceeded:false}", async () => {
  const res = await handleUsage(makeReq("Bearer admintok"), env(100), "demo");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.match(json.month, /^\d{4}-\d{2}$/);
  assert.equal(json.count, 100);
  assert.equal(json.limit, MONTHLY_LIMIT);
  assert.equal(json.exceeded, false);
});

test("6.3：count 達上限 → exceeded=true", async () => {
  const res = await handleUsage(makeReq("Bearer admintok"), env(5000), "demo");
  assert.equal((await res.json()).exceeded, true);
});

test("6.3：未知 slug → 404", async () => {
  const res = await handleUsage(makeReq("Bearer admintok"), env(0), "nope");
  assert.equal(res.status, 404);
});
