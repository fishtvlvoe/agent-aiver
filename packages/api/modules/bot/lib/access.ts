import { ORPCError } from "@orpc/server";
import { checkPermission } from "@repo/permissions";

import { verifyOrganizationMembership } from "../../organizations/lib/membership";

export async function assertOrganizationPermission(
	organizationId: string,
	userId: string,
	permission: "organization.read" | "organization.manage",
) {
	const membership = await verifyOrganizationMembership(organizationId, userId);

	if (!membership || !checkPermission({ membershipRole: membership.role }, permission)) {
		throw new ORPCError("FORBIDDEN");
	}

	return membership;
}
