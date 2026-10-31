import { providersFromEnv, createOpenAIProvider } from "./providers/official.js";
import { chatWithFailover } from "./providers/failover.js";
import { buildPrompt } from "./lib/prompt.js";
import { classifyOutcome } from "./lib/outcome.js";
import { checkRateLimit } from "./lib/ratelimit.js";
import { monthKeyTW, MONTHLY_LIMIT } from "./lib/month.js";
import { unwrapSecret, resolveMasterPassword } from "./lib/crypto.js";

export const HANDOFF_REPLY = "已幫您轉達，真人會盡快回覆";
export const RATE_LIMITED_REPLY = "請稍等，我們盡快回覆";
export const MONTHLY_LIMITED_REPLY = "店家將盡快親自回覆您";
const HANDOFF_KEYWORDS = /(真人|客服|轉接|人工)/;

// 解析 tenant 的 LINE access token：D1 wrapped(enc) 優先，其次 per-tenant env，fallback 全域
export async function resolveTenantToken(env, tenant) {
  if (tenant.line_token_enc) {
    const password = resolveMasterPassword(env);
    return await unwrapSecret(password, tenant.line_token_enc);
  }
  return env[`LINE_TOKEN_${tenant.slug}`] ?? env.LINE_CHANNEL_ACCESS_TOKEN ?? null;
}

// LINE Reply API 回覆（fetch 可注入以便測試）
export async function replyToLine(env, tenant, replyToken, text, fetchImpl = fetch) {
  const token = await resolveTenantToken(env, tenant);
  if (!token) throw new Error("missing LINE channel access token");
  const res = await fetchImpl("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) throw new Error(`LINE reply http ${res.status}`);
  return res;
}

async function writeAudit(env, tenant, event, detail) {
  await env.DB.prepare(
    "INSERT INTO audit_events (id, tenant_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), tenant.id, event, JSON.stringify(detail ?? {}), new Date().toISOString())
    .run();
}

async function writeConversation(env, tenant, event, userText, aiText, status) {
  await env.DB.prepare(
    "INSERT INTO conversations (id, tenant_id, user_id, user_text, ai_text, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), tenant.id, event.source?.userId ?? null, userText, aiText, status, new Date().toISOString())
    .run();
}

// LINE 回覆失敗（token 失效、replyToken 過期等）不阻斷整個 webhook
async function safeReply(env, tenant, event, text, fetchImpl) {
  try {
    await replyToLine(env, tenant, event.replyToken, text, fetchImpl);
  } catch (err) {
    await writeAudit(env, tenant, "line_reply_failed", { message: String(err?.message ?? err) });
  }
}

// 9.3/問題 11 模型供應商解析順序：tenant custom > 平台設定（KV platform:model_settings）> env 預設
async function resolveProviders(env, tenant, fetchImpl) {
  const providers = [];
  if (tenant.model_mode === "custom" && tenant.model_base_url && tenant.model_key_enc) {
    const apiKey = await unwrapSecret(resolveMasterPassword(env), tenant.model_key_enc);
    providers.push(
      createOpenAIProvider({
        baseUrl: tenant.model_base_url,
        apiKey,
        model: tenant.model_name,
        fetchImpl,
      }),
    );
  } else if (env.FORM_STATE) {
    // 平台預設：KV 只存 baseUrl+model，key 用平台 env OPENAI_API_KEY
    const platform = await env.FORM_STATE.get("platform:model_settings", "json");
    if (platform?.baseUrl && platform?.model && env.OPENAI_API_KEY) {
      providers.push(
        createOpenAIProvider({ baseUrl: platform.baseUrl, apiKey: env.OPENAI_API_KEY, model: platform.model, fetchImpl }),
      );
    }
  }
  providers.push(...providersFromEnv(env, fetchImpl));
  return providers;
}

// 回覆管線：handoff 短路 → 速率限制 → 月上限 → failover chat → classify → LINE 回覆 → 寫 conversations
export async function handleLineEvents(env, tenant, events, { fetchImpl = fetch, history = [], now = Date.now() } = {}) {
  let handled = 0;
  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") continue;
    handled++;

    const userText = event.message.text;
    const userId = event.source?.userId ?? "unknown";

    // 5.1 轉真人：不呼叫模型，直接回固定話術
    if (HANDOFF_KEYWORDS.test(userText)) {
      await safeReply(env, tenant, event, HANDOFF_REPLY, fetchImpl);
      await writeConversation(env, tenant, event, userText, HANDOFF_REPLY, "handoff");
      continue;
    }

    // 6.1 速率煞車：60 秒最多 3 次，超過不呼叫模型
    if (env.FORM_STATE) {
      const rl = await checkRateLimit(env.FORM_STATE, tenant.id, userId, now);
      if (!rl.allowed) {
        await safeReply(env, tenant, event, RATE_LIMITED_REPLY, fetchImpl);
        await writeAudit(env, tenant, "rate_limited", { userId });
        await writeConversation(env, tenant, event, userText, RATE_LIMITED_REPLY, "rate_limited");
        continue;
      }
    }

    // 6.2 月上限煞車：當月 >= 5000 次不再呼叫模型
    const month = monthKeyTW(new Date(now));
    const usage = await env.DB.prepare("SELECT count FROM usage_counters WHERE tenant_id = ? AND month = ?")
      .bind(tenant.id, month)
      .first();
    if ((usage?.count ?? 0) >= MONTHLY_LIMIT) {
      await safeReply(env, tenant, event, MONTHLY_LIMITED_REPLY, fetchImpl);
      await writeAudit(env, tenant, "monthly_limit", { month, count: usage.count });
      await writeConversation(env, tenant, event, userText, MONTHLY_LIMITED_REPLY, "rate_limited");
      continue;
    }

    const faqs = (await env.DB.prepare("SELECT question, answer FROM faqs WHERE tenant_id = ?").bind(tenant.id).all()).results ?? [];
    const prompt = buildPrompt({ tenant, faqs, history, userText });
    const result = await chatWithFailover(await resolveProviders(env, tenant, fetchImpl), prompt);

    if (result.providerFailed) {
      await writeAudit(env, tenant, "all_providers_failed", { userText });
    } else {
      // 模型真的回覆成功才計費 +1
      await env.DB.prepare(
        "INSERT INTO usage_counters (tenant_id, month, count) VALUES (?, ?, 1) ON CONFLICT(tenant_id, month) DO UPDATE SET count = count + 1",
      )
        .bind(tenant.id, month)
        .run();
    }

    const status = classifyOutcome(result.text, userText);
    await safeReply(env, tenant, event, result.text, fetchImpl);
    await writeConversation(env, tenant, event, userText, result.text, status);
  }
  return { handled };
}
