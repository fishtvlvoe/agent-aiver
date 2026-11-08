// 金鑰保密：AES-GCM wrapped 存放。master key 取自 env.MASTER_KEY；
// 未設定時開發模式 fallback 用 env.LINE_CHANNEL_SECRET（⚠️ 僅開發用，正式務必設 MASTER_KEY）
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// 遮罩：•••• + 末四碼，任何身分只看得到這個
export function maskSecret(plain) {
  return `••••${String(plain).slice(-4)}`;
}

async function aesKey(password) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

// 包裝：回 base64(iv + cipher)
export async function wrapSecret(password, plaintext) {
  const key = await aesKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return b64([...iv, ...new Uint8Array(cipher)]);
}

// 解包：失敗（被竄改或 key 不對）會 throw
export async function unwrapSecret(password, wrapped) {
  const bytes = unb64(wrapped);
  const key = await aesKey(password);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return new TextDecoder().decode(plain);
}

// 解析 master key 密碼（開發 fallback 僅本機使用）
export function resolveMasterPassword(env) {
  return env.CREDENTIAL_ENC_KEY ?? env.MASTER_KEY ?? env.LINE_CHANNEL_SECRET ?? null;
}
