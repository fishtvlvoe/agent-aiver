import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLineEvents, NO_MODEL_REPLY } from "../src/reply.js";
import { wrapSecret } from "../src/lib/crypto.js";

// 5.2：店家未填自己金鑰且未開通平台模型 → 不呼叫任何 AI，回固定話術並寫稽核
const PASSWORD = "test-master-password";
const EVENT = {
  type: "message",
  replyToken: "rt-gate",
  source: { userId: "U-gate" },
  message: { type: "text", text: "運費多少" },
};

// 假 D1：記錄稽核、對話、用量寫入
function makeFakeDb() {
  const rows = { audit_events: [], conversations: [], usage: [] };
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
              return { results: [] };
            },
            async run() {
              if (sql.includes("bot_audit_event")) rows.audit_events.push(args);
              if (sql.includes("bot_conversation")) rows.conversations.push(args);
              if (sql.includes("bot_usage_counter")) rows.usage.push(args);
            },
          };
        },
      };
    },
  };
}

// 假 fetch：記錄所有請求；AI 回一段文字，LINE 回 200
function makeMockFetch(calls) {
  return async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    return {
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: "AI 回覆" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    };
  };
}

const lineText = (calls) => calls.find((c) => c.url.includes("api.line.me")).body.messages[0].text;
const aiCalls = (calls) => calls.filter((c) => c.url.includes("chat/completions"));

test("5.2 未填金鑰、未開通：即使 env 有 OPENAI_API_KEY 也不呼叫 AI，回固定話術、寫稽核、不計用量", async () => {
  const db = makeFakeDb();
  const calls = [];
  const env = { DB: db, OPENAI_API_KEY: "k", LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  const tenant = { id: "t-none", slug: "none", model_mode: "platform", use_platform_model: 0 };

  const res = await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(calls) });

  assert.equal(res.handled, 1);
  assert.equal(aiCalls(calls).length, 0, "不應呼叫任何模型");
  assert.equal(lineText(calls), NO_MODEL_REPLY);
  assert.equal(NO_MODEL_REPLY, "店家尚未設定 AI，請稍後由店家親自回覆");
  assert.equal(db.rows.audit_events.length, 1);
  assert.equal(db.rows.audit_events[0][2], "model_not_configured");
  assert.equal(db.rows.conversations.length, 1);
  assert.equal(db.rows.conversations[0][5], "handoff");
  assert.equal(db.rows.usage.length, 0, "不計用量");
});

test("5.2 店家自己有金鑰（custom + model_key_enc）：照舊呼叫自己的供應商", async () => {
  const db = makeFakeDb();
  const calls = [];
  const env = { DB: db, CREDENTIAL_ENC_KEY: PASSWORD, LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  const tenant = {
    id: "t-own",
    slug: "own",
    model_mode: "custom",
    model_provider: "custom",
    model_base_url: "https://custom.example/v1",
    model_name: "my-model",
    model_key_enc: await wrapSecret(PASSWORD, "sk-own"),
    use_platform_model: 0,
  };

  await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(calls) });

  assert.equal(aiCalls(calls).length, 1);
  assert.ok(aiCalls(calls)[0].url.startsWith("https://custom.example/v1"));
  assert.equal(lineText(calls), "AI 回覆");
  assert.ok(!db.rows.audit_events.some((a) => a[2] === "model_not_configured"));
});

test("5.2 開通平台模型（usePlatformModel=1）、無自己金鑰：照舊走 env 模型", async () => {
  const db = makeFakeDb();
  const calls = [];
  const env = { DB: db, OPENAI_API_KEY: "k", LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  const tenant = { id: "t-platform", slug: "platform", model_mode: "platform", use_platform_model: 1 };

  await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(calls) });

  assert.equal(aiCalls(calls).length, 1);
  assert.equal(lineText(calls), "AI 回覆");
  assert.ok(!db.rows.audit_events.some((a) => a[2] === "model_not_configured"));
  assert.equal(db.rows.usage.length, 1, "平台模型回覆成功才計費");
});
