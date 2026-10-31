// 全站共用前端工具：API 呼叫（Bearer session）、toast、格式化
// 注意：fmtMoney/fmtDate/fmtTime 與 src/lib/format.js 保持一致（那邊有單元測試）

export function fmtMoney(n) {
  const num = Math.round(Number(n) || 0);
  return `NT$${num.toLocaleString("en-US")}`;
}

export function fmtDate(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtTime(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// API 呼叫：自動帶 Bearer session token，非 2xx 拋出含 body 的 Error
// 同源（workers.dev 部署或 localhost 開發）直接用相對路徑；其餘（Pages 靜態）導向 API worker
const API_BASE =
  location.hostname.includes("workers.dev") || ["localhost", "127.0.0.1"].includes(location.hostname)
    ? ""
    : "https://line-ai-saas.fishandy1213.workers.dev";

export async function api(path, { method = "GET", body } = {}) {
  const token = sessionStorage.getItem("sess_token");
  const res = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// 綠 toast「已儲存」1.5 秒（10.6）
export function toast(message = "已儲存") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.querySelector("span").textContent = message;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1500);
}

// 表單錯誤：紅字提示，內容保留（10.6）
export function showFieldError(inputId, message) {
  const field = document.getElementById(inputId)?.closest(".field");
  if (!field) return;
  field.classList.add("has-error");
  const err = field.querySelector(".error-text");
  if (err) err.textContent = message;
}

export function clearFieldErrors(scope = document) {
  scope.querySelectorAll(".field.has-error").forEach((f) => f.classList.remove("has-error"));
}

export function toggleDrawer(open) {
  document.getElementById("drawer")?.classList.toggle("open", open);
}

// 取得 LIFF ID（後端 /api/config，只回公開設定）
export async function getLiffId() {
  const res = await fetch(API_BASE + "/api/config");
  const data = await res.json().catch(() => ({}));
  return data.liffId ?? null;
}

// 登入流程（admin.html / console.html 共用）：
// liff.init → idToken → POST /api/auth/liff → sessionStorage；LIFF 外回 false
// 已有 session（重新整理/新分頁）先驗證沿用，不必每次都走 LIFF
export async function loginWithLiff(liffId, { requiredRole } = {}) {
  const existing = sessionStorage.getItem("sess_token");
  if (existing) {
    try {
      const me = await api("/api/auth/me");
      if (!requiredRole || me.role === requiredRole) return { ok: true, role: me.role, me };
      return { ok: false, reason: "wrong-role", role: me.role };
    } catch {
      sessionStorage.removeItem("sess_token");
    }
  }
  if (!liffId || typeof liff === "undefined") return { ok: false, reason: "no-liff" };
  // withLoginOnExternalBrowser：電腦瀏覽器也能走 LINE 登入（授權後帶 token 跳回）
  await liff.init({ liffId, withLoginOnExternalBrowser: true });
  if (!liff.isLoggedIn()) {
    // LIFF 外（電腦瀏覽器）：整頁導向 LINE 授權，回來後 URL fragment 由 liff.init 消化
    const redirectUri = location.href.split("#")[0];
    liff.login({ redirectUri });
    return { ok: false, reason: "redirecting" };
  }
  const idToken = liff.getIDToken();
  const res = await fetch(API_BASE + "/api/auth/liff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    let userId = null;
    try { userId = (await liff.getProfile()).userId; } catch { /* 忽略 */ }
    return { ok: false, reason: "auth-failed", status: res.status, userId };
  }
  const { token, role } = await res.json();
  sessionStorage.setItem("sess_token", token);
  if (requiredRole && role !== requiredRole) return { ok: false, reason: "wrong-role", role };
  const me = await api("/api/auth/me");
  return { ok: true, role, me };
}

// 待真人紅點（10.7）：抓 conversations?status=handoff 筆數更新所有 .handoff-count
export async function refreshHandoffBadge(slug) {
  try {
    const { conversations } = await api(`/api/conversations/${slug}?status=handoff`);
    const count = conversations.length;
    document.querySelectorAll(".handoff-count").forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
    });
  } catch {
    /* 徽章失敗不影響主流程 */
  }
}
