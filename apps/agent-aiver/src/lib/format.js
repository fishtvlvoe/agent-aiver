// 全站共用格式化：金額（NT$ 千分位無小數）、日期（2026/10/31）、24h 時間
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
