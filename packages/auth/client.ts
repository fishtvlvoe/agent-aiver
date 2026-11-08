import { passkeyClient } from "@better-auth/passkey/client";
import {
	adminClient,
	inferAdditionalFields,
	lastLoginMethodClient,
	magicLinkClient,
	organizationClient,
	twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from ".";

export const authClient = createAuthClient({
	plugins: [
		inferAdditionalFields<typeof auth>(),
		magicLinkClient(),
		organizationClient(),
		adminClient(),
		passkeyClient(),
		twoFactorClient(),
		lastLoginMethodClient(),
	],
});

export type AuthClientErrorCodes = typeof authClient.$ERROR_CODES & {
	INVALID_INVITATION: string;
};
