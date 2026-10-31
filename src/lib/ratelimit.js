// 速率限制：60 秒滑動窗口內同一 tenant+user 最多 3 次 AI 回覆
export const RATE_WINDOW_MS = 60_000;
export const RATE_MAX = 3;

// 純函式：修剪過期時間戳後判斷是否允許
export function pruneAndCheck(timestamps, now, windowMs = RATE_WINDOW_MS, max = RATE_MAX) {
  const cutoff = now - windowMs;
  const recent = (timestamps ?? []).filter((t) => t > cutoff);
  return { allowed: recent.length < max, timestamps: recent };
}

// KV 實作：key = rl:<tenantId>:<userId>，存時間戳陣列（JSON）
export async function checkRateLimit(kv, tenantId, userId, now = Date.now()) {
  const key = `rl:${tenantId}:${userId}`;
  const raw = await kv.get(key, "json");
  const { allowed, timestamps } = pruneAndCheck(raw ?? [], now);
  if (!allowed) return { allowed: false };
  await kv.put(key, JSON.stringify([...timestamps, now]));
  return { allowed: true };
}
