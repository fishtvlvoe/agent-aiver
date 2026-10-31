// 內建模型供應商對照表（問題 13）：前端選單與後端解析共用同一份順序
export const PROVIDERS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  gemini: { label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  mirasim: { label: "mirasim（折扣）", baseUrl: null /* 後端用 env.MIRASIM_API_BASE 補 */ },
  custom: { label: "自訂（手填 base URL）", baseUrl: null },
};

// 依 provider 解析實際 base URL：custom 用存入的 baseUrl，mirasim 用 env，其餘用對照表
export function resolveProviderBaseUrl(provider, storedBaseUrl, env = {}) {
  if (provider === "mirasim") return env.MIRASIM_API_BASE ?? null;
  if (provider === "custom") return storedBaseUrl ?? null;
  return PROVIDERS[provider]?.baseUrl ?? storedBaseUrl ?? null;
}

// 向後相容：舊資料只有 baseUrl 沒有 provider 時，比對對照表反推；推不出視為 custom
export function inferProviderFromBaseUrl(baseUrl) {
  if (!baseUrl) return "custom";
  for (const [key, p] of Object.entries(PROVIDERS)) {
    if (p.baseUrl && baseUrl.replace(/\/$/, "") === p.baseUrl.replace(/\/$/, "")) return key;
  }
  return "custom";
}

// 打供應商 /models 驗證 key（2xx 才算過）；網路錯誤視為失敗
export async function probeProvider(baseUrl, apiKey, fetchImpl = fetch) {
  if (!baseUrl || !apiKey) return false;
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
