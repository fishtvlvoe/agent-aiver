// LINE webhook 簽名驗證：HMAC-SHA256(secret, body) 後 base64，與 X-Line-Signature 比對
export async function verifyLineSignature(secret, body, signature) {
  if (!secret || !signature) return false;
  const data = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, data);
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  // 常數時間比對，避免時序旁路
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// 測試與腳本共用：算出合法的 X-Line-Signature
export async function signLineBody(secret, body) {
  const data = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}
