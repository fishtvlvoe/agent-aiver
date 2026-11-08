import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import { getBotStoreByOrganizationId } from "../lib/bot-store";

export const getStore = protectedProcedure
	.route({
		method: "GET",
		path: "/bot/store",
		tags: ["Bot"],
		summary: "Get bot store",
		description: "Get the masked LINE binding and model settings of an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.output(
		z.object({
			status: z.string(),
			lineSecretMask: z.string().nullable(),
			lineTokenMask: z.string().nullable(),
			lineSecretVerifiedAt: z.number().nullable(),
			modelMode: z.string().nullable(),
			modelProvider: z.string().nullable(),
			modelName: z.string().nullable(),
			modelBaseUrl: z.string().nullable(),
			modelKeyMask: z.string().nullable(),
		}),
	)
	.handler(async ({ input: { organizationId }, context: { user } }) => {
		await assertOrganizationPermission(organizationId, user.id, "organization.manage");

		const store = await getBotStoreByOrganizationId(organizationId);

		return {
			status: store?.status ?? "unbound",
			lineSecretMask: store?.lineSecretMask ?? null,
			lineTokenMask: store?.lineTokenMask ?? null,
			lineSecretVerifiedAt: store?.lineSecretVerifiedAt ?? null,
			modelMode: store?.modelMode ?? "platform",
			modelProvider: store?.modelProvider ?? null,
			modelName: store?.modelName ?? null,
			modelBaseUrl: store?.modelBaseUrl ?? null,
			modelKeyMask: store?.modelKeyMask ?? null,
		};
	});
