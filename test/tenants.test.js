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

const post = (body) =>
  new Request("http://localhost/api/tenants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("8.1 建立租戶：成功 INSERT 回 201", async () => {
  const db = makeFakeDb();
  const res = await handleCreateTenant(post({ slug: "new-store", name: "新店" }), { DB: db });
  assert.equal(res.status, 201);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.slug, "new-store");
  assert.equal(db.inserts.length, 1);
  assert.match(db.inserts[0].sql, /INSERT INTO tenants/);
});

test("8.1 建立租戶：重複 slug → 409 slug_taken", async () => {
  const db = makeFakeDb({ existingSlug: "lao-zhang" });
  const res = await handleCreateTenant(post({ slug: "lao-zhang", name: "重複" }), { DB: db });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "slug_taken" });
  assert.equal(db.inserts.length, 0); // 零副作用
});

test("8.1 建立租戶：slug 格式不合法 → 400", async () => {
  const db = makeFakeDb();
  assert.equal((await handleCreateTenant(post({ slug: "Bad Slug!", name: "x" }), { DB: db })).status, 400);
  assert.equal((await handleCreateTenant(post({ name: "only" }), { DB: db })).status, 400);
});
