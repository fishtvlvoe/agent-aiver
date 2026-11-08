import { unwrapSecret, resolveMasterPassword } from "./crypto.js";

// 解析 tenant 的 LINE access token：D1 wrapped(enc) 優先，其次 per-tenant env，fallback 全域
// （reply.js 回覆與 line-settings 查詢 LINE 後台共用；問題 12 抽出共用）
export async function resolveTenantToken(env, tenant) {
  if (tenant.line_token_enc) {
    const password = resolveMasterPassword(env);
    return await unwrapSecret(password, tenant.line_token_enc);
  }
  return env[`LINE_TOKEN_${tenant.slug}`] ?? env.LINE_CHANNEL_ACCESS_TOKEN ?? null;
}
