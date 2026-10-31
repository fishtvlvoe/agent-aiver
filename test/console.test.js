import { test } from "node:test";
import assert from "node:assert/strict";
import { handleConsole } from "../src/api/console.js";
import { handleWebhook } from "../src/webhook.js";
import { signLineBody } from "../src/lib/line-signature.js";

function makeFakeKv(role = "admin") {
  const store = new Map();
  if (role) store.set("sess:tok", JSON.stringify({ role, tenantId: role === "store" ? "t-A" : null, userId: "U1", name: "N", exp: Date.now() + 3600_000 }));
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

// 假 D1：兩租戶 + KPI 查詢 + 可更新狀態
function makeFakeDb() {
  const tenants = [
    { id: "t-A", slug: "store-a", name: "A 店", status: "active", created_at: "2026-10-01" },
    { id: "t-B", slug: "store-b", name: "B 店", status: "disabled", created_at: "2026-10-02" },
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
              return { results: [] };
            },
            async run() {
              ops.push({ sql, args });
              if (sql.includes("UPDATE tenants SET status")) {
                const t = tenants.find((x) => x.id === args[1]);
                if (t) t.status = args[0];
              }
            },
          };
        },
      };
    },
  };
}

const req = (method, path) => new Request(`http://localhost${path}`, { method, headers: { authorization: "Bearer tok" } });

test("9.4 GET /api/console/tenants：admin 200 含本月 count", async () => {
  const res = await handleConsole(req("GET", "/api/console/tenants"), { FORM_STATE: makeFakeKv("admin"), DB: makeFakeDb() });
  assert.equal(res.status, 200);
  const { tenants } = await res.json();
  assert.equal(tenants.length, 2);
  assert.equal(tenants[0].month_count, 100);
});

test("9.4 store 打 console → 403", async () => {
  const res = await handleConsole(req("GET", "/api/console/tenants"), { FORM_STATE: makeFakeKv("store"), DB: makeFakeDb() });
  assert.equal(res.status, 403);
});

test("9.4 toggle：active ↔ disabled 切換", async () => {
  const db = makeFakeDb();
  const env = { FORM_STATE: makeFakeKv("admin"), DB: db };
  const r1 = await handleConsole(req("POST", "/api/console/tenants/store-a/toggle"), env);
  assert.deepEqual(await r1.json(), { ok: true, status: "disabled" });
  assert.equal(db.tenants[0].status, "disabled");
  const r2 = await handleConsole(req("POST", "/api/console/tenants/store-a/toggle"), env);
  assert.deepEqual(await r2.json(), { ok: true, status: "active" });
});

test("9.4 停用後 webhook → 403", async () => {
  const db = makeFakeDb();
  const env = { FORM_STATE: makeFakeKv("admin"), DB: db };
  await handleConsole(req("POST", "/api/console/tenants/store-a/toggle"), env); // → disabled
  const payload = JSON.stringify({ destination: "U", events: [] });
  const sig = await signLineBody("any-secret", payload);
  const res = await handleWebhook(
    new Request("http://localhost/webhook/store-a", { method: "POST", headers: { "x-line-signature": sig }, body: payload }),
    { DB: db, LINE_CHANNEL_SECRET: "any-secret" },
    "store-a",
  );
  assert.equal(res.status, 403);
});

test("9.4 GET /api/console/overview：KPI 正確", async () => {
  const res = await handleConsole(req("GET", "/api/console/overview"), { FORM_STATE: makeFakeKv("admin"), DB: makeFakeDb() });
  const json = await res.json();
  assert.equal(json.tenantCount, 2);
  assert.equal(json.monthAiReplies, 1234);
  assert.equal(json.pendingHandoffs, 5);
  assert.match(json.month, /^\d{4}-\d{2}$/);
});

test("9.4 toggle 未知 slug → 404", async () => {
  const res = await handleConsole(req("POST", "/api/console/tenants/nope/toggle"), { FORM_STATE: makeFakeKv("admin"), DB: makeFakeDb() });
  assert.equal(res.status, 404);
});
