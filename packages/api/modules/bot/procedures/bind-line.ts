import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import { upsertBotLineBinding } from "../lib/bot-store";
import { encryptSecret, maskSecret } from "../lib/crypto";
import { isLineAccessTokenValid } from "../lib/line";

export const bindLine = protectedProcedure
	.route({
		method: "POST",
		path: "/bot/line-binding",
		tags: ["Bot"],
		summary: "Bind LINE channel",
		description: "Verify LINE credentials, then store them encrypted with masked previews",
	})
	.input(
		z.object({
			organizationId: z.string(),
			channelSecret: z.string().min(1),
			accessToken: z.string().min(1),
		}),
	)
	.output(
		z.object({
			status: z.literal("bound"),
			lineSecretMask: z.string(),
			lineTokenMask: z.string(),
		}),
	)
	.handler(async ({ input, context: { user } }) => {
		await assertOrganizationPermission(input.organizationId, user.id, "organization.manage");

		if (!(await isLineAccessTokenValid(input.accessToken))) {
			throw new ORPCError("UNAUTHORIZED", { message: "金鑰無效，請確認後重試" });
		}

		const lineSecretMask = maskSecret(input.channelSecret);
		const lineTokenMask = maskSecret(input.accessToken);

		await upsertBotLineBinding(input.organizationId, {
			lineSecretEnc: await encryptSecret(input.channelSecret),
			lineTokenEnc: await encryptSecret(input.accessToken),
			lineSecretMask,
			lineTokenMask,
			status: "bound",
			lineSecretVerifiedAt: null,
		});

		return { status: "bound" as const, lineSecretMask, lineTokenMask };
	});
