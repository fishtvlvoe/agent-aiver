import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, resolveProviderBaseUrl, inferProviderFromBaseUrl, probeProvider } from "../src/lib/providers-catalog.js";

test("catalog：內建供應商對照表順序與內容", () => {
  assert.deepEqual(Object.keys(PROVIDERS), ["openai", "deepseek", "gemini", "groq", "openrouter", "mirasim", "custom"]);
  assert.equal(PROVIDERS.openai.baseUrl, "https://api.openai.com/v1");
  assert.equal(PROVIDERS.deepseek.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(PROVIDERS.mirasim.baseUrl, null);
  assert.equal(PROVIDERS.custom.baseUrl, null);
});

test("resolveProviderBaseUrl：對照表／custom 存值／mirasim 用 env", () => {
  assert.equal(resolveProviderBaseUrl("deepseek", null, {}), "https://api.deepseek.com/v1");
  assert.equal(resolveProviderBaseUrl("custom", "https://my.example/v1", {}), "https://my.example/v1");
  assert.equal(resolveProviderBaseUrl("mirasim", null, { MIRASIM_API_BASE: "https://mi.example/v1" }), "https://mi.example/v1");
  assert.equal(resolveProviderBaseUrl("mirasim", null, {}), null); // 無 env 回 null
});

test("inferProviderFromBaseUrl：舊資料反推 provider；推不出視為 custom", () => {
  assert.equal(inferProviderFromBaseUrl("https://api.deepseek.com/v1"), "deepseek");
  assert.equal(inferProviderFromBaseUrl("https://api.deepseek.com/v1/"), "deepseek"); // 尾斜線容忍
  assert.equal(inferProviderFromBaseUrl("https://unknown.example/v1"), "custom");
  assert.equal(inferProviderFromBaseUrl(null), "custom");
});

test("probeProvider：2xx 才算過；5xx 與網路錯誤都回 false", async () => {
  assert.equal(await probeProvider("https://x/v1", "k", async () => ({ ok: true })), true);
  assert.equal(await probeProvider("https://x/v1", "k", async () => ({ ok: false })), false);
  assert.equal(await probeProvider("https://x/v1", "k", async () => { throw new Error("dns"); }), false);
  assert.equal(await probeProvider(null, "k", async () => ({ ok: true })), false); // 缺 baseUrl
});
