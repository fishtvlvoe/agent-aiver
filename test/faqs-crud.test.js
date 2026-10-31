import { test } from "node:test";
import assert from "node:assert/strict";
import { handleFaqs } from "../src/api/faqs.js";

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

function makeFakeDb() {
  const ops = [];
  return {
    ops,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants")) return { id: "t-A" };
              return null;
            },
            async all() {
              if (sql.includes("FROM faqs")) return { results: [{ id: "f1", question: "Q1", answer: "A1", updated_at: "2026-10-01" }] };
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

const env = () => ({ FORM_STATE: makeFakeKv(), DB: makeFakeDb() });
const headers = { authorization: "Bearer tok" };

test("9.1 GET 列表", async () => {
  const res = await handleFaqs(new Request("http://x/api/faqs/store-a", { headers }), env(), "store-a");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).faqs.length, 1);
});

test("9.1 POST 新增", async () => {
  const db = makeFakeDb();
  const res = await handleFaqs(
    new Request("http://x/api/faqs/store-a", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ question: "Q2", answer: "A2" }) }),
    { FORM_STATE: makeFakeKv(), DB: db },
    "store-a",
  );
  assert.equal(res.status, 201);
  assert.ok((await res.json()).id);
  assert.match(db.ops[0].sql, /INSERT INTO faqs/);
  assert.equal(db.ops[0].args[2], "Q2");
});

test("9.1 PUT 更新（含 updated_at=現在時間）", async () => {
  const db = makeFakeDb();
  const res = await handleFaqs(
    new Request("http://x/api/faqs/store-a/f1", { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ question: "Q1改", answer: "A1改" }) }),
    { FORM_STATE: makeFakeKv(), DB: db },
    "store-a",
    "f1",
  );
  assert.equal(res.status, 200);
  assert.match(db.ops[0].sql, /UPDATE faqs/);
  assert.equal(db.ops[0].args[0], "Q1改");
  assert.ok(!Number.isNaN(Date.parse(db.ops[0].args[2])), "updated_at 應為現在時間（ISO 字串可解析）");
});

test("9.1 DELETE 刪除", async () => {
  const db = makeFakeDb();
  const res = await handleFaqs(new Request("http://x/api/faqs/store-a/f1", { method: "DELETE", headers }), { FORM_STATE: makeFakeKv(), DB: db }, "store-a", "f1");
  assert.equal(res.status, 200);
  assert.match(db.ops[0].sql, /DELETE FROM faqs/);
  assert.deepEqual(db.ops[0].args, ["f1", "t-A"]); // 僅限本戶 tenant_id
});

test("9.1 POST 缺欄位 → 400", async () => {
  const res = await handleFaqs(
    new Request("http://x/api/faqs/store-a", { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ question: "只有Q" }) }),
    env(),
    "store-a",
  );
  assert.equal(res.status, 400);
});
