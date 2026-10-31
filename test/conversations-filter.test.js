import { test } from "node:test";
import assert from "node:assert/strict";
import { handleConversations } from "../src/api/conversations.js";

const ROWS = [
  { id: "1", status: "resolved", created_at: "2026-10-03" },
  { id: "2", status: "handoff", created_at: "2026-10-02" },
  { id: "3", status: "missed", created_at: "2026-10-01" },
];

function makeFakeDb() {
  return {
    lastQuery: null,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants")) return { id: "t-A" };
              return null;
            },
            async all() {
              // 模擬資料庫篩選：WHERE status = ? 時只回該狀態
              const statusFilter = args[1];
              const results = statusFilter ? ROWS.filter((r) => r.status === statusFilter) : ROWS;
              return { results: results.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)) };
            },
          };
        },
      };
    },
  };
}

const env = () => ({
  FORM_STATE: {
    async get(k, t) {
      if (k === "sess:tok") return { role: "store", tenantId: "t-A", userId: "Ua", name: "A", exp: Date.now() + 3600_000 };
      return null;
    },
    async put() {},
  },
  DB: makeFakeDb(),
});
const headers = { authorization: "Bearer tok" };

test("9.2 預設 all 回全部（倒序）", async () => {
  const res = await handleConversations(new Request("http://x/api/conversations/store-a", { headers }), env(), "store-a");
  const { conversations } = await res.json();
  assert.equal(conversations.length, 3);
  assert.deepEqual(conversations.map((c) => c.id), ["1", "2", "3"]); // created_at DESC
});

test("9.2 status=missed 只回 missed", async () => {
  const url = new URL("http://x/api/conversations/store-a?status=missed");
  const res = await handleConversations(new Request(url, { headers }), env(), "store-a", url);
  const { conversations } = await res.json();
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].status, "missed");
});

test("9.2 status=handoff / resolved 篩選", async () => {
  const h = await handleConversations(new Request("http://x/api/conversations/store-a?status=handoff", { headers }), env(), "store-a", new URL("http://x/api/conversations/store-a?status=handoff"));
  assert.deepEqual((await h.json()).conversations.map((c) => c.status), ["handoff"]);
  const r = await handleConversations(new Request("http://x/api/conversations/store-a?status=resolved", { headers }), env(), "store-a", new URL("http://x/api/conversations/store-a?status=resolved"));
  assert.deepEqual((await r.json()).conversations.map((c) => c.status), ["resolved"]);
});

test("9.2 非法 status → 400", async () => {
  const url = new URL("http://x/api/conversations/store-a?status=bogus");
  const res = await handleConversations(new Request(url, { headers }), env(), "store-a", url);
  assert.equal(res.status, 400);
});
