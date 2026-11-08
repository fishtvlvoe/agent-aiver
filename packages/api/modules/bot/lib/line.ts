const LINE_BOT_INFO_URL = "https://api.line.me/v2/bot/info";

// 用 accessToken 向 LINE 驗證，只有 2xx 才算有效
export async function isLineAccessTokenValid(accessToken: string) {
	const response = await fetch(LINE_BOT_INFO_URL, {
		headers: { authorization: `Bearer ${accessToken}` },
	});

	return response.ok;
}
