import "server-only";
import { ensureStoreOrganization } from "@repo/api/modules/organizations/lib/store-organization";
import { auth } from "@repo/auth";
import { config } from "@repo/auth/config";
import { headers } from "next/headers";

// 沒有任何店家的使用者登入後，自動建立一家店（名稱取自使用者名稱）
export function ensureStoreForUser(user: { id: string; name: string | null | undefined }) {
	return ensureStoreOrganization({
		userId: user.id,
		name: user.name,
		forbiddenSlugs: config.organizations.forbiddenOrganizationSlugs,
		findExisting: async () => auth.api.listOrganizations({ headers: await headers() }),
		// 不帶 headers 走系統建立路徑（以 userId 指定建立者），不受 enableUsersToCreateOrganizations 限制
		create: ({ name, slug, userId }) => auth.api.createOrganization({ body: { name, slug, userId } }),
	});
}
