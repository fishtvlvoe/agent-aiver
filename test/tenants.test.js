import { test } from "node:test";
import assert from "node:assert/strict";
import { handleCreateTenant } from "../src/api/tenants.js";

function makeFakeDb({ existingSlug = null } = {}) {
  const inserts = [];
  return {
    inserts,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants") && args[0] === existingSlug) return { id: "t-existing" };
              return null;
            },
            async run() {
              inserts.push({ sql, args });
            },
          };
        },
      };
    },
  };
}

// 假 KV：admin session（POST /api/tenants 安全補丁後需 admin）
function makeFakeKv(role = "admin") {
  const store = new Map();
  if (role) {
    store.set("sess:tok", JSON.stringify({ role, tenantId: null, userId: "Uadm", name: "Fish", exp: Date.now() + 3600_000 }));
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

const post = (body) =>
  new Request("http://localhost/api/tenants", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });

const env = (db, role = "admin") => ({ DB: db, FORM_STATE: makeFakeKv(role) });

test("8.1/問題 11 建立租戶：admin session 成功 INSERT 回 201", async () => {
  const db = makeFakeDb();
  const res = await handleCreateTenant(post({ slug: "new-store", name: "新店" }), env(db));
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(db.inserts.length, 1);
});

test("8.1 建立租戶：重複 slug → 409 slug_taken", async () => {
  const db = makeFakeDb({ existingSlug: "lao-zhang" });
  const res = await handleCreateTenant(post({ slug: "lao-zhang", name: "重複" }), env(db));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "slug_taken" });
  assert.equal(db.inserts.length, 0);
});

test("8.1 建立租戶：slug 格式不合法 → 400", async () => {
  const db = makeFakeDb();
  assert.equal((await handleCreateTenant(post({ slug: "Bad Slug!", name: "x" }), env(db))).status, 400);
  assert.equal((await handleCreateTenant(post({ name: "only" }), env(db))).status, 400);
});

test("問題 11 安全補丁：無 session → 401", async () => {
  const db = makeFakeDb();
  const res = await handleCreateTenant(post({ slug: "x", name: "y" }), env(db, null));
  assert.equal(res.status, 401);
  assert.equal(db.inserts.length, 0);
});

test("問題 11 安全補丁：store session → 403", async () => {
  const db = makeFakeDb();
  const res = await handleCreateTenant(post({ slug: "x", name: "y" }), env(db, "store"));
  assert.equal(res.status, 403);
  assert.equal(db.inserts.length, 0);
});
