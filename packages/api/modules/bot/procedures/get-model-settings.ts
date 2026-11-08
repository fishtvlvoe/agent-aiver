import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import { getBotStoreByOrganizationId } from "../lib/bot-store";
import { CF_OAUTH_STATUS_VALUES, toModelSettingsView } from "../lib/model-providers";

export const getModelSettings = protectedProcedure
	.route({
		method: "GET",
		path: "/bot/model-settings",
		tags: ["Bot"],
		summary: "Get model settings",
		description: "Get the AI model settings with the API key masked (read only)",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.output(
		z.object({
			mode: z.enum(["platform", "custom"]),
			provider: z.enum(["gemini", "cloudflare", "custom"]),
			modelName: z.string().nullable(),
			baseUrl: z.string().nullable(),
			accountId: z.string().nullable(),
			apiKeyMask: z.string().nullable(),
			usePlatformModel: z.boolean(),
			cfOauthStatus: z.enum(CF_OAUTH_STATUS_VALUES).nullable(),
		}),
	)
	.handler(async ({ input: { organizationId }, context: { user } }) => {
		await assertOrganizationPermission(organizationId, user.id, "organization.manage");

		return toModelSettingsView(await getBotStoreByOrganizationId(organizationId));
	});
