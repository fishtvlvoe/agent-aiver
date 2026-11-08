import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertOrganizationPermission } from "../lib/access";
import { upsertBotPersona } from "../lib/bot-store";

const PERSONA_MAX_LENGTH = 500;

export const savePersona = protectedProcedure
	.route({
		method: "PUT",
		path: "/bot/persona",
		tags: ["Bot"],
		summary: "Save persona",
		description: "Save the reply speaking style (persona). An empty value clears it",
	})
	.input(
		z.object({
			organizationId: z.string(),
			persona: z.string().trim().max(PERSONA_MAX_LENGTH),
		}),
	)
	.output(
		z.object({
			persona: z.string().nullable(),
		}),
	)
	.handler(async ({ input: { organizationId, persona }, context: { user } }) => {
		await assertOrganizationPermission(organizationId, user.id, "organization.manage");

		const saved = persona === "" ? null : persona;
		await upsertBotPersona(organizationId, saved);

		return { persona: saved };
	});
