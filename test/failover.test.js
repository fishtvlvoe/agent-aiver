import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAIProvider } from "../src/providers/official.js";
import { chatWithFailover, FALLBACK_TEXT } from "../src/providers/failover.js";

const ARGS = { system: "s", storeCard: "", faqs: "", history: [], maxTokens: 10 };

function failingProvider() {
  return { async chat() { throw new Error("boom"); } };
}
function okProvider(text) {
  return { async chat() { return { text, usage: { promptTokens: 1, completionTokens: 1 } }; } };
}

test("failover：主要失敗自動切備援", async () => {
  const order = [];
  const primary = { async chat() { order.push("primary"); throw new Error("down"); } };
  const backup = {
    async chat() {
      order.push("backup");
      return { text: "備援答案", usage: { promptTokens: 1, completionTokens: 1 } };
    },
  };
  const result = await chatWithFailover([primary, backup], ARGS);
  assert.deepEqual(order, ["primary", "backup"]);
  assert.equal(result.text, "備援答案");
  assert.equal(result.providerFailed, false);
});

test("failover：全部失敗回兜底話術且標記 providerFailed", async () => {
  const result = await chatWithFailover([failingProvider(), failingProvider()], ARGS);
  assert.equal(result.text, FALLBACK_TEXT);
  assert.equal(result.providerFailed, true);
  assert.deepEqual(result.usage, { promptTokens: 0, completionTokens: 0 });
});

test("failover：兩個 official provider 整合（mock fetch 一掛一好）", async () => {
  const bad = createOpenAIProvider({
    baseUrl: "https://bad", apiKey: "k", model: "m",
    fetchImpl: async () => ({ status: 500, ok: false, json: async () => ({}) }),
  });
  const good = createOpenAIProvider({
    baseUrl: "https://good", apiKey: "k", model: "m",
    fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }], usage: {} }) }),
  });
  const result = await chatWithFailover([bad, good], ARGS);
  assert.equal(result.text, "ok");
  assert.equal(result.providerFailed, false);
});
