import { requireStore } from "../lib/guard.js";
import { resolveTenantToken } from "../lib/tenant-token.js";

// LINE API 小包裝：失敗回 null（降級），整體仍 200（問題 12）
async function lineGet(path, token, fetchImpl) {
  try {
    const res = await fetchImpl(`https://api.line.me${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// GET /api/line-settings/:slug —— LINE OA 產品設定唯讀總覽
export async function handleLineSettings(request, env, slug, fetchImpl = fetch) {
  const { response } = await requireStore(env, request, slug);
  if (response) return response;

  const tenant = await env.DB.prepare("SELECT * FROM tenants WHERE slug = ?").bind(slug).first();
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  const token = await resolveTenantToken(env, tenant);

  const webhookInfo = token ? await lineGet("/v2/bot/info/webhook", token, fetchImpl) : null;
  const greeting = token ? await lineGet("/v2/bot/chat/setting/greeting", token, fetchImpl) : null;
  const richmenuList = token ? await lineGet("/v2/bot/richmenu/list", token, fetchImpl) : null;

  return Response.json({
    webhookUrl: `/webhook/${slug}`, // 我們產生的目標網址（相對路徑，前端補 origin）
    lineWebhookUrl: webhookInfo?.endpoint ?? null,
    webhookActive: webhookInfo?.active ?? null,
    greeting: greeting?.enabled ?? null, // true/false/null
    richmenus: Array.isArray(richmenuList?.richmenus)
      ? richmenuList.richmenus.map((m) => ({ name: m.name, richMenuId: m.richMenuId, size: m.size }))
      : null, // null 代表連線異常；[] 代表尚未設定
  });
}

// POST /api/line-settings/:slug/apply-webhook —— 一鍵把 LINE webhook 設成我們的網址
export async function handleApplyWebhook(request, env, slug, fetchImpl = fetch) {
  const { response } = await requireStore(env, request, slug);
  if (response) return response;

  const tenant = await env.DB.prepare("SELECT * FROM tenants WHERE slug = ?").bind(slug).first();
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });
  const token = await resolveTenantToken(env, tenant);
  if (!token) return Response.json({ error: "LINE token not configured" }, { status: 400 });

  // 依 request origin 產生完整 webhook 網址；無法判斷時退回相對路徑
  const origin = new URL(request.url).origin;
  const endpoint = `${origin}/webhook/${slug}`;
  const res = await fetchImpl("https://api.line.me/v2/bot/channel/webhook/endpoint", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!res.ok) return Response.json({ error: "LINE 連線異常，請確認金鑰後再試" }, { status: 502 });
  return Response.json({ ok: true, endpoint });
}
