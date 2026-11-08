import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOutcome } from "../src/lib/outcome.js";

// Gherkin 驗收：假設/當/那麼
test("假設 客人說「我要真人客服」；當 分類；那麼 handoff", () => {
  assert.equal(classifyOutcome("好的請稍等", "我要真人客服"), "handoff");
});
test("假設 客人說「可以轉接嗎」；當 分類；那麼 handoff", () => {
  assert.equal(classifyOutcome("任何回覆", "可以轉接嗎"), "handoff");
});
test("假設 客人說「找人工」；當 分類；那麼 handoff", () => {
  assert.equal(classifyOutcome("任何回覆", "找人工"), "handoff");
});
test("假設 AI 回 [MISS] 標記；當 分類；那麼 missed", () => {
  assert.equal(classifyOutcome("[MISS] 這題我確認後回覆您", "運費多少"), "missed");
});
test("假設 AI 回兜底話術；當 分類；那麼 missed", () => {
  assert.equal(classifyOutcome("目前忙碌，請稍後再傳", "你好"), "missed");
});
test("假設 AI 回「這題我確認後回覆您」；當 分類；那麼 missed", () => {
  assert.equal(classifyOutcome("這題我確認後回覆您", "營業時間？"), "missed");
  assert.equal(classifyOutcome("這個我先不亂說，我確認後，再回覆你喔", "有賣貓砂嗎"), "missed");
  assert.equal(classifyOutcome("我們十點開", "幾點開"), "resolved");
});
test("假設 AI 正常回答；當 分類；那麼 resolved", () => {
  assert.equal(classifyOutcome("滿 599 免運喔！", "運費多少"), "resolved");
});
