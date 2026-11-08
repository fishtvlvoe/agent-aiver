import { verifyLineSignature } from "./lib/line-signature.js";
import { handleLineEvents } from "./reply.js";
import { unwrapSecret, resolveMasterPassword } from "./lib/crypto.js";
import { getTenantBySlug, markSecretVerified } from "./lib/store.js";

// 解析 tenant 的 LINE secret：D1 wrapped(enc) 優先，其次 per-tenant env，fallback 全域 LINE_CHANNEL_SECRET
export async function resolveTenantSecret(env, tenant) {
  if (tenant.line_secret_enc) {
    const password = resolveMasterPassword(env);
    return await unwrapSecret(password, tenant.line_secret_enc);
  }
  return env[`LINE_SECRET_${tenant.slug}`] ?? env.LINE_CHANNEL_SECRET ?? null;
}

// POST /webhook/:tenantSlug —— LINE webhook 入口
export async function handleWebhook(request, env, slug, ctx) {
  const tenant = await getTenantBySlug(env, slug);
  if (!tenant) return new Response("tenant not found", { status: 404 });
  // 9.4 中台停用後 webhook 拒收
  if (tenant.status === "disabled") return new Response("tenant disabled", { status: 403 });

  // 必須用原始 body 驗簽，之後才 parse JSON
  const body = await request.text();
  const signature = request.headers.get("x-line-signature");
  const secret = await resolveTenantSecret(env, tenant);
  if (!secret || !(await verifyLineSignature(secret, body, signature))) {
    // 401：零副作用，不寫任何資料
    return new Response("invalid signature", { status: 401 });
  }

  if (!tenant.line_secret_verified_at) await markSecretVerified(env, tenant);

  const events = JSON.parse(body).events ?? [];
  // 有 ctx 時先回 200、背景處理，避免 AI 呼叫拖慢導致 LINE 端中斷請求
  if (ctx?.waitUntil) {
    ctx.waitUntil(handleLineEvents(env, tenant, events).catch((err) => console.error("[webhook] background failed", err?.message)));
    return Response.json({ ok: true, queued: true });
  }
  const result = await handleLineEvents(env, tenant, events);
  return Response.json({ ok: true, ...result });
}
