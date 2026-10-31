import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLineEvents } from "../src/reply.js";
import { FALLBACK_TEXT } from "../src/providers/failover.js";

const TENANT = { id: "t1", slug: "demo", name: "Demo 店" };
const FAQS = [{ question: "運費？", answer: "滿 599 免運" }];
const EVENT = {
  type: "message",
  replyToken: "rt-1",
  source: { userId: "U123" },
  message: { type: "text", text: "運費多少" },
};

// 假 D1：支援 tenants/faqs 查詢與寫入追蹤
function makeFakeDb() {
  const rows = { audit_events: [], conversations: [] };
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return null;
            },
            async all() {
              if (sql.includes("FROM faqs")) return { results: FAQS };
              return { results: [] };
            },
            async run() {
              if (sql.includes("audit_events")) rows.audit_events.push(args);
              if (sql.includes("conversations")) rows.conversations.push(args);
            },
          };
        },
      };
    },
  };
}

// 假 fetch：OpenAI chat.completions 與 LINE reply 都走這裡
function makeMockFetch({ aiText = "滿 599 免運喔！", aiFail = false, calls = [] }) {
  return async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null, auth: opts.headers?.authorization });
    if (url.includes("api.line.me")) {
      return { status: 200, ok: true, json: async () => ({}) };
    }
    if (aiFail) return { status: 500, ok: false, json: async () => ({}) };
    return {
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: aiText } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    };
  };
}

function makeEnv(db) {
  return {
    DB: db,
    OPENAI_API_KEY: "k",
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  };
}

test("3.5 整合：FAQ→prompt→chat→LINE 回覆→conversations 寫入", async () => {
  const db = makeFakeDb();
  const calls = [];
  const res = await handleLineEvents(makeEnv(db), TENANT, [EVENT], { fetchImpl: makeMockFetch({ aiText: "滿 599 免運喔！", calls }) });

  assert.equal(res.handled, 1);
  // LINE Reply API 被呼叫且內容正確
  const lineCall = calls.find((c) => c.url.includes("api.line.me"));
  assert.ok(lineCall, "應呼叫 LINE Reply API");
  assert.equal(lineCall.body.replyToken, "rt-1");
  assert.equal(lineCall.body.messages[0].text, "滿 599 免運喔！");
  assert.equal(lineCall.auth, "Bearer line-token");
  // conversations 寫入且 status=resolved
  assert.equal(db.rows.conversations.length, 1);
  const conv = db.rows.conversations[0];
  assert.equal(conv[2], "U123");
  assert.equal(conv[3], "運費多少");
  assert.equal(conv[4], "滿 599 免運喔！");
  assert.equal(conv[5], "resolved");
  // provider 成功 → 不該有 all_providers_failed
  assert.equal(db.rows.audit_events.length, 0);
});

test("3.5 整合：provider 全滅 → 兜底話術回 LINE + audit all_providers_failed + conversations=missed", async () => {
  const db = makeFakeDb();
  const calls = [];
  const res = await handleLineEvents(makeEnv(db), TENANT, [EVENT], { fetchImpl: makeMockFetch({ aiFail: true, calls }) });

  assert.equal(res.handled, 1);
  const lineCall = calls.find((c) => c.url.includes("api.line.me"));
  assert.equal(lineCall.body.messages[0].text, FALLBACK_TEXT);
  assert.equal(db.rows.audit_events.length, 1);
  assert.equal(db.rows.audit_events[0][2], "all_providers_failed");
  assert.equal(db.rows.conversations.length, 1);
  assert.equal(db.rows.conversations[0][5], "missed");
});

test("3.5/5.1 整合：客人要真人 → 回固定話術、不呼叫模型、status=handoff", async () => {
  const db = makeFakeDb();
  const calls = [];
  const handoffEvent = { ...EVENT, message: { type: "text", text: "我要真人客服" } };
  await handleLineEvents(makeEnv(db), TENANT, [handoffEvent], { fetchImpl: makeMockFetch({ calls }) });
  // 5.1：LINE 回覆文字為轉真人話術
  const lineCall = calls.find((c) => c.url.includes("api.line.me"));
  assert.equal(lineCall.body.messages[0].text, "已幫您轉達，真人會盡快回覆");
  // 5.1：不呼叫模型（無 chat.completions 請求）
  assert.ok(!calls.some((c) => c.url.includes("chat/completions")), "handoff 不應呼叫模型");
  // 5.1：conversations status=handoff，後台可查
  assert.equal(db.rows.conversations[0][5], "handoff");
});

test("3.5 整合：per-tenant LINE token 優先於全域", async () => {
  const db = makeFakeDb();
  const calls = [];
  const env = { ...makeEnv(db), LINE_TOKEN_demo: "tenant-line-token" };
  await handleLineEvents(env, TENANT, [EVENT], { fetchImpl: makeMockFetch({ calls }) });
  const lineCall = calls.find((c) => c.url.includes("api.line.me"));
  assert.equal(lineCall.auth, "Bearer tenant-line-token");
});
