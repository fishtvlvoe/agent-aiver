// 只允許自家前台來源跨站呼叫；其他來源不回 CORS 標頭，瀏覽器會擋下。
export const ALLOWED_ORIGINS = ["https://app.aiver.me", "https://agent-aiver.pages.dev"];

export function corsHeaders(request) {
	const origin = request.headers.get("Origin");
	if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
	return {
		"Access-Control-Allow-Origin": origin,
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}
