import { getSession } from "./session.js";

export function getBearerToken(request) {
  const h = request.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// 基礎 session 驗證：無 token 或無效/過期 → 401
export async function requireSession(env, request) {
  const token = getBearerToken(request);
  const session = await getSession(env.FORM_STATE, token);
  if (!session) return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  return { session };
}

// 店家身分：admin 全放行；store 只能存取自己的 tenant
export async function requireStore(env, request, slug) {
  const { session, response } = await requireSession(env, request);
  if (response) return { response };
  if (session.role === "admin") return { session };
  const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(slug).first();
  if (!tenant || tenant.id !== session.tenantId) {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { session };
}

// 平台管理員：只放行 admin
export async function requireAdmin(env, request) {
  const { session, response } = await requireSession(env, request);
  if (response) return { response };
  if (session.role !== "admin") {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { session };
}
