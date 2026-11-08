import { canonicalLineSub } from "@repo/utils";

export type LineProfile = {
	sub: string;
	name?: string;
	picture?: string;
	email?: string;
};

export function mapLineProfileToUser(profile: LineProfile) {
	const lineSub = canonicalLineSub(profile.sub);
	const lineEmail = profile.email?.trim().toLowerCase();

	return {
		name: profile.name?.trim() || "LINE 使用者",
		image: profile.picture,
		email: lineEmail || `line-user-${lineSub}@line.invalid`,
		emailVerified: false,
	};
}
