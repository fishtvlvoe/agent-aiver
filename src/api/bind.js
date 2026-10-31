import { wrapSecret, maskSecret, resolveMasterPassword } from "../lib/crypto.js";

// POST /api/bind/:tenantSlug —— 店家貼金鑰自助綁定
// 流程：accessToken 打 LINE bot/info 驗證 → 通過才寫 D1（enc + mask，明文永不入庫）
export async function handleBind(request, env, slug, fetchImpl = fetch) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { channelSecret, accessToken } = body ?? {};
  if (!channelSecret || !accessToken) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  // 用 accessToken 向 LINE 驗證；失敗回 401 且狀態不變
  const lineRes = await fetchImpl("https://api.line.me/v2/bot/info", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!lineRes.ok) {
    return Response.json({ error: "金鑰無效，請確認後重試" }, { status: 401 });
  }

  const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(slug).first();
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  const password = resolveMasterPassword(env);
  if (!password) return Response.json({ error: "master key not configured" }, { status: 500 });

  // 7.3 重複綁定：覆寫 enc 與 mask
  await env.DB.prepare(
    "UPDATE tenants SET line_secret_enc = ?, line_token_enc = ?, line_secret_mask = ?, line_token_mask = ?, status = 'bound' WHERE id = ?",
  )
    .bind(
      await wrapSecret(password, channelSecret),
      await wrapSecret(password, accessToken),
      maskSecret(channelSecret),
      maskSecret(accessToken),
      tenant.id,
    )
    .run();

  return Response.json({
    ok: true,
    webhookUrl: `/webhook/${slug}`,
    maskedSecret: maskSecret(channelSecret),
    maskedToken: maskSecret(accessToken),
  });
}
