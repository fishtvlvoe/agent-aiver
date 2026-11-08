// 機器人資料存取集中於此：新表結構（organization + bot_*，見 cf-wt-line-admin 的 drizzle 遷移）
// 回傳的 tenant 物件欄位沿用舊的 snake_case，讓 resolveTenantSecret/resolveTenantToken/prompt 等不用改

const nowSec = () => Math.floor(Date.now() / 1000);

// 店家（organization）+ 機器人設定（bot_store）；slug 找不到或尚無 bot_store 列 → null
export async function getTenantBySlug(env, slug) {
  return await env.DB.prepare(
    `SELECT o.id AS id, o.slug AS slug, o.name AS name,
            s.status AS status,
            s.lineSecretEnc AS line_secret_enc, s.lineTokenEnc AS line_token_enc,
            s.modelMode AS model_mode, s.modelBaseUrl AS model_base_url, s.modelName AS model_name,
            s.modelKeyEnc AS model_key_enc, s.modelProvider AS model_provider,
            s.modelAccountId AS model_account_id,
            s.monthlyLimit AS monthly_limit, s.lineSecretVerifiedAt AS line_secret_verified_at,
            s.usePlatformModel AS use_platform_model,
            s.cfRefreshTokenEnc AS cf_refresh_token_enc, s.cfAccessExpiresAt AS cf_access_expires_at,
            s.persona AS persona,
            s.cfOauthVersion AS cf_oauth_version, s.cfRefreshingUntil AS cf_refreshing_until,
            s.cfOauthStatus AS cf_oauth_status
     FROM organization o JOIN bot_store s ON s.organizationId = o.id
     WHERE o.slug = ?`,
  )
    .bind(slug)
    .first();
}

// 首次簽章驗證成功才寫入（已有值不覆蓋）
export async function markSecretVerified(env, tenant) {
  await env.DB.prepare(
    "UPDATE bot_store SET lineSecretVerifiedAt = ? WHERE organizationId = ? AND lineSecretVerifiedAt IS NULL",
  )
    .bind(nowSec(), tenant.id)
    .run();
}

export async function writeAudit(env, tenant, event, detail) {
  await env.DB.prepare(
    "INSERT INTO bot_audit_event (id, organizationId, event, detail, createdAt) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), tenant.id, event, JSON.stringify(detail ?? {}), nowSec())
    .run();
}

export async function writeConversation(env, tenant, event, userText, aiText, status) {
  await env.DB.prepare(
    "INSERT INTO bot_conversation (id, organizationId, userId, userText, aiText, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), tenant.id, event.source?.userId ?? null, userText, aiText, status, nowSec())
    .run();
}

// 當月已計費次數；無列 → 0
export async function getUsageCount(env, tenant, month) {
  const row = await env.DB.prepare("SELECT count FROM bot_usage_counter WHERE organizationId = ? AND month = ?")
    .bind(tenant.id, month)
    .first();
  return row?.count ?? 0;
}

export async function getFaqs(env, tenant) {
  const res = await env.DB.prepare("SELECT question, answer FROM bot_faq WHERE organizationId = ?")
    .bind(tenant.id)
    .all();
  return res.results ?? [];
}

// 模型真的回覆成功才呼叫；同月第一次插入 1，之後 +1
export async function incrementUsage(env, tenant, month) {
  await env.DB.prepare(
    "INSERT INTO bot_usage_counter (organizationId, month, count) VALUES (?, ?, 1) ON CONFLICT(organizationId, month) DO UPDATE SET count = count + 1",
  )
    .bind(tenant.id, month)
    .run();
}
