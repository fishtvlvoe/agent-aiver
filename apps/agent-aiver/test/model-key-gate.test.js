import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLineEvents, NO_MODEL_REPLY } from "../src/reply.js";
import { wrapSecret } from "../src/lib/crypto.js";

// 5.5 / 6.2：模型呼叫閘門（店家自有金鑰 or 平台開通，兩者都沒有就不呼叫任何模型）
const PASSWORD = "test-master-password";
const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const TOKEN = "cf-token-plain-gate";
const EVENT = {
  type: "message",
  replyToken: "rt-gate-2",
  source: { userId: "U-gate-2" },
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

function makeMockFetch(calls) {
  return async (url, opts = {}) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    return {
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: "AI 回覆" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
    };
  };
}

const modelCalls = (calls) => calls.filter((c) => c.url.includes("chat/completions") || c.url.includes("api.cloudflare.com"));
const lineText = (calls) => calls.find((c) => c.url.includes("api.line.me")).body.messages[0].text;

test("6.2 cloudflare：有 Account ID、沒有金鑰、未開通 → 不呼叫 Cloudflare 也不呼叫平台模型，回固定話術", async () => {
  const db = makeFakeDb();
  const calls = [];
  const env = { DB: db, CREDENTIAL_ENC_KEY: PASSWORD, OPENAI_API_KEY: "k", LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  const tenant = {
    id: "t-cf-nokey",
    slug: "cf-nokey",
    model_mode: "custom",
    model_provider: "cloudflare",
    model_name: "@cf/meta/llama-3.1-8b-instruct",
    model_account_id: ACCOUNT_ID,
    model_key_enc: null,
    use_platform_model: 0,
  };

  await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(calls) });

  assert.equal(modelCalls(calls).length, 0, "不應呼叫任何模型或 Cloudflare");
  assert.equal(lineText(calls), NO_MODEL_REPLY);
  assert.equal(db.rows.usage.length, 0);
});

test("5.5 開關先開後關：同一店家開通時可用平台模型，關閉後立即回固定話術、不再呼叫", async () => {
  const env = { DB: makeFakeDb(), OPENAI_API_KEY: "k", LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  const tenant = { id: "t-toggle", slug: "toggle", model_mode: "platform", use_platform_model: 1 };

  const openCalls = [];
  await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(openCalls) });
  assert.equal(modelCalls(openCalls).length, 1);
  assert.equal(lineText(openCalls), "AI 回覆");

  tenant.use_platform_model = 0;
  const closedCalls = [];
  await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(closedCalls) });
  assert.equal(modelCalls(closedCalls).length, 0);
  assert.equal(lineText(closedCalls), NO_MODEL_REPLY);
});

// 真 bug（已驗證，未修產品程式）：hasOwnModelKey 只看 Account ID 是否有值，
// resolveProviders 再因格式錯解不出 baseUrl → 沒有店家 provider，退回 env 平台 OpenAI 金鑰
test("6.2 cloudflare：金鑰在但 Account ID 格式錯、未開通 → 不呼叫任何模型（不得退回平台模型）", async () => {
  const db = makeFakeDb();
  const calls = [];
  const env = { DB: db, CREDENTIAL_ENC_KEY: PASSWORD, OPENAI_API_KEY: "k", LINE_CHANNEL_ACCESS_TOKEN: "line-token" };
  const tenant = {
    id: "t-cf-badid",
    slug: "cf-badid",
    model_mode: "custom",
    model_provider: "cloudflare",
    model_name: "@cf/meta/llama-3.1-8b-instruct",
    model_account_id: "../evil",
    model_key_enc: await wrapSecret(PASSWORD, TOKEN),
    use_platform_model: 0,
  };

  await handleLineEvents(env, tenant, [EVENT], { fetchImpl: makeMockFetch(calls) });

  assert.equal(modelCalls(calls).length, 0, "未開通的店家不得因金鑰設定不完整而用到平台 OpenAI 金鑰");
  assert.equal(lineText(calls), NO_MODEL_REPLY);
});
