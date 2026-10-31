import { requireStore } from "../lib/guard.js";
import { wrapSecret, maskSecret, resolveMasterPassword } from "../lib/crypto.js";
import { PROVIDERS, resolveProviderBaseUrl, inferProviderFromBaseUrl, probeProvider } from "../lib/providers-catalog.js";

// /api/model-settings/:tenantSlug —— 店家模型設定（platform / 單組 custom，provider 格式）
export async function handleModelSettings(request, env, slug, fetchImpl = fetch) {
  const { response } = await requireStore(env, request, slug);
  if (response) return response;

  const tenant = await env.DB.prepare(
    "SELECT id, model_mode, model_provider, model_base_url, model_name, model_key_mask FROM tenants WHERE slug = ?",
  )
    .bind(slug)
    .first();
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  if (request.method === "GET") {
    const provider = tenant.model_provider ?? inferProviderFromBaseUrl(tenant.model_base_url);
    return Response.json({
      mode: tenant.model_mode ?? "platform",
      provider,
      baseUrl: tenant.model_base_url ?? null, // custom 才有意義；其餘由 provider 解析
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
        "UPDATE tenants SET model_mode = 'platform', model_provider = NULL, model_base_url = NULL, model_name = NULL, model_key_enc = NULL, model_key_mask = NULL WHERE id = ?",
      )
        .bind(tenant.id)
        .run();
      return Response.json({ ok: true, mode: "platform", provider: null, baseUrl: null, model: null, apiKeyMask: null });
    }

    if (mode !== "custom") return Response.json({ error: "invalid mode" }, { status: 400 });
    const { provider, model, apiKey } = body;
    if (!provider || !PROVIDERS[provider]) return Response.json({ error: "invalid provider" }, { status: 400 });
    if (!model) return Response.json({ error: "invalid body" }, { status: 400 });

    const baseUrl = resolveProviderBaseUrl(provider, body.baseUrl, env);
    if (!baseUrl) return Response.json({ error: "invalid baseUrl" }, { status: 400 });

    // 儲存前用該供應商 /models 驗證 key；沿用舊 key（留空不修改）時解密驗證
    const password = resolveMasterPassword(env);
    if (!password) return Response.json({ error: "master key not configured" }, { status: 500 });
    let effectiveKey = apiKey;
    if (!effectiveKey) {
      const row = await env.DB.prepare("SELECT model_key_enc FROM tenants WHERE id = ?").bind(tenant.id).first();
      if (!row?.model_key_enc) return Response.json({ error: "invalid body" }, { status: 400 });
      const { unwrapSecret } = await import("../lib/crypto.js");
      effectiveKey = await unwrapSecret(password, row.model_key_enc);
    }
    if (!(await probeProvider(baseUrl, effectiveKey, fetchImpl))) {
      return Response.json({ error: "金鑰無效，請確認後重試" }, { status: 400 });
    }

    await env.DB.prepare(
      "UPDATE tenants SET model_mode = 'custom', model_provider = ?, model_base_url = ?, model_name = ?, model_key_enc = ?, model_key_mask = ? WHERE id = ?",
    )
      .bind(
        provider,
        provider === "custom" ? baseUrl : null, // 非 custom 不存 baseUrl（由 provider 解析）
        model,
        await wrapSecret(password, effectiveKey),
        maskSecret(effectiveKey),
        tenant.id,
      )
      .run();
    return Response.json({ ok: true, mode: "custom", provider, baseUrl, model, apiKeyMask: maskSecret(effectiveKey) });
  }

  return Response.json({ error: "method not allowed" }, { status: 405 });
}
