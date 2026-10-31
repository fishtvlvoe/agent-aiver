// OpenAI 相容 chat.completions provider 工廠
// 支援：逾時（AbortController）、5xx retry 一次、可注入 fetch 方便測試
export function createOpenAIProvider({ baseUrl, apiKey, model, fetchImpl = fetch, timeoutMs = 10000 }) {
  return {
    model,
    async chat({ system, storeCard, faqs, history, maxTokens }) {
      const messages = [
        { role: "system", content: system },
        { role: "system", content: storeCard },
        { role: "system", content: faqs },
        ...history,
      ];
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
            signal: ctrl.signal,
          });
          if (res.status >= 500) {
            lastError = new Error(`provider 5xx: ${res.status}`);
            if (attempt === 0) continue; // 5xx retry 一次
            throw lastError;
          }
          if (!res.ok) throw new Error(`provider http ${res.status}`);
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

// 依 env 建主要與備援 provider 清單（主要：OpenAI；備援：Gemini OpenAI 相容 或 Mirasim）
export function providersFromEnv(env, fetchImpl = fetch) {
  const providers = [];
  if (env.OPENAI_API_KEY) {
    providers.push(
      createOpenAIProvider({
        baseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: env.OPENAI_API_KEY,
        model: env.MODEL ?? "gpt-5.6-luna",
        fetchImpl,
      }),
    );
  }
  if (env.GEMINI_API_KEY) {
    providers.push(
      createOpenAIProvider({
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: env.GEMINI_API_KEY,
        model: env.MODEL ?? "gpt-5.6-luna",
        fetchImpl,
      }),
    );
  } else if (env.MIRASIM_API_KEY && env.MIRASIM_API_BASE) {
    providers.push(
      createOpenAIProvider({
        baseUrl: env.MIRASIM_API_BASE,
        apiKey: env.MIRASIM_API_KEY,
        model: env.MODEL ?? "gpt-5.6-luna",
        fetchImpl,
      }),
    );
  }
  return providers;
}
