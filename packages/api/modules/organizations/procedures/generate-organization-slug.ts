import { ORPCError } from "@orpc/server";
import { getOrganizationBySlug } from "@repo/database";
import slugify from "@sindresorhus/slugify";
import { nanoid } from "nanoid";
import { z } from "zod";

import { publicProcedure } from "../../../orpc/procedures";

export const generateOrganizationSlug = publicProcedure
	.route({
		method: "GET",
		path: "/organizations/generate-slug",
		tags: ["Organizations"],
		summary: "Generate organization slug",
		description: "Generate a unique slug from an organization name",
	})
	.input(
		z.object({
			name: z.string().trim().min(1).max(100),
		}),
	)
	.output(
		z.object({
			slug: z.string().min(1),
		}),
	)
	.handler(async ({ input: { name } }) => {
		const slugifiedName = slugify(name, {
			lowercase: true,
		});
		// 純中文等無英數字的名稱會轉成空字串，改用隨機代號避免驗證失敗
		const baseSlug = slugifiedName || `chapter-${nanoid(8).toLowerCase().replace(/[_-]/g, "")}`;

		let slug = baseSlug;
		let hasAvailableSlug = false;

		for (let attemptIndex = 0; attemptIndex < 3; attemptIndex++) {
			const existing = await getOrganizationBySlug(slug);

			if (!existing) {
				hasAvailableSlug = true;
				break;
			}

			slug = `${baseSlug}-${nanoid(5)}`;
		}

		if (!hasAvailableSlug) {
			throw new ORPCError("INTERNAL_SERVER_ERROR");
		}

		return { slug };
	});
