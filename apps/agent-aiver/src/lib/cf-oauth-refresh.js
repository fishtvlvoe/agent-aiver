// Cloudflare OAuth access token 續期：店家按「授權」後，access token 約 1 小時失效，這裡負責在回覆前換新。
// 只有 token endpoint 回 invalid_grant 才把狀態改成 invalid；其餘錯誤（5xx、429、逾時、網路）視為暫時性，不改狀態。
import { unwrapSecret, wrapSecret, resolveMasterPassword } from "./crypto.js";
import { writeAudit } from "./store.js";

const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CLIENT_ID = "4945fa51a38ffdc8a49fbe6af858f1c1";
const FRESH_MARGIN_SEC = 120;
const LOCK_SEC = 15;
const TOKEN_TIMEOUT_MS = 3000;
const WAIT_MS = 500;
const WAIT_RETRIES = 3;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 回傳 { ok: true, accessToken? } 或 { ok: false, reason: 'invalid' | 'transient' }
// accessToken 缺席代表店家不是 OAuth 連結（手動路徑），呼叫端照舊用 modelKeyEnc
export async function ensureFreshCfToken(env, tenant, { now = Math.floor(Date.now() / 1000), fetchImpl = fetch, sleep = defaultSleep } = {}) {
  if (tenant.cf_oauth_status === "invalid") return { ok: false, reason: "invalid" };
  if (tenant.cf_oauth_status !== "linked") return { ok: true };

  if (tenant.cf_access_expires_at - now > FRESH_MARGIN_SEC) {
    return { ok: true, accessToken: await unwrapCurrent(env, tenant.model_key_enc) };
  }

  const won = await acquireLock(env, tenant, now);
  if (!won) return await waitForOtherRefresh(env, tenant, now, sleep);

  let refreshed;
  try {
    refreshed = await requestRefresh(env, tenant, fetchImpl);
  } catch (err) {
    if (err.reason === "invalid") {
      await env.DB.prepare("UPDATE bot_store SET cfOauthStatus = 'invalid', cfRefreshingUntil = NULL WHERE organizationId = ?")
        .bind(tenant.id)
        .run();
      await writeAudit(env, tenant, "cf_oauth_invalid", { reason: "invalid_grant" });
      return { ok: false, reason: "invalid" };
    }
    return fallbackToOld(env, tenant, now);
  }

  const password = resolveMasterPassword(env);
  const encRefresh = await wrapSecret(password, refreshed.refreshToken);
  const encAccess = await wrapSecret(password, refreshed.accessToken);
  await env.DB.prepare(
    `UPDATE bot_store SET cfRefreshTokenEnc = ?, modelKeyEnc = ?, cfAccessExpiresAt = ?,
            cfOauthVersion = cfOauthVersion + 1, cfRefreshingUntil = NULL
     WHERE organizationId = ? AND cfOauthVersion = ?`,
  )
    .bind(encRefresh, encAccess, now + refreshed.expiresIn, tenant.id, tenant.cf_oauth_version)
    .run();
  return { ok: true, accessToken: refreshed.accessToken };
}

// 搶續期鎖：只有 version 沒被別人動過、且鎖已過期才會成功（changes === 1）
async function acquireLock(env, tenant, now) {
  const res = await env.DB.prepare(
    `UPDATE bot_store SET cfRefreshingUntil = ?
     WHERE organizationId = ? AND (cfRefreshingUntil IS NULL OR cfRefreshingUntil < ?) AND cfOauthVersion = ?`,
  )
    .bind(now + LOCK_SEC, tenant.id, now, tenant.cf_oauth_version)
    .run();
  return res?.meta?.changes === 1 || res?.changes === 1;
}

// 沒搶到鎖：等對方續期完成，最多重讀 3 次；讀到新版本就用新 token
async function waitForOtherRefresh(env, tenant, now, sleep) {
  for (let i = 0; i < WAIT_RETRIES; i++) {
    await sleep(WAIT_MS);
    const row = await readCfState(env, tenant.id);
    if (row?.status === "invalid") return { ok: false, reason: "invalid" };
    if (row && row.version !== tenant.cf_oauth_version && row.key) {
      return { ok: true, accessToken: await unwrapCurrent(env, row.key) };
    }
  }
  return fallbackToOld(env, tenant, now);
}

// 續期失敗（暫時性）：舊 token 還沒過期就繼續用，過期了才回 transient
async function fallbackToOld(env, tenant, now) {
  if (tenant.cf_access_expires_at > now) {
    return { ok: true, accessToken: await unwrapCurrent(env, tenant.model_key_enc) };
  }
  return { ok: false, reason: "transient" };
}

// 呼叫 token endpoint；invalid_grant 以 reason 'invalid' 丟出，其餘錯誤一律丟 transient
async function requestRefresh(env, tenant, fetchImpl) {
  const refreshToken = await unwrapSecret(resolveMasterPassword(env), tenant.cf_refresh_token_enc);
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: CLIENT_ID, refresh_token: refreshToken }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(`cf token http ${res.status}`), { reason: body.error === "invalid_grant" ? "invalid" : "transient" });
  }
  if (!body.access_token) throw Object.assign(new Error("cf token response missing access_token"), { reason: "transient" });
  return {
    accessToken: body.access_token,
    // Cloudflare 若輪替 refresh token 就存新的，沒給就沿用舊的
    refreshToken: body.refresh_token ?? refreshToken,
    expiresIn: body.expires_in ?? 3600,
  };
}

async function readCfState(env, organizationId) {
  const row = await env.DB.prepare(
    `SELECT cfOauthVersion AS version, cfOauthStatus AS status, modelKeyEnc AS key
     FROM bot_store WHERE organizationId = ?`,
  )
    .bind(organizationId)
    .first();
  return row ?? null;
}

async function unwrapCurrent(env, wrapped) {
  return await unwrapSecret(resolveMasterPassword(env), wrapped);
}
