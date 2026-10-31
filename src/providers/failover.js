// 模型 failover：主要失敗自動切備援；全部失敗回兜底話術
export const FALLBACK_TEXT = "目前忙碌，請稍後再傳";

export async function chatWithFailover(providers, args) {
  for (const provider of providers) {
    try {
      const result = await provider.chat(args);
      return { ...result, providerFailed: false };
    } catch {
      // 這家失敗，換下一家
    }
  }
  return {
    text: FALLBACK_TEXT,
    usage: { promptTokens: 0, completionTokens: 0 },
    providerFailed: true,
  };
}
