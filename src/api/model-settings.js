import { requireStore } from "../lib/guard.js";
import { wrapSecret, maskSecret, resolveMasterPassword } from "../lib/crypto.js";

// /api/model-settings/:tenantSlug —— 店家自訂模型供應商（custom）或用平台預設（platform）
export async function handleModelSettings(request, env, slug, fetchImpl = fetch) {
  const { response } = await requireStore(env, request, slug);
  if (response) return response;

  const tenant = await env.DB.prepare(
    "SELECT id, model_mode, model_base_url, model_name, model_key_mask FROM tenants WHERE slug = ?",
  )
    .bind(slug)
    .first();
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  if (request.method === "GET") {
    return Response.json({
      mode: tenant.model_mode ?? "platform",
      baseUrl: tenant.model_base_url ?? null,
      model: tenant.model_name ?? null,
      apiKeyMask: tenant.model_key_mask ?? null,
    });
  }

  if (request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const { mode } = body;

    // 切回平台預設：清空 custom 欄位
    if (mode === "platform") {
      await env.DB.prepare(
        "UPDATE tenants SET model_mode = 'platform', model_base_url = NULL, model_name = NULL, model_key_enc = NULL, model_key_mask = NULL WHERE id = ?",
      )
        .bind(tenant.id)
        .run();
      return Response.json({ ok: true, mode: "platform", baseUrl: null, model: null, apiKeyMask: null });
    }

    if (mode !== "custom") return Response.json({ error: "invalid mode" }, { status: 400 });
    const { baseUrl, apiKey, model } = body;
    if (!baseUrl || !apiKey || !model) return Response.json({ error: "invalid body" }, { status: 400 });

    // 先用新 key 打 {baseUrl}/models 驗證，2xx 才算過；失敗不寫入
    const probe = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!probe.ok) {
      return Response.json({ error: "金鑰無效，請確認後重試" }, { status: 400 });
    }

    const password = resolveMasterPassword(env);
    if (!password) return Response.json({ error: "master key not configured" }, { status: 500 });
    await env.DB.prepare(
      "UPDATE tenants SET model_mode = 'custom', model_base_url = ?, model_name = ?, model_key_enc = ?, model_key_mask = ? WHERE id = ?",
    )
      .bind(baseUrl, model, await wrapSecret(password, apiKey), maskSecret(apiKey), tenant.id)
      .run();
    return Response.json({ ok: true, mode: "custom", baseUrl, model, apiKeyMask: maskSecret(apiKey) });
  }

  return Response.json({ error: "method not allowed" }, { status: 405 });
}
