import assert from "node:assert/strict";
import test from "node:test";
import relay from "./src/index.js";

const KEY = "test-key";
const b64 = (buf) => Buffer.from(buf).toString("base64url");
async function sign(payload) {
	const body = b64(JSON.stringify(payload));
	const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	return `${body}.${b64(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)))}`;
}
const call = (qs) => relay.fetch(new Request(`https://opcos.me/oauth/cf/callback?${qs}`), { CF_OAUTH_STATE_KEY: KEY });
const future = () => Math.floor(Date.now() / 1000) + 300;

test("有效 state 轉往簽章內的 returnUrl 並帶 code", async () => {
	const state = await sign({ returnUrl: "https://shop.example.com/api/bot/cf-oauth/callback", exp: future() });
	const res = await call(`code=abc&state=${state}`);
	assert.equal(res.status, 302);
	const loc = new URL(res.headers.get("location"));
	assert.equal(loc.origin + loc.pathname, "https://shop.example.com/api/bot/cf-oauth/callback");
	assert.equal(loc.searchParams.get("code"), "abc");
});

test("竄改簽章被拒", async () => {
	const state = await sign({ returnUrl: "https://shop.example.com/x", exp: future() });
	assert.equal((await call(`code=a&state=${state}x`)).status, 400);
});

test("過期被拒", async () => {
	const state = await sign({ returnUrl: "https://shop.example.com/x", exp: 1 });
	assert.equal((await call(`code=a&state=${state}`)).status, 400);
});

test("query 內的轉址目標被忽略", async () => {
	const state = await sign({ returnUrl: "https://shop.example.com/x", exp: future() });
	const res = await call(`code=a&state=${state}&returnUrl=https://evil.test`);
	assert.equal(new URL(res.headers.get("location")).hostname, "shop.example.com");
});

test("http 非 localhost 被拒", async () => {
	const state = await sign({ returnUrl: "http://shop.example.com/x", exp: future() });
	assert.equal((await call(`code=a&state=${state}`)).status, 400);
});
