import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLineEvents } from "../src/reply.js";
import { monthKeyTW } from "../src/lib/month.js";

const TENANT = { id: "t1", slug: "demo", name: "Demo 店", use_platform_model: 1 };
const EVENT = {
  type: "message",
  replyToken: "rt-1",
  source: { userId: "U123" },
  message: { type: "text", text: "運費多少" },
};

// 假 D1：可設定 usage_counters 初始值，追蹤寫入
function makeFakeDb({ usageCount = 0 } = {}) {
  const rows = { audit_events: [], conversations: [], usage_counters: [] };
  const NOW = Date.now();
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM bot_usage_counter")) return usageCount > 0 ? { count: usageCount } : null;
              return null;
            },
            async all() {
              return { results: [] };
            },
            async run() {
              if (sql.includes("INSERT INTO bot_usage_counter")) rows.usage_counters.push(args);
              if (sql.includes("bot_audit_event")) rows.audit_events.push(args);
              if (sql.includes("bot_conversation")) rows.conversations.push(args);
            },
          };
        },
      };
    },
  };
}

function makeMockFetch(calls, { aiFail = false } = {}) {
  return async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    if (aiFail) return { status: 500, ok: false, json: async () => ({}) };
    return { status: 200, ok: true, json: async () => ({ choices: [{ message: { content: "答案" } }], usage: {} }) };
  };
}

const envBase = (db) => ({ DB: db, OPENAI_API_KEY: "k", LINE_CHANNEL_ACCESS_TOKEN: "line-token" });

test("6.2：當月 4999 次 → 正常呼叫模型並 +1", async () => {
  const db = makeFakeDb({ usageCount: 4999 });
  const calls = [];
  await handleLineEvents(envBase(db), TENANT, [EVENT], { fetchImpl: makeMockFetch(calls) });
  assert.ok(calls.some((c) => c.url.includes("chat/completions")), "4999 應呼叫模型");
  assert.equal(db.rows.usage_counters.length, 1); // upsert +1
  assert.equal(db.rows.usage_counters[0][1], monthKeyTW(new Date())); // month 為 'YYYY-MM'
  assert.equal(db.rows.audit_events.filter((a) => a[2] === "monthly_limit").length, 0);
});

test("6.2：當月 5000 次 → 不呼叫模型，回固定話術、audit monthly_limit、status rate_limited", async () => {
  const db = makeFakeDb({ usageCount: 5000 });
  const calls = [];
  await handleLineEvents(envBase(db), TENANT, [EVENT], { fetchImpl: makeMockFetch(calls) });
  assert.ok(!calls.some((c) => c.url.includes("chat/completions")), "5000 不應呼叫模型");
  const lineCall = calls.find((c) => c.url.includes("api.line.me"));
  assert.equal(lineCall.body.messages[0].text, "店家將盡快親自回覆您");
  assert.equal(db.rows.audit_events.filter((a) => a[2] === "monthly_limit").length, 1);
  assert.equal(db.rows.conversations.length, 1);
  assert.equal(db.rows.conversations[0][5], "rate_limited");
  assert.equal(db.rows.usage_counters.length, 0); // 沒有 +1
});

test("6.2：當月 5001 次 → 同樣擋下", async () => {
  const db = makeFakeDb({ usageCount: 5001 });
  const calls = [];
  await handleLineEvents(envBase(db), TENANT, [EVENT], { fetchImpl: makeMockFetch(calls) });
  assert.ok(!calls.some((c) => c.url.includes("chat/completions")));
  assert.equal(db.rows.audit_events.filter((a) => a[2] === "monthly_limit").length, 1);
});

test("店家自訂上限 3：當月 2 次 → 仍呼叫模型", async () => {
  const db = makeFakeDb({ usageCount: 2 });
  const calls = [];
  await handleLineEvents(envBase(db), { ...TENANT, monthly_limit: 3 }, [EVENT], { fetchImpl: makeMockFetch(calls) });
  assert.ok(calls.some((c) => c.url.includes("chat/completions")), "2 < 3 應呼叫模型");
  assert.equal(db.rows.audit_events.filter((a) => a[2] === "monthly_limit").length, 0);
});

test("店家自訂上限 3：當月 3 次 → 到達即停止呼叫模型", async () => {
  const db = makeFakeDb({ usageCount: 3 });
  const calls = [];
  await handleLineEvents(envBase(db), { ...TENANT, monthly_limit: 3 }, [EVENT], { fetchImpl: makeMockFetch(calls) });
  assert.ok(!calls.some((c) => c.url.includes("chat/completions")), "3 >= 3 不應呼叫模型");
  const lineCall = calls.find((c) => c.url.includes("api.line.me"));
  assert.equal(lineCall.body.messages[0].text, "店家將盡快親自回覆您");
  assert.equal(db.rows.audit_events.filter((a) => a[2] === "monthly_limit").length, 1);
  assert.equal(db.rows.usage_counters.length, 0);
});

test("店家上限為空值（null）→ 用平台預設 5000：4999 仍呼叫、5000 擋下", async () => {
  const calls4999 = [];
  const db4999 = makeFakeDb({ usageCount: 4999 });
  await handleLineEvents(envBase(db4999), { ...TENANT, monthly_limit: null }, [EVENT], { fetchImpl: makeMockFetch(calls4999) });
  assert.ok(calls4999.some((c) => c.url.includes("chat/completions")), "4999 < 5000 應呼叫模型");

  const calls5000 = [];
  const db5000 = makeFakeDb({ usageCount: 5000 });
  await handleLineEvents(envBase(db5000), { ...TENANT, monthly_limit: null }, [EVENT], { fetchImpl: makeMockFetch(calls5000) });
  assert.ok(!calls5000.some((c) => c.url.includes("chat/completions")), "5000 應擋下");
});
