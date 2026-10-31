import { createSession, getSession } from "../lib/session.js";
import { getBearerToken } from "../lib/guard.js";

// POST /api/auth/liff —— LIFF idToken 換 session token
// TODO: 瀏覽器 OAuth redirect 流程第一版略過，以 LIFF 為主
export async function handleLiff(request, env, fetchImpl = fetch) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { idToken } = body ?? {};
  if (!idToken) return Response.json({ error: "invalid body" }, { status: 400 });
  const clientId = env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId) return Response.json({ error: "LINE login channel not configured" }, { status: 500 });

  // 向 LINE 驗證 idToken，拿 sub（userId）與 name
  const url = `https://api.line.me/oauth2/v2.1/verify?client_id=${encodeURIComponent(clientId)}&id_token=${encodeURIComponent(idToken)}`;
  const lineRes = await fetchImpl(url);
  if (!lineRes.ok) return Response.json({ error: "invalid idToken" }, { status: 401 });
  const data = await lineRes.json();
  const userId = data.sub;
  const name = data.name ?? null;
  if (!userId) return Response.json({ error: "invalid idToken" }, { status: 401 });

  // 判斷身分：platform_admins → admin；tenants.admin_line_user_id → store；皆無 → 403
  const admin = await env.DB.prepare("SELECT line_user_id FROM platform_admins WHERE line_user_id = ?").bind(userId).first();
  let role, tenantId = null, tenantSlug = null;
  if (admin) {
    role = "admin";
  } else {
    const tenant = await env.DB.prepare("SELECT id, slug FROM tenants WHERE admin_line_user_id = ?").bind(userId).first();
    if (!tenant) return Response.json({ error: "no tenant for this user" }, { status: 403 });
    role = "store";
    tenantId = tenant.id;
    tenantSlug = tenant.slug;
  }

  const sess = await createSession(env.FORM_STATE, { role, tenantId, slug: tenantSlug, userId, name });
  return Response.json({ token: sess.token, role });
}

// GET /api/auth/me —— Bearer session 回目前身分
export async function handleMe(request, env) {
  const session = await getSession(env.FORM_STATE, getBearerToken(request));
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({
    role: session.role,
    tenantId: session.tenantId,
    slug: session.slug ?? null,
    userId: session.userId,
    name: session.name,
  });
}
