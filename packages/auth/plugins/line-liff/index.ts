import { deleteExpiredLineLiffTokenClaims, insertLineLiffTokenClaim } from "@repo/database";
import { canonicalLineSub } from "@repo/utils";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

import { config } from "../../config";
import { mapLineProfileToUser } from "../../lib/line-profile";
import { sanitizeLoginTarget } from "./target";
import { verifyLineIdToken } from "./token";
import { type LineLiffTokenClaimStore, claimLineLiffToken } from "./token-claim";

const errorMessages = {
	LINE_LIFF_TOKEN_INVALID: "LINE 身分憑證無效，請重新開啟登入連結。",
	LINE_LIFF_TOKEN_REPLAYED: "此 LINE 身分憑證已使用過，請重新開啟登入連結。",
	LINE_EMAIL_ALREADY_REGISTERED: "這個 Email 已有帳號，請先用原帳號登入後再綁定 LINE。",
	LINE_SIGNUP_DISABLED: "目前未開放註冊，請使用邀請連結。",
	FAILED_TO_CREATE_SESSION: "無法建立登入工作階段，請稍後再試。",
	LINE_LIFF_SIGN_IN_FAILED: "LINE 登入無法完成，請稍後再試。",
} as const;

type LineLiffErrorCode = keyof typeof errorMessages;

function lineLiffError(
	code: LineLiffErrorCode,
	status: "BAD_REQUEST" | "UNAUTHORIZED" | "INTERNAL_SERVER_ERROR" = "BAD_REQUEST",
) {
	return new APIError(status, {
		code,
		message: errorMessages[code],
	});
}

type LineLiffBody = {
	idToken: string;
	nonce?: string;
	to?: string;
};

function parseLineLiffBody(body: unknown): LineLiffBody {
	const input = (typeof body === "object" && body !== null ? body : {}) as Record<
		string,
		unknown
	>;
	const { idToken, nonce, to } = input;

	if (typeof idToken !== "string" || idToken.length === 0) {
		throw lineLiffError("LINE_LIFF_TOKEN_INVALID");
	}
	if (nonce !== undefined && (typeof nonce !== "string" || nonce.length === 0)) {
		throw lineLiffError("LINE_LIFF_TOKEN_INVALID");
	}
	if (to !== undefined && typeof to !== "string") {
		throw lineLiffError("LINE_LIFF_TOKEN_INVALID");
	}

	return { idToken, nonce, to };
}

type LineLiffContext = Parameters<typeof setSessionCookie>[0];
type LineLiffUser = Parameters<typeof setSessionCookie>[1]["user"];
type LineLiffInternalAdapter = LineLiffContext["context"]["internalAdapter"];
type LineLiffClaims = Awaited<ReturnType<typeof verifyLineIdToken>>;

const lineLiffClaimStore: LineLiffTokenClaimStore = {
	deleteExpired: deleteExpiredLineLiffTokenClaims,
	insert: insertLineLiffTokenClaim,
};

async function findLineAccount(ctx: LineLiffContext, lineSub: string) {
	return await ctx.context.internalAdapter.findAccountByKey({
		providerId: "line",
		accountId: lineSub,
	});
}

async function createSessionAndResponse(
	ctx: LineLiffContext,
	user: LineLiffUser,
	redirectTo: string,
) {
	const session = await ctx.context.internalAdapter.createSession(user.id);
	if (!session) {
		throw lineLiffError("FAILED_TO_CREATE_SESSION", "INTERNAL_SERVER_ERROR");
	}

	await setSessionCookie(ctx, { session, user });

	return {
		status: true as const,
		user: {
			id: user.id,
			email: user.email,
			emailVerified: user.emailVerified,
		},
		redirectTo,
	};
}

