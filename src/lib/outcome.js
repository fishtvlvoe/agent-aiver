import { FALLBACK_TEXT } from "../providers/failover.js";

// 對話結果分類：handoff（客人要真人）/ missed（AI 沒答上來）/ resolved
export function classifyOutcome(aiReply, userText) {
  // 假設/當：客人說要真人客服；那麼：分類為 handoff
  if (/(真人|客服|轉接|人工)/.test(userText ?? "")) return "handoff";
  // 假設/當：AI 回覆含兜底話術或 [MISS] 標記；那麼：分類為 missed
  if (
    (aiReply ?? "").includes("[MISS]") ||
    (aiReply ?? "").includes(FALLBACK_TEXT) ||
    (aiReply ?? "").includes("這題我確認後回覆您")
  ) {
    return "missed";
  }
  return "resolved";
}
