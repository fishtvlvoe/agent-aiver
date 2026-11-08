import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, estimateTokens, SYSTEM_RULES } from "../src/lib/prompt.js";

const TENANT = { id: "t1", slug: "demo", name: "Demo 店" };

test("prompt：組裝含鐵則、店家卡、FAQ 全量與最近 5 句歷史", () => {
  const faqs = [{ question: "運費？", answer: "滿 599 免運" }];
  const history = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `訊息${i}` }));
  const p = buildPrompt({ tenant: TENANT, faqs, history, userText: "現在特價嗎" });
  assert.equal(p.system, SYSTEM_RULES);
  assert.match(p.storeCard, /Demo 店/);
  assert.match(p.faqs, /運費？/);
  assert.match(p.faqs, /滿 599 免運/);
  // 只留最近 5 句 + 本次 user 訊息
  assert.equal(p.history.length, 6);
  assert.equal(p.history.at(-1).content, "現在特價嗎");
  assert.equal(p.history[0].content, "訊息3");
});

test("prompt：無 FAQ 時標示知識庫無資料", () => {
  const p = buildPrompt({ tenant: TENANT, faqs: [], history: [], userText: "hi" });
  assert.match(p.faqs, /知識庫目前無資料/);
});

test("prompt：token 超 8K 由最舊 history 丟棄", () => {
  const faqs = [{ question: "Q", answer: "A".repeat(100) }];
  // 每句 history 約 2000 字 → 遠超 8K
  const history = Array.from({ length: 6 }, (_, i) => ({ role: "user", content: `訊息${i} `.padEnd(2000, "字") }));
  const p = buildPrompt({ tenant: TENANT, faqs, history, userText: "hi" });
  assert.ok(p.estimatedTokens <= 8000, `estimatedTokens=${p.estimatedTokens} 應 ≤ 8000`);
  // 最後一句必為本次 user 訊息
  assert.equal(p.history.at(-1).content, "hi");
});

test("prompt：粗估中文 1 字 ≈ 1.2 token", () => {
  assert.equal(estimateTokens("一二三四五"), 6); // ceil(5 * 1.2)
});

test("prompt：店家自訂說話風格附加進店家卡，空白則不附加", () => {
  const withPersona = buildPrompt({ tenant: { ...TENANT, persona: " 像年輕小編，愛用語助詞 " }, faqs: [], history: [], userText: "嗨" });
  assert.match(withPersona.storeCard, /說話風格.*像年輕小編，愛用語助詞/);
  const blank = buildPrompt({ tenant: { ...TENANT, persona: "  " }, faqs: [], history: [], userText: "嗨" });
  assert.doesNotMatch(blank.storeCard, /說話風格/);
  const none = buildPrompt({ tenant: TENANT, faqs: [], history: [], userText: "嗨" });
  assert.doesNotMatch(none.storeCard, /說話風格/);
});
