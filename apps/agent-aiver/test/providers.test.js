import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAIProvider, providersFromEnv } from "../src/providers/official.js";

const OK_RESPONSE = {
  choices: [{ message: { content: "你好，這是答案" } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

function jsonRes(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

test("provider：成功路徑回 text 與 usage", async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return jsonRes(200, OK_RESPONSE);
  };
  const provider = createOpenAIProvider({ baseUrl: "https://api.example.com/v1", apiKey: "k", model: "m", fetchImpl: mockFetch });
  const result = await provider.chat({
    system: "s",
    storeCard: "店家名稱：Demo",
    faqs: "1. Q：A\nA：B",
    history: [{ role: "user", content: "hi" }],
    maxTokens: 100,
  });
  assert.equal(result.text, "你好，這是答案");
  assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 5 });
  assert.equal(calls[0].url, "https://api.example.com/v1/chat/completions");
  assert.equal(calls[0].body.model, "m");
});

test("provider：5xx retry 一次後成功", async () => {
  let n = 0;
  const mockFetch = async () => (++n === 1 ? jsonRes(500, {}) : jsonRes(200, OK_RESPONSE));
  const provider = createOpenAIProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl: mockFetch });
  const result = await provider.chat({ system: "s", storeCard: "", faqs: "", history: [], maxTokens: 10 });
  assert.equal(result.text, "你好，這是答案");
  assert.equal(n, 2); // 第一次 5xx 被 retry
});

test("provider：逾時（AbortController）會拒絕", async () => {
  // mock fetch 無視請求、永遠不 resolve，但尊重 abort signal
  const hangingFetch = (url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  const provider = createOpenAIProvider({ baseUrl: "https://x", apiKey: "k", model: "m", fetchImpl: hangingFetch, timeoutMs: 50 });
  await assert.rejects(
    () => provider.chat({ system: "s", storeCard: "", faqs: "", history: [], maxTokens: 10 }),
    /timeout/,
  );
});

test("Gemini provider 用 GEMINI_MODEL（或預設），不沿用 MODEL", async () => {
  const bodies = [];
  const mockFetch = async (url, opts) => {
    bodies.push({ url, model: JSON.parse(opts.body).model });
    return jsonRes(200, OK_RESPONSE);
  };
  const chat = (env) => providersFromEnv({ MODEL: "gpt-5.6-luna", GEMINI_API_KEY: "k", ...env }, mockFetch)[0].chat({
    system: "s", storeCard: "", faqs: "", history: [], maxTokens: 5,
  });
  await chat({});
  await chat({ GEMINI_MODEL: "gemini-3.5-flash-lite" });
  assert.deepEqual(bodies.map((b) => b.model), ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite"]);
  assert.ok(bodies.every((b) => b.url.startsWith("https://generativelanguage.googleapis.com/")));
});

test("有 GEMINI_API_KEY 時 gemini 排第一、openai 第二", () => {
  const providers = providersFromEnv({ GEMINI_API_KEY: "g", OPENAI_API_KEY: "o" }, async () => jsonRes(200, OK_RESPONSE));
  assert.deepEqual(providers.map((p) => p.name), ["gemini", "openai"]);
});
