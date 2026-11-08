import { ORPCError } from "@orpc/server";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// 遮罩：•••• + 末四碼，畫面與回應只會看到這個
export function maskSecret(plain: string) {
	return `••••${plain.slice(-4)}`;
}

async function getAesKey() {
	const secret = process.env.CREDENTIAL_ENC_KEY;

	if (!secret) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "CREDENTIAL_ENC_KEY is not configured",
		});
	}

	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
		"encrypt",
		"decrypt",
	]);
}

// 回傳 base64(iv + cipher)，格式與舊 Worker 的 wrapSecret 相同
export async function encryptSecret(plaintext: string) {
	const key = await getAesKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		encoder.encode(plaintext),
	);
	const bytes = new Uint8Array([...iv, ...new Uint8Array(cipher)]);
	return btoa(String.fromCharCode(...bytes));
}

export async function decryptSecret(encrypted: string) {
	const bytes = Uint8Array.from(atob(encrypted), (char) => char.charCodeAt(0));
	const key = await getAesKey();
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: bytes.slice(0, 12) },
		key,
		bytes.slice(12),
	);
	return decoder.decode(plain);
}
