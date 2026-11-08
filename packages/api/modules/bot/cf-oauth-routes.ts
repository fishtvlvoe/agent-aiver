import { ORPCError } from "@orpc/server";
import { auth } from "@repo/auth";
import { db } from "@repo/database";
import { getBaseUrl } from "@repo/utils";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import { assertOrganizationPermission } from "./lib/access";
import { saveCfOauthLink } from "./lib/bot-store";
import {
	assertCfOauthBinding,
	buildCfOauthAuthorizeUrl,
	CF_OAUTH_COOKIE_NAME,
	CF_OAUTH_COOKIE_PATH,
	CF_OAUTH_STATE_TTL_SECONDS,
	CfOauthError,
	type CfOauthErrorCode,
	createNonce,
	createPkcePair,
	exchangeCfOauthCode,
	fetchCfOauthAccountId,
	openCfOauthCookie,
	readCfOauthConfig,
	sealCfOauthCookie,
	signOauthState,
	verifyOauthState,
} from "./lib/cf-oauth";

// 授權流程的 Hono 原生路由（不走 oRPC，因為需要 302 與 Set-Cookie）
// 1. start：產生 PKCE 與 state，導向 Cloudflare 授權頁
// 2. Cloudflare 授權後經跳板 opcos.me 回到 callback（state 內的 returnUrl）
// 3. callback：驗證 state 與 cookie，換 token、取 Account ID、寫入店家設定

async function hasManagePermission(organizationId: string, userId: string) {
	try {
		await assertOrganizationPermission(organizationId, userId, "organization.manage");
		return true;
	} catch (error) {
		if (error instanceof ORPCError) {
			return false;
		}
		throw error;
	}
}

function withCfError(url: string, code?: CfOauthErrorCode) {
	if (!code) {
		return url;
	}
	const target = new URL(url);
	target.searchParams.set("cfError", code);
	return target.toString();
}

export const cfOauthRoutes = new Hono()
	.get("/cf-oauth/start", async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session) {
			return c.text("請先登入", 401);
		}

		const organizationId = c.req.query("organizationId");
		if (!organizationId) {
			return c.text("缺少 organizationId", 400);
		}

		if (!(await hasManagePermission(organizationId, session.user.id))) {
			return c.text("沒有此店的管理權限", 403);
		}

		let config: ReturnType<typeof readCfOauthConfig>;
		try {
			config = readCfOauthConfig();
		} catch (error) {
			return c.text(error instanceof Error ? error.message : "Cloudflare 授權設定錯誤", 500);
		}

		const organization = await db.query.organization.findFirst({
			where: (org, { eq }) => eq(org.id, organizationId),
		});
		if (!organization) {
			return c.text("找不到此店", 404);
		}

		// returnUrl 與設定頁網址都由伺服器決定，不接受 query 內的轉址目標
		const baseUrl = getBaseUrl(process.env.NEXT_PUBLIC_SAAS_URL, 3000);
		const returnUrl = new URL("/api/bot/cf-oauth/callback", baseUrl).toString();
		const settingsUrl = new URL(`/${organization.slug}/model-settings`, baseUrl).toString();

		const { verifier, challenge } = await createPkcePair();
		const nonce = createNonce();
		const state = await signOauthState(
			{
				orgId: organizationId,
				nonce,
				returnUrl,
				exp: Math.floor(Date.now() / 1000) + CF_OAUTH_STATE_TTL_SECONDS,
			},
			config.stateKey,
		);

		const sealed = await sealCfOauthCookie(
			{ verifier, nonce, orgId: organizationId, settingsUrl },
			config.cookieKey,
		);
		setCookie(c, CF_OAUTH_COOKIE_NAME, sealed, {
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
			path: CF_OAUTH_COOKIE_PATH,
			maxAge: CF_OAUTH_STATE_TTL_SECONDS,
		});

		return c.redirect(
			buildCfOauthAuthorizeUrl({
				clientId: config.clientId,
				redirectUri: config.redirectUri,
				state,
				codeChallenge: challenge,
			}),
			302,
		);
	})
	.get("/cf-oauth/callback", async (c) => {
		let config: ReturnType<typeof readCfOauthConfig>;
		try {
			config = readCfOauthConfig();
		} catch (error) {
			return c.text(error instanceof Error ? error.message : "Cloudflare 授權設定錯誤", 500);
		}

		const sealed = getCookie(c, CF_OAUTH_COOKIE_NAME);
		const cookie = sealed ? await openCfOauthCookie(sealed, config.cookieKey) : null;
		if (!cookie) {
			return c.text("授權已逾時或無效，請回到店家設定頁重新連結", 400);
		}

		// 不論成功或失敗，回應都要清掉 cookie（一次性）
		deleteCookie(c, CF_OAUTH_COOKIE_NAME, { path: CF_OAUTH_COOKIE_PATH });
		const back = (code?: CfOauthErrorCode) => c.redirect(withCfError(cookie.settingsUrl, code), 302);

		let state: Awaited<ReturnType<typeof verifyOauthState>>;
		try {
			state = await verifyOauthState(c.req.query("state") ?? "", config.stateKey);
			assertCfOauthBinding(state, cookie);
		} catch {
			return back("state");
		}

		const session = await auth.api.getSession({ headers: c.req.raw.headers });
		if (!session) {
			return c.text("請先登入後再完成 Cloudflare 授權", 401);
		}

		if (!(await hasManagePermission(state.orgId, session.user.id))) {
			return c.text("沒有此店的管理權限", 403);
		}

		if (c.req.query("error")) {
			return back("denied");
		}

		const code = c.req.query("code");
		if (!code) {
			return back("exchange");
		}

		let accessToken: string;
		let refreshToken: string;
		let accessExpiresAt: number;
		let accountId: string;
		let membershipCount: number;
		try {
			const tokens = await exchangeCfOauthCode({
				code,
				verifier: cookie.verifier,
				clientId: config.clientId,
				redirectUri: config.redirectUri,
			});
			({ accessToken, refreshToken, accessExpiresAt } = tokens);
			({ accountId, membershipCount } = await fetchCfOauthAccountId({ accessToken }));
		} catch (error) {
			return back(error instanceof CfOauthError ? error.code : "exchange");
		}

		await saveCfOauthLink(state.orgId, session.user.id, {
			accountId,
			accessToken,
			refreshToken,
			accessExpiresAt,
			membershipCount,
		});

		return back();
	});
