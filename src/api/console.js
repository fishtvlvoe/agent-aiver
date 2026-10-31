import { requireAdmin } from "../lib/guard.js";
import { monthKeyTW, MONTHLY_LIMIT } from "../lib/month.js";

// 平台預設模型設定：KV key，只存 baseUrl+model（平台 key 繼續用 env OPENAI_API_KEY）
const PLATFORM_MODEL_KEY = "platform:model_settings";

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

  // 平台預設模型設定（GET/PUT）；PUT 先驗證 baseUrl 可達
  if (path === "/api/console/model-settings") {
    if (request.method === "GET") {
      const raw = await env.FORM_STATE.get(PLATFORM_MODEL_KEY, "json");
      return Response.json({ baseUrl: raw?.baseUrl ?? null, model: raw?.model ?? null });
    }
    if (request.method === "PUT") {
      const body = await request.json().catch(() => ({}));
      const { baseUrl, model } = body ?? {};
      if (!baseUrl || !model) return Response.json({ error: "invalid body" }, { status: 400 });
      if (!env.OPENAI_API_KEY) return Response.json({ error: "platform key not configured" }, { status: 500 });
      let probe;
      try {
        probe = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
          headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
        });
      } catch {
        return Response.json({ error: "baseUrl 驗證失敗，請確認後重試" }, { status: 400 });
      }
      if (!probe.ok) return Response.json({ error: "baseUrl 驗證失敗，請確認後重試" }, { status: 400 });
      await env.FORM_STATE.put(PLATFORM_MODEL_KEY, JSON.stringify({ baseUrl, model }));
      return Response.json({ ok: true, baseUrl, model });
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
