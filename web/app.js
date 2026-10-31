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
export async function api(path, { method = "GET", body } = {}) {
  const token = sessionStorage.getItem("sess_token");
  const res = await fetch(path, {
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
  const res = await fetch("/api/config");
  const data = await res.json().catch(() => ({}));
  return data.liffId ?? null;
}

// 登入流程（admin.html / console.html 共用）：
// liff.init → idToken → POST /api/auth/liff → sessionStorage；LIFF 外回 false
export async function loginWithLiff(liffId, { requiredRole } = {}) {
  if (!liffId || typeof liff === "undefined") return { ok: false, reason: "no-liff" };
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) {
    liff.login();
    return { ok: false, reason: "redirecting" };
  }
  const idToken = liff.getIDToken();
  const res = await fetch("/api/auth/liff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return { ok: false, reason: "auth-failed", status: res.status };
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
