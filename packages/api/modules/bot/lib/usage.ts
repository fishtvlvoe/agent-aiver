// 每月 AI 回覆上限的平台預設值，沿用舊 Cloudflare-Worker-LINE/src/lib/month.js 的 MONTHLY_LIMIT
export const MONTHLY_REPLY_LIMIT = 5000;

// 店家有設定 monthlyLimit 就用店家的值，空值（null）回退平台預設
export function resolveMonthlyLimit(monthlyLimit: number | null | undefined) {
	return monthlyLimit ?? MONTHLY_REPLY_LIMIT;
}

// 月份鍵依台灣時區（UTC+8）產生 'YYYY-MM'，與舊 Worker 相同
export function getTaipeiMonthKey(date = new Date()) {
	const tw = new Date(date.getTime() + 8 * 60 * 60 * 1000);
	return tw.toISOString().slice(0, 7);
}
