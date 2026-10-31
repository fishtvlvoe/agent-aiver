import { requireAdmin } from "../lib/guard.js";
import { monthKeyTW } from "../lib/month.js";

// /api/console/* —— 平台管理員中台 API
export async function handleConsole(request, env) {
  const { response } = await requireAdmin(env, request);
  if (response) return response;

  const url = new URL(request.url);
  const path = url.pathname;

  // 9.4 租戶列表：含本月 AI 回覆次數（usage_counters 子查詢）
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

  // 9.4 停用/啟用切換（webhook 對 disabled 租戶回 403）
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

  // 9.4 總覽 KPI
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
