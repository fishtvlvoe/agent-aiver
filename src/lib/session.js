// LINE Login session：簽發/驗證，存 KV key sess:<token>，7 天過期
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

export async function createSession(kv, { role, tenantId = null, slug = null, userId, name, impersonatedBy = null }) {
  const token = crypto.randomUUID();
  const sess = { role, tenantId, slug, userId, name, impersonatedBy, exp: Date.now() + SESSION_TTL_SEC * 1000 };
  await kv.put(`sess:${token}`, JSON.stringify(sess), { expirationTtl: SESSION_TTL_SEC });
  return { token, ...sess };
}

// 無效或過期回 null
export async function getSession(kv, token) {
  if (!kv || !token) return null;
  const sess = await kv.get(`sess:${token}`, "json");
  if (!sess || sess.exp < Date.now()) return null;
  return sess;
}
