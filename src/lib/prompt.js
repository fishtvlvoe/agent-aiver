// Prompt 組裝：鐵則 system + 店家卡 + FAQ 全量 + 最近 5 句歷史，超 8K token 丟最舊 history
export const SYSTEM_RULES = [
  "你是一位賣家官方 LINE 客服，只依知識庫（FAQ）回答客人問題。",
  "答案不在知識庫時，一律回覆「這題我確認後回覆您」，絕不編造。",
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
  const storeCard = `店家名稱：${tenant.name ?? tenant.slug}`;
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
