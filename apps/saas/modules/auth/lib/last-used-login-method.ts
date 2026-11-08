export const lastUsedLoginMethodIds = {
	password: "email",
	magicLink: "magic-link",
	passkey: "passkey",
} as const;

export function isLastUsedLoginMethod(
	lastUsedLoginMethod: string | null | undefined,
	method: string,
) {
	return lastUsedLoginMethod === method;
}
