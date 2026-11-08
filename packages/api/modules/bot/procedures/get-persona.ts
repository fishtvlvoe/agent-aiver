import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import { getBotStoreByOrganizationId } from "../lib/bot-store";

export const getPersona = protectedProcedure
	.route({
		method: "GET",
		path: "/bot/persona",
		tags: ["Bot"],
		summary: "Get persona",
		description: "Get the reply speaking style (persona) of an organization's bot",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.output(
		z.object({
			persona: z.string().nullable(),
		}),
	)
	.handler(async ({ input: { organizationId }, context: { user } }) => {
		await assertOrganizationPermission(organizationId, user.id, "organization.manage");

		const store = await getBotStoreByOrganizationId(organizationId);

		return { persona: store?.persona ?? null };
	});
