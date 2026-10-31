import { monthKeyTW, MONTHLY_LIMIT } from "../lib/month.js";
import { requireStore } from "../lib/guard.js";

export { MONTHLY_LIMIT };

// GET /api/usage/:tenantSlug —— 需 session（store 限本戶、admin 全可）；取代早期 USAGE_API_TOKEN 簡易驗證
export async function handleUsage(request, env, slug) {
  const { response } = await requireStore(env, request, slug);
  if (response) return response;

  const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(slug).first();
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  const month = monthKeyTW(new Date());
  const row = await env.DB.prepare("SELECT count FROM usage_counters WHERE tenant_id = ? AND month = ?")
    .bind(tenant.id, month)
    .first();
  const count = row?.count ?? 0;
  return Response.json({ month, count, limit: MONTHLY_LIMIT, exceeded: count >= MONTHLY_LIMIT });
}
