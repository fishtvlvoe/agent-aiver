import { ORPCError } from "@orpc/server";
import { getOrganizationBrief } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { upsertBotUsePlatformModel } from "../lib/bot-store";

// 平台管理員開關店家「使用平台模型」；開啟後店家不需填金鑰，機器人改用平台 Gemini 金鑰回覆
export const setUsePlatformModel = adminProcedure
	.route({
		method: "PUT",
		path: "/bot/admin/stores/{organizationId}/use-platform-model",
		tags: ["Bot"],
		summary: "Set store use platform model",
		description: "Platform admin only. Allow the store to use the platform Gemini key without its own key",
	})
	.input(
		z.object({
			organizationId: z.string(),
			usePlatformModel: z.boolean(),
		}),
	)
	.output(
		z.object({
			organizationId: z.string(),
			usePlatformModel: z.boolean(),
		}),
	)
	.handler(async ({ input: { organizationId, usePlatformModel }, context: { user } }) => {
		const organization = await getOrganizationBrief(organizationId);

		if (!organization) {
			throw new ORPCError("NOT_FOUND");
		}

		await upsertBotUsePlatformModel(organizationId, usePlatformModel, user.id);

		return { organizationId, usePlatformModel };
	});
