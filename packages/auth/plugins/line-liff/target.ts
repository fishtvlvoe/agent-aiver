const DEFAULT_LOGIN_TARGET = "/";
const INTERNAL_ORIGIN = "https://line-liff.invalid";

function decodeLiffState(state: string | null | undefined) {
	if (typeof state !== "string" || state.length === 0) {
		return undefined;
	}

	try {
		return decodeURIComponent(state);
	} catch {
		return undefined;
	}
}

export function sanitizeLoginTarget(to: string | null | undefined) {
	if (typeof to !== "string" || to.length === 0 || !to.startsWith("/")) {
		return DEFAULT_LOGIN_TARGET;
	}

	try {
		const url = new URL(to, INTERNAL_ORIGIN);
		const normalizedPath = `${url.pathname}${url.search}${url.hash}`;
		if (url.origin !== INTERNAL_ORIGIN || normalizedPath.startsWith("//")) {
			return DEFAULT_LOGIN_TARGET;
		}
		if (url.pathname.replace(/\/+$/, "") === "/line") {
			return DEFAULT_LOGIN_TARGET;
		}

		return normalizedPath;
	} catch {
		return DEFAULT_LOGIN_TARGET;
	}
}

export function resolveLiffLoginTarget(input: {
	state?: string | null;
	to?: string | null;
	path?: readonly string[];
}) {
	const state = decodeLiffState(input.state);

	if (state !== undefined) {
		const stateTarget =
			state === "/line" ? "/" : state.startsWith("/line/") ? state.slice(5) : state;
		return sanitizeLoginTarget(stateTarget);
	}

	if (input.to !== undefined) {
		return sanitizeLoginTarget(input.to);
	}

	if (input.path && input.path.length > 0) {
		return sanitizeLoginTarget(`/${input.path.join("/")}`);
	}

	return DEFAULT_LOGIN_TARGET;
}
