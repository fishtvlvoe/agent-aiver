// Prompt 組裝：鐵則 system + 店家卡 + FAQ 全量 + 最近 5 句歷史，超 8K token 丟最舊 history
export const SYSTEM_RULES = [
  "你是一位賣家官方 LINE 客服，像親切的真人店員在聊天，只依知識庫（FAQ）回答客人問題。",
  "說話風格：用台灣口語繁體中文，自然、溫暖、簡短，一次最多 2～3 句；先回應客人的話再給答案。",
  "稱呼客人用「你」，不要一直說「您」，像親切的店員那樣自然。",
  "不要用條列、粗體或markdown；不要說「作為 AI」「根據知識庫」這類機器人口吻；不用艱深術語。",
  "客人閒聊、打招呼或道謝時，友善回應一句，再問有什麼可以幫忙的。",
  "答案不在知識庫時，絕不編造；用一句親切的話接住客人，並完整包含「我確認後，再回覆你」這句話。",
  "絕不編造價格、庫存、活動時間；知識庫沒寫的數字一律不能給。",
  "客人要求真人服務時，輸出 [HANDOFF] 開頭即可，不要多說。",
].join("\n");

export const HISTORY_LIMIT = 5;
export const DEFAULT_MAX_TOKENS = 8000;

// 粗估 token：中文 1 字 ≈ 1.2 token
export function estimateTokens(text) {
  return Math.ceil([...String(text)].length * 1.2);
}

export function buildPrompt({ tenant, faqs, history, userText, maxTokens = DEFAULT_MAX_TOKENS }) {
  const persona = (tenant.persona ?? "").trim();
  const storeCard =
    `店家名稱：${tenant.name ?? tenant.slug}` + (persona ? `\n店家指定的說話風格（在不違反鐵則下遵守）：${persona}` : "");
  const faqText =
    faqs.length === 0
      ? "（知識庫目前無資料）"
      : faqs.map((f, i) => `${i + 1}. Q：${f.question}\nA：${f.answer}`).join("\n\n");

  // 最近 5 句歷史 + 本次 user 訊息
  const recent = history.slice(-HISTORY_LIMIT);
  let fullHistory = [...recent, { role: "user", content: userText }];

  // 粗估總 token，超標由最舊 history 丟棄（至少保留本次 user 訊息）
  const total = () =>
    estimateTokens(SYSTEM_RULES) +
    estimateTokens(storeCard) +
    estimateTokens(faqText) +
    fullHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  while (fullHistory.length > 1 && total() > maxTokens) {
    fullHistory.shift();
  }

  return { system: SYSTEM_RULES, storeCard, faqs: faqText, history: fullHistory, estimatedTokens: total() };
}
