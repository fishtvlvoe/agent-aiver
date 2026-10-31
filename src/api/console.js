import { requireAdmin, getBearerToken } from "../lib/guard.js";
import { createSession, getSession } from "../lib/session.js";
import { monthKeyTW, MONTHLY_LIMIT } from "../lib/month.js";
import { wrapSecret, unwrapSecret, maskSecret, resolveMasterPassword } from "../lib/crypto.js";
import { PROVIDERS, resolveProviderBaseUrl, inferProviderFromBaseUrl, probeProvider } from "../lib/providers-catalog.js";

// 平台預設模型設定：KV key，多組 failover 鍊（apiKeyEnc 為 wrapped，永不回傳明文）
const PLATFORM_MODEL_KEY = "platform:model_settings";

// 向後相容：舊單組 {baseUrl, model} → 陣列（provider 由 baseUrl 反推）
function normalizePlatformGroups(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && raw.baseUrl && raw.model) {
    return [{ provider: inferProviderFromBaseUrl(raw.baseUrl), model: raw.model }];
  }
  return [];
}

// /api/console/* —— 平台管理員中台 API
export async function handleConsole(request, env) {
  const { response } = await requireAdmin(env, request);
  if (response) return response;

  const url = new URL(request.url);
  const path = url.pathname;

  // 租戶列表：含本月 AI 回覆次數（usage_counters 子查詢）
  if (path === "/api/console/tenants" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT t.slug, t.name, t.status,
              (SELECT count FROM usage_counters u WHERE u.tenant_id = t.id AND u.month = ?) AS month_count
       FROM tenants t ORDER BY t.created_at DESC`,
    )
      .bind(monthKeyTW(new Date()))
      .all();
    return Response.json({ tenants: results ?? [] });
  }


  // 管理員一鍵進入店家：簽發 impersonated store session（supastarter impersonatedBy 模式）
  const impersonate = path.match(/^\/api\/console\/tenants\/([^/]+)\/impersonate$/);
  if (impersonate && request.method === "POST") {
    const session = await getSession(env.FORM_STATE, getBearerToken(request));
    const tenant = await env.DB.prepare("SELECT id, slug FROM tenants WHERE slug = ?")
      .bind(decodeURIComponent(impersonate[1]))
      .first();
    if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });
    const sess = await createSession(env.FORM_STATE, {
      role: "store", tenantId: tenant.id, slug: tenant.slug,
      userId: session.userId, name: session.name, impersonatedBy: session.userId,
    });
    return Response.json({ token: sess.token, slug: tenant.slug });
  }

  // 開通店家管理員：UPDATE tenants.admin_line_user_id
  const adminPatch = path.match(/^\/api\/console\/tenants\/([^/]+)\/admin$/);
  if (adminPatch && request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    const { lineUserId } = body ?? {};
    if (!lineUserId) return Response.json({ error: "invalid body" }, { status: 400 });
    const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?")
      .bind(decodeURIComponent(adminPatch[1]))
      .first();
    if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });
    await env.DB.prepare("UPDATE tenants SET admin_line_user_id = ? WHERE id = ?").bind(lineUserId, tenant.id).run();
    return Response.json({ ok: true });
  }

  // 停用/啟用切換（webhook 對 disabled 租戶回 403）
  const toggle = path.match(/^\/api\/console\/tenants\/([^/]+)\/toggle$/);
  if (toggle && request.method === "POST") {
    const tenant = await env.DB.prepare("SELECT id, status FROM tenants WHERE slug = ?")
      .bind(decodeURIComponent(toggle[1]))
      .first();
    if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });
    const next = tenant.status === "disabled" ? "active" : "disabled";
    await env.DB.prepare("UPDATE tenants SET status = ? WHERE id = ?").bind(next, tenant.id).run();
    return Response.json({ ok: true, status: next });
  }

  // 平台預設模型設定（GET/PUT，問題 13 改多組 failover 鍊）：
  // KV 存 [{provider, model, apiKeyEnc, apiKeyMask}]，第一組是預設；向後相容舊單組 {baseUrl, model}
  if (path === "/api/console/model-settings") {
    if (request.method === "GET") {
      const raw = await env.FORM_STATE.get(PLATFORM_MODEL_KEY, "json");
      const groups = normalizePlatformGroups(raw);
      return Response.json({
        groups: groups.map(({ apiKeyEnc, ...rest }) => rest), // 不回傳 enc
      });
    }
    if (request.method === "PUT") {
      const body = await request.json().catch(() => ({}));
      const incoming = body?.groups;
      if (!Array.isArray(incoming) || incoming.length === 0) {
        return Response.json({ error: "invalid body（至少一組）" }, { status: 400 });
      }
      const password = resolveMasterPassword(env);
      if (!password) return Response.json({ error: "master key not configured" }, { status: 500 });
      const previous = normalizePlatformGroups(await env.FORM_STATE.get(PLATFORM_MODEL_KEY, "json"));
      const next = [];
      for (const g of incoming) {
        const { provider, model, apiKey } = g ?? {};
        if (!provider || !PROVIDERS[provider] || !model) {
          return Response.json({ error: "invalid group" }, { status: 400 });
        }
        const baseUrl = resolveProviderBaseUrl(provider, g.baseUrl, env);
        if (!baseUrl) return Response.json({ error: "invalid baseUrl" }, { status: 400 });
        // key：新 key 或沿用舊組（provider+model 相同）的 enc
        let effectiveKey = apiKey;
        let reused = null;
        if (!effectiveKey) {
          reused = previous.find((p) => p.provider === provider && p.model === model && p.apiKeyEnc);
          if (!reused) return Response.json({ error: "invalid body（缺少 API key）" }, { status: 400 });
          effectiveKey = await unwrapSecret(password, reused.apiKeyEnc);
        }
        // 每組儲存前都驗證（失敗整批不寫入）
        if (!(await probeProvider(baseUrl, effectiveKey))) {
          return Response.json({ error: `金鑰無效，請確認後重試（${PROVIDERS[provider].label}）` }, { status: 400 });
        }
        next.push({
          provider,
          model,
          apiKeyEnc: reused?.apiKeyEnc ?? (await wrapSecret(password, effectiveKey)),
          apiKeyMask: reused?.apiKeyMask ?? maskSecret(effectiveKey),
        });
      }
      await env.FORM_STATE.put(PLATFORM_MODEL_KEY, JSON.stringify(next));
      return Response.json({
        ok: true,
        groups: next.map(({ apiKeyEnc, ...rest }) => rest),
      });
    }
  }

  // 各店本月用量（JOIN tenants）
  if (path === "/api/console/usage" && request.method === "GET") {
    const month = monthKeyTW(new Date());
    const { results } = await env.DB.prepare(
      `SELECT t.slug, t.name, COALESCE(u.count, 0) AS count
       FROM tenants t
       LEFT JOIN usage_counters u ON u.tenant_id = t.id AND u.month = ?
       ORDER BY count DESC`,
    )
      .bind(month)
      .all();
    return Response.json({
      month,
      limit: MONTHLY_LIMIT,
      tenants: (results ?? []).map((r) => ({ slug: r.slug, name: r.name, count: r.count, limit: MONTHLY_LIMIT })),
    });
  }

  // 總覽 KPI
  if (path === "/api/console/overview" && request.method === "GET") {
    const month = monthKeyTW(new Date());
    const tenants = await env.DB.prepare("SELECT COUNT(*) AS c FROM tenants").bind().first();
    const usage = await env.DB.prepare("SELECT COALESCE(SUM(count), 0) AS s FROM usage_counters WHERE month = ?").bind(month).first();
    // created_at 為 ISO 字串，substr 前 7 字為 'YYYY-MM'（UTC；與月上限同基準）
    const handoffs = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM conversations WHERE status = 'handoff' AND substr(created_at, 1, 7) = ?",
    )
      .bind(month)
      .first();
    return Response.json({
      month,
      tenantCount: tenants?.c ?? 0,
      monthAiReplies: usage?.s ?? 0,
      pendingHandoffs: handoffs?.c ?? 0,
    });
  }

  return Response.json({ ok: true, note: "console API placeholder" });
}
