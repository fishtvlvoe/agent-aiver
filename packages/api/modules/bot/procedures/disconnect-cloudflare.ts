import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import { disconnectCfOauthLink } from "../lib/bot-store";

export const disconnectCloudflare = protectedProcedure
	.route({
		method: "POST",
		path: "/bot/cf-oauth/disconnect",
		tags: ["Bot"],
		summary: "Disconnect Cloudflare OAuth",
		description:
			"Clear the locally stored Cloudflare OAuth tokens. Does not revoke the authorization on Cloudflare",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.output(
		z.object({
			cfOauthStatus: z.null(),
		}),
	)
	.handler(async ({ input: { organizationId }, context: { user } }) => {
		await assertOrganizationPermission(organizationId, user.id, "organization.manage");

		await disconnectCfOauthLink(organizationId, user.id);

		return { cfOauthStatus: null };
	});
