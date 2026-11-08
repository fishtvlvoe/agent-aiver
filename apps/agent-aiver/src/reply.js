import { providersFromEnv, createOpenAIProvider } from "./providers/official.js";
import { chatWithFailover } from "./providers/failover.js";
import { buildPrompt } from "./lib/prompt.js";
import { classifyOutcome } from "./lib/outcome.js";
import { checkRateLimit } from "./lib/ratelimit.js";
import { monthKeyTW, MONTHLY_LIMIT } from "./lib/month.js";
import { unwrapSecret, resolveMasterPassword } from "./lib/crypto.js";
import { resolveProviderBaseUrl, resolveCloudflareBaseUrl } from "./lib/providers-catalog.js";
import { writeAudit, writeConversation, getUsageCount, getFaqs, incrementUsage } from "./lib/store.js";
import { ensureFreshCfToken } from "./lib/cf-oauth-refresh.js";

export const HANDOFF_REPLY = "已幫您轉達，真人會盡快回覆";
export const RATE_LIMITED_REPLY = "請稍等，我們盡快回覆";
export const MONTHLY_LIMITED_REPLY = "店家將盡快親自回覆您";
export const NO_MODEL_REPLY = "店家尚未設定 AI，請稍後由店家親自回覆";
const HANDOFF_KEYWORDS = /(真人|客服|轉接|人工)/;

// 解析 tenant 的 LINE access token：共用實作在 src/lib/tenant-token.js（問題 12 抽出）
import { resolveTenantToken } from "./lib/tenant-token.js";
export { resolveTenantToken };

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

// LINE 回覆失敗（token 失效、replyToken 過期等）不阻斷整個 webhook
async function safeReply(env, tenant, event, text, fetchImpl) {
  try {
    await replyToLine(env, tenant, event.replyToken, text, fetchImpl);
  } catch (err) {
    await writeAudit(env, tenant, "line_reply_failed", { message: String(err?.message ?? err) });
  }
}

// 5.2 店家有自己的金鑰，或被平台開通「使用平台模型」，才允許呼叫任何模型
function hasModelAccess(tenant) {
  return hasOwnModelKey(tenant) || !!tenant.use_platform_model;
}

// Cloudflare 需要 Account ID 與 API Token 兩者齊全，缺一視為未設定
function hasOwnModelKey(tenant) {
  if (tenant.model_mode !== "custom" || !tenant.model_key_enc) return false;
  if (tenant.cf_oauth_status === "invalid") return false;
  return tenant.model_provider !== "cloudflare" || !!resolveCloudflareBaseUrl(tenant.model_account_id);
}

// 9.3/問題 11/13 模型供應商解析順序：tenant custom > 平台多組 failover 鍊 > env 預設
async function resolveProviders(env, tenant, fetchImpl, freshAccessToken) {
  const providers = [];
  if (tenant.model_mode === "custom" && tenant.model_key_enc) {
    // 問題 13：依 provider 解析 baseUrl（custom 用存的、mirasim 用 env、其餘對照表）；cloudflare 依 Account ID 組網址
    const baseUrl =
      tenant.model_provider === "cloudflare"
        ? resolveCloudflareBaseUrl(tenant.model_account_id)
        : resolveProviderBaseUrl(tenant.model_provider, tenant.model_base_url, env);
    // OAuth 連結的店家：用剛續期得到的 access token；手動貼 Token 的店家照舊解開 modelKeyEnc
    const apiKey = freshAccessToken ?? (await unwrapSecret(resolveMasterPassword(env), tenant.model_key_enc));
    if (baseUrl && apiKey) {
      providers.push(
        createOpenAIProvider({ baseUrl, apiKey, model: tenant.model_name, fetchImpl }),
      );
    }
  } else if (env.FORM_STATE) {
    // 平台預設：多組 failover（第一組優先），key 為 wrapped 存 KV
    const platform = await env.FORM_STATE.get("platform:model_settings", "json");
    const groups = Array.isArray(platform) ? platform : [];
    const password = resolveMasterPassword(env);
    for (const g of groups) {
      const baseUrl = resolveProviderBaseUrl(g.provider, g.baseUrl, env);
      if (!baseUrl || !g.apiKeyEnc || !g.model) continue;
      // 舊金鑰解不開就略過這一組，改走下一組或 env 預設，不讓整則回覆失敗
      let apiKey;
      try {
        apiKey = await unwrapSecret(password, g.apiKeyEnc);
      } catch {
        continue;
      }
      providers.push(createOpenAIProvider({ baseUrl, apiKey, model: g.model, fetchImpl }));
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

    // 5.2 未填自己的金鑰且未開通平台模型：不呼叫任何模型、不計用量，改由店家親自回覆
    if (!hasModelAccess(tenant)) {
      await safeReply(env, tenant, event, NO_MODEL_REPLY, fetchImpl);
      await writeAudit(env, tenant, "model_not_configured", { userId });
      await writeConversation(env, tenant, event, userText, NO_MODEL_REPLY, "handoff");
      continue;
    }

    // 6.2 月上限煞車：當月 >= 店家上限（空值用平台預設 5000）次不再呼叫模型
    const month = monthKeyTW(new Date(now));
    const usageCount = await getUsageCount(env, tenant, month);
    if (usageCount >= (tenant.monthly_limit ?? MONTHLY_LIMIT)) {
      await safeReply(env, tenant, event, MONTHLY_LIMITED_REPLY, fetchImpl);
      await writeAudit(env, tenant, "monthly_limit", { month, count: usageCount });
      await writeConversation(env, tenant, event, userText, MONTHLY_LIMITED_REPLY, "rate_limited");
      continue;
    }

    // Cloudflare OAuth：回覆前確保 access token 還有效；續期失敗且無可用 token → 同樣回固定話術
    const fresh = await ensureFreshCfToken(env, tenant, { now: Math.floor(now / 1000), fetchImpl });
    if (!fresh.ok) {
      await safeReply(env, tenant, event, NO_MODEL_REPLY, fetchImpl);
      await writeAudit(env, tenant, "model_not_configured", { userId, reason: fresh.reason });
      await writeConversation(env, tenant, event, userText, NO_MODEL_REPLY, "handoff");
      continue;
    }

    const faqs = await getFaqs(env, tenant);
    const prompt = buildPrompt({ tenant, faqs, history, userText });
    const result = await chatWithFailover(await resolveProviders(env, tenant, fetchImpl, fresh.accessToken), prompt);

    if (result.providerFailed) {
      await writeAudit(env, tenant, "all_providers_failed", { userText });
    } else {
      // 模型真的回覆成功才計費 +1
      await incrementUsage(env, tenant, month);
    }

    const status = classifyOutcome(result.text, userText);
    await safeReply(env, tenant, event, result.text, fetchImpl);
    await writeConversation(env, tenant, event, userText, result.text, status);
  }
  return { handled };
}
