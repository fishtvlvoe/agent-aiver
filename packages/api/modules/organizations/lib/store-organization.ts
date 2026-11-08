import slugify from "@sindresorhus/slugify";
import { nanoid } from "nanoid";

export const DEFAULT_STORE_NAME = "我的店";

export type StoreOrganization = { id: string; slug: string };

type EnsureStoreOrganizationInput = {
	userId: string;
	name: string | null | undefined;
	forbiddenSlugs: readonly string[];
	findExisting: () => Promise<StoreOrganization[]>;
	create: (input: { name: string; slug: string; userId: string }) => Promise<StoreOrganization>;
	createSuffix?: () => string;
};

// 同一隔離環境內，同一使用者的並發請求共用同一筆建立動作
const pendingByUserId = new Map<string, Promise<StoreOrganization>>();

function defaultSuffix() {
	return nanoid(5).toLowerCase().replace(/[_-]/g, "");
}

export function buildStoreSlug(name: string, forbiddenSlugs: readonly string[], suffix?: string) {
	const base = slugify(name, { lowercase: true }).slice(0, 48).replace(/-+$/, "") || "store";

	if (suffix) {
		return `${base}-${suffix}`;
	}

	return forbiddenSlugs.includes(base) ? `${base}-store` : base;
}

export function isStoreSlugTakenError(error: unknown) {
	const code = (error as { body?: { code?: string } } | null)?.body?.code;

	return code === "ORGANIZATION_ALREADY_EXISTS";
}

export function ensureStoreOrganization(
	input: EnsureStoreOrganizationInput,
): Promise<StoreOrganization> {
	const running = pendingByUserId.get(input.userId);

	if (running) {
		return running;
	}

	const task = createStoreOrganization(input).finally(() => {
		pendingByUserId.delete(input.userId);
	});
	pendingByUserId.set(input.userId, task);

	return task;
}

async function createStoreOrganization({
	userId,
	name,
	forbiddenSlugs,
	findExisting,
	create,
	createSuffix = defaultSuffix,
}: EnsureStoreOrganizationInput): Promise<StoreOrganization> {
	const [existing] = await findExisting();

	if (existing) {
		return existing;
	}

	const displayName = name?.trim() || DEFAULT_STORE_NAME;

	// 第一次用原始代號；撞名（或代號被保留）時再加隨機尾碼重試
	for (let attempt = 0; attempt < 3; attempt++) {
		const slug = buildStoreSlug(
			displayName,
			forbiddenSlugs,
			attempt === 0 ? undefined : createSuffix(),
		);

		try {
			return await create({ name: displayName, slug, userId });
		} catch (error) {
			if (!isStoreSlugTakenError(error)) {
				throw error;
			}
		}
	}

	throw new Error("無法產生不重複的店家代號");
}
