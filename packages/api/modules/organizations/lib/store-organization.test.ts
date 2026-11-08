import { describe, expect, it, vi } from "vitest";

import {
	DEFAULT_STORE_NAME,
	buildStoreSlug,
	ensureStoreOrganization,
	isStoreSlugTakenError,
} from "./store-organization";

const forbiddenSlugs = ["new-organization", "admin", "settings"];
const takenError = { body: { code: "ORGANIZATION_ALREADY_EXISTS" } };

describe("buildStoreSlug", () => {
	it("turns an English name into a lowercase slug", () => {
		expect(buildStoreSlug("John Shop", forbiddenSlugs)).toBe("john-shop");
	});

	it("falls back to 'store' for a pure Chinese name", () => {
		expect(buildStoreSlug("老魚分會", forbiddenSlugs)).toBe("store");
	});

	it("adds a suffix when the base slug is a forbidden route", () => {
		expect(buildStoreSlug("Admin", forbiddenSlugs)).toBe("admin-store");
	});

	it("appends the given suffix", () => {
		expect(buildStoreSlug("John Shop", forbiddenSlugs, "k3d9")).toBe("john-shop-k3d9");
	});
});

describe("isStoreSlugTakenError", () => {
	it("recognises the organization-already-exists code", () => {
		expect(isStoreSlugTakenError(takenError)).toBe(true);
		expect(isStoreSlugTakenError(new Error("boom"))).toBe(false);
	});
});

describe("ensureStoreOrganization", () => {
	it("returns the existing organization without creating another one", async () => {
		const create = vi.fn();

		const store = await ensureStoreOrganization({
			userId: "user-existing",
			name: "Alice",
			forbiddenSlugs,
			findExisting: async () => [{ id: "org-1", slug: "alice-shop" }],
			create,
		});

		expect(store).toEqual({ id: "org-1", slug: "alice-shop" });
		expect(create).not.toHaveBeenCalled();
	});

	it("creates a store named after the user and avoids forbidden slugs", async () => {
		const create = vi.fn(async ({ slug, name, userId }) => ({ id: "org-new", slug, name, userId }));

		const store = await ensureStoreOrganization({
			userId: "user-admin-name",
			name: "Admin",
			forbiddenSlugs,
			findExisting: async () => [],
			create,
		});

		expect(create).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledWith({
			name: "Admin",
			slug: "admin-store",
			userId: "user-admin-name",
		});
		expect(store.slug).toBe("admin-store");
	});

	it("uses the default store name when the user has no name", async () => {
		const create = vi.fn(async ({ slug }) => ({ id: "org-default", slug }));

		await ensureStoreOrganization({
			userId: "user-no-name",
			name: "   ",
			forbiddenSlugs,
			findExisting: async () => [],
			create,
		});

		expect(create).toHaveBeenCalledWith({
			name: DEFAULT_STORE_NAME,
			slug: "store",
			userId: "user-no-name",
		});
	});

	it("retries with a different slug when the first one is already taken", async () => {
		const slugs: string[] = [];
		const create = vi.fn(async ({ slug }: { slug: string }) => {
			slugs.push(slug);
			if (slugs.length === 1) {
				throw takenError;
			}
			return { id: "org-retry", slug };
		});

		const store = await ensureStoreOrganization({
			userId: "user-collision",
			name: "Shared Name",
			forbiddenSlugs,
			findExisting: async () => [],
			create,
			createSuffix: () => "x7k2",
		});

		expect(slugs).toEqual(["shared-name", "shared-name-x7k2"]);
		expect(store.slug).not.toBe(slugs[0]);
	});

	it("creates only once for concurrent requests from the same user", async () => {
		const create = vi.fn(async ({ slug }: { slug: string }) => {
			await Promise.resolve();
			return { id: "org-once", slug };
		});
		const input = {
			userId: "user-concurrent",
			name: "Concurrent",
			forbiddenSlugs,
			findExisting: async () => [],
			create,
		};

		const [first, second] = await Promise.all([
			ensureStoreOrganization(input),
			ensureStoreOrganization(input),
		]);

		expect(create).toHaveBeenCalledTimes(1);
		expect(second).toEqual(first);
	});

	it("rethrows errors that are not slug collisions without retrying", async () => {
		const create = vi.fn(async () => {
			throw new Error("database down");
		});

		await expect(
			ensureStoreOrganization({
				userId: "user-db-error",
				name: "Broken",
				forbiddenSlugs,
				findExisting: async () => [],
				create,
			}),
		).rejects.toThrow("database down");
		expect(create).toHaveBeenCalledTimes(1);
	});
});
