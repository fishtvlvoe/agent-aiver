// OpenAI 相容 chat.completions provider 工廠
// 支援：逾時（AbortController）、5xx retry 一次、可注入 fetch 方便測試
export function createOpenAIProvider({ name = null, baseUrl, apiKey, model, fetchImpl = fetch, timeoutMs = 10000 }) {
  return {
    name,
    model,
    async chat({ system, storeCard, faqs, history, maxTokens }) {
      const messages = [
        // 合併成單一 system：Gemini 相容介面對多則 system 會忽略鐵則（2026-11-07 實測）
        { role: "system", content: [system, storeCard, faqs].join("\n\n") },
        ...history,
      ];
      let lastError;
      console.log("[provider] attempt", JSON.stringify({ name, baseUrl, model }));
      for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": "agent-aiver/1.0" },
            body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
            signal: ctrl.signal,
          });
          if (res.status >= 500) {
            lastError = new Error(`provider 5xx: ${res.status}`);
            if (attempt === 0) continue; // 5xx retry 一次
            throw lastError;
          }
          if (!res.ok) {
            const body = typeof res.text === "function" ? (await res.text().catch(() => "")).slice(0, 150) : "";
            throw new Error(`provider http ${res.status} ${body}`);
          }
          const data = await res.json();
          return {
            text: data.choices[0].message.content,
            usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0 },
          };
        } catch (err) {
          if (attempt === 0 && !lastError && !(err.name === "AbortError")) lastError = err;
          throw err.name === "AbortError" ? new Error("provider timeout") : err;
        } finally {
          clearTimeout(timer);
        }
      }
      throw lastError ?? new Error("provider failed");
    },
  };
}

// 依 env 建主要與備援 provider 清單（有 GEMINI_API_KEY 時 Gemini 為主、OpenAI 備援；否則 OpenAI 為主；Mirasim 僅在無 Gemini 時加入）
export function providersFromEnv(env, fetchImpl = fetch) {
  const providers = [];
  if (env.GEMINI_API_KEY) {
    providers.push(
      createOpenAIProvider({
        name: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
        fetchImpl,
      }),
    );
  }
  if (env.OPENAI_API_KEY) {
    providers.push(
      createOpenAIProvider({
        name: "openai",
        baseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: env.OPENAI_API_KEY,
        model: env.MODEL ?? "gpt-5.6-luna",
        fetchImpl,
      }),
    );
  }
  if (!env.GEMINI_API_KEY && env.MIRASIM_API_KEY && env.MIRASIM_API_BASE) {
    providers.push(
      createOpenAIProvider({
        name: "mirasim",
        baseUrl: env.MIRASIM_API_BASE,
        apiKey: env.MIRASIM_API_KEY,
        model: env.MODEL ?? "gpt-5.6-luna",
        fetchImpl,
      }),
    );
  }
  return providers;
}
