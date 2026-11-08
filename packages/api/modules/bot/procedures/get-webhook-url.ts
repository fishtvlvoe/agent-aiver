import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";

export const getWebhookUrl = protectedProcedure
	.route({
		method: "GET",
		path: "/bot/webhook-url",
		tags: ["Bot"],
		summary: "Get bot webhook URL",
		description: "Get the LINE webhook URL of an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.output(
		z.object({
			webhookUrl: z.string(),
		}),
	)
	.handler(async ({ input: { organizationId }, context: { user } }) => {
		const membership = await assertOrganizationPermission(
			organizationId,
			user.id,
			"organization.manage",
		);

		const baseUrl = process.env.BOT_WEBHOOK_BASE_URL?.replace(/\/+$/, "");
		if (!baseUrl) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "缺少 BOT_WEBHOOK_BASE_URL 設定，無法產生 webhook 網址",
			});
		}

		return {
			webhookUrl: `${baseUrl}/webhook/${membership.organization.slug}`,
		};
	});
