import { test } from "node:test";
import assert from "node:assert/strict";
import { handleLineEvents } from "../src/reply.js";

// 8.4：webhook 回覆管線只拿本租戶 FAQ 組 prompt（資料庫內有別戶 FAQ 也不可洩）
test("8.4 隔離：prompt 只含本戶 FAQ", async () => {
  const TENANT = { id: "t-A", slug: "store-a", name: "A 店", use_platform_model: 1 };
  const EVENT = { type: "message", replyToken: "rt", source: { userId: "U1" }, message: { type: "text", text: "運費？" } };
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return null;
            },
            async all() {
              // 只回 t-A 的 FAQ；假設庫中另有 t-B 的「B 店機密批發價」
              if (sql.includes("FROM bot_faq")) {
                assert.equal(args[0], "t-A"); // 查詢條件必為本戶 tenant_id
                return { results: [{ question: "運費？", answer: "滿 599 免運" }] };
              }
              return { results: [] };
            },
            async run() {},
          };
        },
      };
    },
  };
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes("api.line.me")) return { status: 200, ok: true, json: async () => ({}) };
    return { status: 200, ok: true, json: async () => ({ choices: [{ message: { content: "滿 599 免運" } }], usage: {} }) };
  };
  await handleLineEvents({ DB: db, OPENAI_API_KEY: "k", LINE_CHANNEL_ACCESS_TOKEN: "t" }, TENANT, [EVENT], { fetchImpl: mockFetch });

  const aiCall = calls.find((c) => c.url.includes("chat/completions"));
  assert.ok(aiCall, "應呼叫模型");
  const promptText = JSON.stringify(aiCall.body.messages);
  assert.match(promptText, /滿 599 免運/); // 含本戶 FAQ
  assert.ok(!promptText.includes("B 店機密批發價"), "prompt 不可含他戶 FAQ");
});
