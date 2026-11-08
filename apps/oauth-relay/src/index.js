// 授權跳板：Cloudflare 授權完固定回到這裡，驗證 state 後只轉往 state 內簽章綁定的 returnUrl。
// 不碰 token（PKCE verifier 只存在各店家站的 cookie）。
const encoder = new TextEncoder();

function fromBase64url(value) {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function verifyState(state, key, now) {
	const parts = state.split(".");
	if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
	try {
		const hmac = await crypto.subtle.importKey(
			"raw",
			encoder.encode(key),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"],
		);
		const ok = await crypto.subtle.verify("HMAC", hmac, fromBase64url(parts[1]), encoder.encode(parts[0]));
		if (!ok) return null;
		const payload = JSON.parse(new TextDecoder().decode(fromBase64url(parts[0])));
		if (typeof payload.exp !== "number" || payload.exp < now) return null;
		const target = new URL(payload.returnUrl);
		if (target.protocol !== "https:" && target.hostname !== "localhost") return null;
		return target;
	} catch {
		return null;
	}
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname !== "/oauth/cf/callback") return new Response("Not found", { status: 404 });
		const target = await verifyState(
			url.searchParams.get("state") ?? "",
			env.CF_OAUTH_STATE_KEY ?? "",
			Math.floor(Date.now() / 1000),
		);
		if (!target) return new Response("授權連結無效或已過期，請回到店家設定頁重新連結", { status: 400 });
		for (const name of ["code", "state", "error"]) {
			const value = url.searchParams.get(name);
			if (value) target.searchParams.set(name, value);
		}
		return Response.redirect(target.toString(), 302);
	},
};
