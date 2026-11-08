import { describe, expect, it } from "vitest";

import { type OldBotRows, migrateBotData, toSql } from "./migrate-bot-data";

const orgs = new Map([
	["shop-a", "org_a"],
	["shop-c", "org_c"],
]);

const fixture = (): OldBotRows => ({
	tenants: [
		{
			id: "old-a",
			slug: "shop-a",
			line_secret_mask: "sec***",
			line_token_mask: "tok***",
			line_secret_enc: "enc-fake",
			line_token_enc: "enc-fake",
			llm_key_mask: "fake-mask",
			model_mode: "custom",
			model_base_url: "https://example.invalid/v1",
			model_name: "fake-model",
			model_key_enc: "enc-fake",
			model_key_mask: null,
			model_provider: "openai",
			status: "bound",
			created_at: "2026-01-02T03:04:05.000Z",
		},
		{
			id: "old-b",
			slug: "shop-missing",
			line_secret_mask: null,
			line_token_mask: null,
			line_secret_enc: null,
			line_token_enc: null,
			llm_key_mask: null,
			model_mode: "platform",
			model_base_url: null,
			model_name: null,
			model_key_enc: null,
			model_key_mask: null,
			model_provider: null,
			status: "unbound",
			created_at: "2026-01-02T03:04:05.000Z",
		},
		{
			id: "old-c",
			slug: "shop-c",
			line_secret_mask: null,
			line_token_mask: null,
			line_secret_enc: null,
			line_token_enc: null,
			llm_key_mask: null,
			model_mode: "platform",
			model_base_url: null,
			model_name: null,
			model_key_enc: null,
			model_key_mask: null,
			model_provider: null,
			status: "unbound",
			created_at: null,
		},
	],
	faqs: [
		{ id: "f1", tenant_id: "old-a", question: "O'Brien?", answer: "hi", updated_at: "2026-01-03 00:00:00" },
		{ id: "f2", tenant_id: "old-c", question: "q2", answer: "a2", updated_at: "" },
		{ id: "f3", tenant_id: "old-b", question: "q3", answer: "a3", updated_at: null },
	],
	conversations: [
		{ id: "c1", tenant_id: "old-a", user_id: "U1", user_text: "hi", ai_text: "hello", status: "ok", created_at: "2026-01-02 03:04:05" },
		{ id: "c2", tenant_id: "old-c", user_id: "U2", user_text: "x", ai_text: "y", status: "ok", created_at: "not-a-date" },
		{ id: "c3", tenant_id: "old-b", user_id: "U3", user_text: "x", ai_text: "y", status: "ok", created_at: null },
	],
	usage_counters: [
		{ tenant_id: "old-a", month: "2026-01", count: 3 },
		{ tenant_id: "old-c", month: "2026-01", count: 5 },
		{ tenant_id: "old-b", month: "2026-01", count: 9 },
	],
});

const jan2 = Date.UTC(2026, 0, 2, 3, 4, 5) / 1000;

describe("migrateBotData", () => {
	it("maps each old tenant to the organization with the same slug", () => {
		const result = migrateBotData(fixture(), orgs);

		expect(result.botStore.map((r) => r.organizationId)).toEqual(["org_a", "org_c"]);
		const a = result.botStore.find((r) => r.organizationId === "org_a");
		expect(a).toMatchObject({
			lineSecretEnc: "enc-fake",
			lineTokenEnc: "enc-fake",
			modelKeyEnc: "enc-fake",
			modelKeyMask: "fake-mask",
			modelMode: "custom",
			modelProvider: "openai",
			status: "bound",
		});
	});

	it("converts ISO and SQLite timestamps to drizzle seconds and keeps unparsable ones as null", () => {
		const result = migrateBotData(fixture(), orgs);

		expect(result.botStore.find((r) => r.organizationId === "org_a")?.createdAt).toBe(jan2);
		expect(result.botConversation.find((r) => r.id === "c1")?.createdAt).toBe(jan2);
		expect(result.botFaq.find((r) => r.id === "f1")?.updatedAt).toBe(Date.UTC(2026, 0, 3) / 1000);
		expect(result.botStore.find((r) => r.organizationId === "org_c")?.createdAt).toBeNull();
		expect(result.botFaq.find((r) => r.id === "f2")?.updatedAt).toBeNull();
		expect(result.botConversation.find((r) => r.id === "c2")?.createdAt).toBeNull();
	});

	it("lists missing organization slugs and skips their rows without stopping", () => {
		const result = migrateBotData(fixture(), orgs);

		expect(result.missingOrgSlugs).toEqual(["shop-missing"]);
		expect(result.botFaq.map((r) => r.id)).toEqual(["f1", "f2"]);
		expect(result.botConversation.map((r) => r.id)).toEqual(["c1", "c2"]);
		expect(result.botUsageCounter).toHaveLength(2);
		expect(result.skipped).toEqual(
			expect.arrayContaining([
				{ table: "tenants", id: "old-b", reason: "找不到對應組織" },
				{ table: "faqs", id: "f3", reason: "所屬舊店沒有對應組織" },
				{ table: "conversations", id: "c3", reason: "所屬舊店沒有對應組織" },
				{ table: "usage_counters", id: "old-b/2026-01", reason: "所屬舊店沒有對應組織" },
			]),
		);
	});

	it("does not mix rows between different shops", () => {
		const result = migrateBotData(fixture(), orgs);

		expect(result.botFaq.filter((r) => r.organizationId === "org_a").map((r) => r.id)).toEqual(["f1"]);
		expect(result.botFaq.filter((r) => r.organizationId === "org_c").map((r) => r.id)).toEqual(["f2"]);
		expect(result.botConversation.filter((r) => r.organizationId === "org_a").map((r) => r.id)).toEqual(["c1"]);
		expect(result.botUsageCounter).toEqual([
			{ organizationId: "org_a", month: "2026-01", count: 3 },
			{ organizationId: "org_c", month: "2026-01", count: 5 },
		]);
	});

	it("is deterministic on re-run", () => {
		const first = migrateBotData(fixture(), orgs);
		const second = migrateBotData(fixture(), orgs);

		expect(second).toEqual(first);
		expect(toSql(second)).toEqual(toSql(first));
	});

	it("refuses to map two old shops onto one organization", () => {
		const rows = fixture();
		rows.tenants.push({ ...rows.tenants[0], id: "old-dup" });

		expect(() => migrateBotData(rows, orgs)).toThrow(/org_a/);
	});

	it("emits INSERT OR REPLACE statements with escaped values and NULL", () => {
		const sql = toSql(migrateBotData(fixture(), orgs));

		expect(sql.every((s) => s.startsWith("INSERT OR REPLACE INTO "))).toBe(true);
		expect(sql.filter((s) => s.includes('"bot_store"'))).toHaveLength(2);
		expect(sql.find((s) => s.includes('"bot_faq"') && s.includes("'f1'"))).toContain("'O''Brien?'");
		expect(sql.find((s) => s.includes('"bot_store"') && s.includes("'org_c'"))).toContain("NULL");
		expect(sql.find((s) => s.includes('"bot_usage_counter"') && s.includes("'org_a'"))).toContain(", 3);");
	});
});
