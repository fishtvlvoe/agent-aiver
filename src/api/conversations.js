import { requireStore } from "../lib/guard.js";

const ALLOWED_STATUS = ["resolved", "handoff", "missed", "rate_limited"];

// GET /api/conversations/:tenantSlug?status=resolved|handoff|missed|rate_limited|all（預設 all）
// 依建立時間倒序，最多 100 筆
export async function handleConversations(request, env, slug, url = new URL(request.url)) {
  const { response } = await requireStore(env, request, slug);
  if (response) return response;

  const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(slug).first();
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  const status = url.searchParams.get("status") ?? "all";
  let sql =
    "SELECT id, user_id, user_text, ai_text, status, created_at FROM conversations WHERE tenant_id = ?";
  const args = [tenant.id];
  if (status !== "all") {
    if (!ALLOWED_STATUS.includes(status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    sql += " AND status = ?";
    args.push(status);
  }
  sql += " ORDER BY created_at DESC LIMIT 100";

  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return Response.json({ conversations: results ?? [] });
}
