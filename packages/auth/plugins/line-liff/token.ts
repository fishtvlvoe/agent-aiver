const LINE_VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";
const DEFAULT_LINE_LIFF_TOKEN_MAX_AGE_SECONDS = 300;
const CLOCK_SKEW_SECONDS = 120;

export const LINE_LIFF_TOKEN_ERROR_CODE = "LINE_LIFF_TOKEN_INVALID" as const;

export type LineIdTokenClaims = {
	sub: string;
	aud: string;
	exp: number;
	iat: number;
	nonce?: string;
	name?: string;
	picture?: string;
	email?: string;
};

type LineIdTokenVerifyResponse = LineIdTokenClaims;

export class LineLiffTokenError extends Error {
	readonly code = LINE_LIFF_TOKEN_ERROR_CODE;

	constructor() {
		super("LINE LIFF 身分憑證無效。");
		this.name = "LineLiffTokenError";
	}
}

type VerifyLineIdToken = (idToken: string, clientId: string) => Promise<unknown>;

const isOptionalString = (value: unknown) => value === undefined || typeof value === "string";

function isLineIdTokenVerifyResponse(value: unknown): value is LineIdTokenVerifyResponse {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const claims = value as Record<string, unknown>;
	return (
		typeof claims.sub === "string" &&
		claims.sub.length > 0 &&
		typeof claims.aud === "string" &&
		typeof claims.exp === "number" &&
		typeof claims.iat === "number" &&
		isOptionalString(claims.nonce) &&
		isOptionalString(claims.name) &&
		isOptionalString(claims.picture) &&
		isOptionalString(claims.email)
	);
}

async function verifyWithLineApi(idToken: string, clientId: string): Promise<unknown> {
	const response = await fetch(LINE_VERIFY_ENDPOINT, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
	});

	if (!response.ok) {
		throw new LineLiffTokenError();
	}

	const body: unknown = await response.json();
	return body;
}

function getLineLiffTokenMaxAgeSeconds() {
	const configured = Number.parseInt(process.env.LIFF_ID_TOKEN_MAX_AGE_SECONDS ?? "", 10);
	return Number.isSafeInteger(configured) && configured > 0
		? configured
		: DEFAULT_LINE_LIFF_TOKEN_MAX_AGE_SECONDS;
}

function validateLineIdTokenClaims(
	value: unknown,
	input: { clientId: string; nonce?: string; now: number },
): LineIdTokenClaims {
	if (!isLineIdTokenVerifyResponse(value)) {
		throw new LineLiffTokenError();
	}

	const claims = value;
	const tokenAge = input.now - claims.iat;
	const nonceMatches =
		claims.nonce === undefined || (input.nonce !== undefined && claims.nonce === input.nonce);
	if (
		claims.aud !== input.clientId ||
		!Number.isSafeInteger(claims.exp) ||
		claims.exp <= input.now ||
		!Number.isSafeInteger(claims.iat) ||
		claims.iat > input.now + CLOCK_SKEW_SECONDS ||
		tokenAge > getLineLiffTokenMaxAgeSeconds() ||
		!nonceMatches
	) {
		throw new LineLiffTokenError();
	}

	return {
		sub: claims.sub,
		aud: claims.aud,
		exp: claims.exp,
		iat: claims.iat,
		...(claims.nonce === undefined ? {} : { nonce: claims.nonce }),
		...(claims.name?.trim() ? { name: claims.name.trim() } : {}),
		...(claims.picture?.trim() ? { picture: claims.picture } : {}),
		...(claims.email?.trim() ? { email: claims.email.trim().toLowerCase() } : {}),
	};
}

export async function verifyLineIdToken(input: {
	idToken: string;
	nonce?: string;
	clientId: string;
	now?: number;
	verify?: VerifyLineIdToken;
}) {
	try {
		const response = await (input.verify ?? verifyWithLineApi)(input.idToken, input.clientId);
		return validateLineIdTokenClaims(response, {
			clientId: input.clientId,
			nonce: input.nonce,
			now: input.now ?? Math.floor(Date.now() / 1000),
		});
	} catch (error) {
		if (error instanceof LineLiffTokenError) {
			throw error;
		}

		throw new LineLiffTokenError();
	}
}