async function signInWithVerifiedLine(
	ctx: LineLiffContext,
	claims: LineLiffClaims,
	lineSub: string,
	redirectTo: string,
) {
	const internalAdapter: LineLiffInternalAdapter = ctx.context.internalAdapter;

	const existingLineAccount = await findLineAccount(ctx, lineSub);
	if (existingLineAccount) {
		const user = await internalAdapter.findUserById(existingLineAccount.userId);
		if (!user) {
			throw lineLiffError("LINE_LIFF_SIGN_IN_FAILED", "INTERNAL_SERVER_ERROR");
		}
		return await createSessionAndResponse(ctx, user, redirectTo);
	}

	// 同 Email 已有帳號時不自動綁定：本底座沒有高權限帳號的密碼確認流程，
	// 避免憑 LINE 回傳的 Email 直接接管既有帳號。請先用原帳號登入，再到設定頁綁定 LINE。
	if (claims.email) {
		const emailMatch = await internalAdapter.findUserByEmail(claims.email);
		if (emailMatch) {
			throw lineLiffError("LINE_EMAIL_ALREADY_REGISTERED");
		}
	}

	if (!config.enableSignup) {
		throw lineLiffError("LINE_SIGNUP_DISABLED");
	}

	const profile = mapLineProfileToUser({
		sub: claims.sub,
		name: claims.name,
		picture: claims.picture,
	});

	let user;
	try {
		const created = await internalAdapter.createOAuthUser(
			{
				name: profile.name,
				image: profile.image ?? null,
				email: claims.email ?? profile.email,
				// LINE 不保證 Email 已驗證；若信任它，攻擊者可先註冊他人 Email 佔住帳號
				emailVerified: false,
			},
			{
				providerId: "line",
				accountId: lineSub,
			},
		);
		user = created.user;
	} catch {
		const accountAfterRace = await findLineAccount(ctx, lineSub);
		if (!accountAfterRace) {
			throw lineLiffError("LINE_LIFF_SIGN_IN_FAILED", "INTERNAL_SERVER_ERROR");
		}
		user = await internalAdapter.findUserById(accountAfterRace.userId);
		if (!user) {
			throw lineLiffError("LINE_LIFF_SIGN_IN_FAILED", "INTERNAL_SERVER_ERROR");
		}
	}

	return await createSessionAndResponse(ctx, user, redirectTo);
}

export const lineLiffPlugin = () =>
	({
		id: "lineLiff",
		endpoints: {
			lineLiffSignIn: createAuthEndpoint(
				"/line-liff/sign-in",
				{
					method: "POST",
					requireHeaders: true,
					metadata: { noStore: true },
				},
				async (ctx) => {
					// ponytail: 未做跨 isolate 限速，需要時改用 Cloudflare Rate Limiting binding
					const body = parseLineLiffBody(ctx.body);

					let claims;
					try {
						claims = await verifyLineIdToken({
							idToken: body.idToken,
							nonce: body.nonce,
							clientId: process.env.LINE_CLIENT_ID ?? "",
						});
					} catch {
						throw lineLiffError("LINE_LIFF_TOKEN_INVALID");
					}

					const lineSub = canonicalLineSub(claims.sub);
					const redirectTo = sanitizeLoginTarget(body.to);

					// 先 claim 再登入：同一個 idToken 第二次使用直接視為重放
					// claim 成功後不釋放，登入失敗時使用者會重新開啟 LIFF 取得新的 idToken
					const { claimed } = await claimLineLiffToken(lineLiffClaimStore, {
						idToken: body.idToken,
						lineUserId: lineSub,
						expiresAt: new Date(claims.exp * 1000),
						now: new Date(),
					});
					if (!claimed) {
						throw lineLiffError("LINE_LIFF_TOKEN_REPLAYED", "UNAUTHORIZED");
					}

					return ctx.json(await signInWithVerifiedLine(ctx, claims, lineSub, redirectTo));
				},
			),
		},
		$ERROR_CODES: Object.fromEntries(
			Object.entries(errorMessages).map(([code, message]) => [code, { code, message }]),
		),
	}) satisfies BetterAuthPlugin;
