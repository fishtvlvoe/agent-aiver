import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLineEvents, NO_MODEL_REPLY } from "../src/reply.js";
import { wrapSecret } from "../src/lib/crypto.js";
import { resolveCloudflareBaseUrl } from "../src/lib/providers-catalog.js";

// Cloudflare Workers AI：店家自填 Account ID + API Token，走 OpenAI 相容端點
const PASSWORD = "test-master-password";
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const TOKEN = "cf-token-plain-0007";
const EVENT = {
  type: "message",
  replyToken: "rt-cf",
  source: { userId: "U-cf" },
  message: { type: "text", text: "運費多少" },
};

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

// 記錄 url、headers 與 body；AI 回文字，LINE 回 200
function makeMockFetch(calls) {
  return async (url, opts = {}) => {
    calls.push({ url, headers: opts.headers ?? {}, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    return {
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: "AI 回覆" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    };
  };
}

const aiCalls = (calls) => calls.filter((c) => c.url.includes("chat/completions"));
const lineText = (calls) => calls.find((c) => c.url.includes("api.line.me")).body.messages[0].text;

test("cloudflare：Account ID 必須是 32 位 hex，否則不組網址（防止拼進路徑）", () => {
  assert.equal(
    resolveCloudflareBaseUrl(ACCOUNT_ID),
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/v1`,
  );
  assert.equal(resolveCloudflareBaseUrl("../evil"), null);
  assert.equal(resolveCloudflareBaseUrl("0123"), null);
  assert.equal(resolveCloudflareBaseUrl(null), null);
});

test("cloudflare：有 token 但沒有 Account ID → 視為未設定，不呼叫 AI、回固定話術", async () => {
  const db = makeFakeDb();
  const calls = [];
  const env = { DB: db, CREDENTIAL_ENC_KEY: PASSWORD, LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  const tenant = {
    id: "t-cf-partial",
    slug: "cf-partial",
    model_mode: "custom",
    model_provider: "cloudflare",
    model_name: "@cf/meta/llama-3.1-8b-instruct",
    model_account_id: null,
    model_key_enc: await wrapSecret(PASSWORD, TOKEN),
    use_platform_model: 0,
  };

  await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(calls) });

  assert.equal(aiCalls(calls).length, 0, "不應呼叫任何模型");
  assert.equal(calls.some((c) => c.url.includes("api.cloudflare.com")), false);
  assert.equal(lineText(calls), NO_MODEL_REPLY);
  assert.equal(db.rows.usage.length, 0);
});

test("cloudflare：Account ID 與 token 齊全 → 走 Workers AI 端點、Bearer 解開的 token，且不外露", async () => {
  const db = makeFakeDb();
  const calls = [];
  const env = { DB: db, CREDENTIAL_ENC_KEY: PASSWORD, LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  const tenant = {
    id: "t-cf",
    slug: "cf",
    model_mode: "custom",
    model_provider: "cloudflare",
    model_name: "@cf/meta/llama-3.1-8b-instruct",
    model_account_id: ACCOUNT_ID,
    model_key_enc: await wrapSecret(PASSWORD, TOKEN),
    use_platform_model: 0,
  };

  await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(calls) });

  const [ai] = aiCalls(calls);
  assert.equal(aiCalls(calls).length, 1);
  assert.equal(
    ai.url,
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/v1/chat/completions`,
  );
  assert.equal(new Headers(ai.headers).get("authorization"), `Bearer ${TOKEN}`);
  assert.equal(ai.body.model, "@cf/meta/llama-3.1-8b-instruct");
  assert.equal(lineText(calls), "AI 回覆");

  // 金鑰只在呼叫供應商時出現，不寫進 LINE 回覆或對話紀錄
  const lineCall = calls.find((c) => c.url.includes("api.line.me"));
  assert.equal(JSON.stringify(lineCall.body).includes(TOKEN), false);
  assert.equal(JSON.stringify(db.rows).includes(TOKEN), false);
});
