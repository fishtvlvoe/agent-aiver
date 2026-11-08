// 舊 Cloudflare-Worker-LINE D1（tenants / faqs / conversations / usage_counters）→ 底座 bot_* 四張表。
// 純函式：不連資料庫、不讀環境變數。可重跑：每張表以主鍵 INSERT OR REPLACE。

export type OldTenant = {
	id: string;
	slug: string | null;
	line_secret_mask: string | null;
	line_token_mask: string | null;
	line_secret_enc: string | null;
	line_token_enc: string | null;
	llm_key_mask: string | null;
	model_mode: string | null;
	model_base_url: string | null;
	model_name: string | null;
	model_key_enc: string | null;
	model_key_mask: string | null;
	model_provider: string | null;
	status: string | null;
	created_at: string | null;
};

export type OldFaq = {
	id: string;
	tenant_id: string | null;
	question: string | null;
	answer: string | null;
	updated_at: string | null;
};

export type OldConversation = {
	id: string;
	tenant_id: string | null;
	user_id: string | null;
	user_text: string | null;
	ai_text: string | null;
	status: string | null;
	created_at: string | null;
};

export type OldUsageCounter = {
	tenant_id: string | null;
	month: string;
	count: number | null;
};

export type OldBotRows = {
	tenants: OldTenant[];
	faqs: OldFaq[];
	conversations: OldConversation[];
	usage_counters: OldUsageCounter[];
};

export type BotStoreRow = {
	organizationId: string;
	lineSecretMask: string | null;
	lineTokenMask: string | null;
	lineSecretEnc: string | null;
	lineTokenEnc: string | null;
	modelMode: string | null;
	modelBaseUrl: string | null;
	modelName: string | null;
	modelKeyEnc: string | null;
	modelKeyMask: string | null;
	modelProvider: string | null;
	status: string | null;
	createdAt: number | null;
};

export type BotFaqRow = {
	id: string;
	organizationId: string;
	question: string | null;
	answer: string | null;
	updatedAt: number | null;
};

export type BotConversationRow = {
	id: string;
	organizationId: string;
	userId: string | null;
	userText: string | null;
	aiText: string | null;
	status: string | null;
	createdAt: number | null;
};

export type BotUsageCounterRow = {
	organizationId: string;
	month: string;
	count: number | null;
};

export type SkippedRow = {
	table: "tenants" | "faqs" | "conversations" | "usage_counters";
	id: string;
	reason: string;
};

export type MigrationResult = {
	botStore: BotStoreRow[];
	botFaq: BotFaqRow[];
	botConversation: BotConversationRow[];
	botUsageCounter: BotUsageCounterRow[];
	missingOrgSlugs: string[];
	skipped: SkippedRow[];
};

// drizzle 的 integer({ mode: "timestamp" }) 讀寫的是「秒」，寫毫秒會被讀成遙遠的未來。
// SQLite 的 CURRENT_TIMESTAMP 格式（無時區）視為 UTC；無法解析回 null。
const toDrizzleTimestamp = (text: string | null): number | null => {
	if (!text) return null;
	const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(" ", "T")}Z` : text;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
};

export function migrateBotData(
	oldRows: OldBotRows,
	orgSlugToId: ReadonlyMap<string, string>,
): MigrationResult {
	const orgIdByTenantId = new Map<string, string>();
	const mappedOrgIds = new Set<string>();
	const botStore: BotStoreRow[] = [];
	const missingOrgSlugs = new Set<string>();
	const skipped: SkippedRow[] = [];

	for (const t of oldRows.tenants) {
		const organizationId = t.slug ? orgSlugToId.get(t.slug) : undefined;
		if (!organizationId) {
			if (t.slug) missingOrgSlugs.add(t.slug);
			skipped.push({ table: "tenants", id: t.id, reason: "找不到對應組織" });
			continue;
		}
		if (mappedOrgIds.has(organizationId)) {
			throw new Error(`組織 ${organizationId} 對應到多家舊店（slug 重複），中止搬移`);
		}
		mappedOrgIds.add(organizationId);
		orgIdByTenantId.set(t.id, organizationId);
		botStore.push({
			organizationId,
			lineSecretMask: t.line_secret_mask,
			lineTokenMask: t.line_token_mask,
			lineSecretEnc: t.line_secret_enc,
			lineTokenEnc: t.line_token_enc,
			modelMode: t.model_mode,
			modelBaseUrl: t.model_base_url,
			modelName: t.model_name,
			modelKeyEnc: t.model_key_enc,
			modelKeyMask: t.model_key_mask ?? t.llm_key_mask,
			modelProvider: t.model_provider,
			status: t.status,
			createdAt: toDrizzleTimestamp(t.created_at),
		});
	}

	const orgOf = (table: SkippedRow["table"], id: string, tenantId: string | null) => {
		const organizationId = tenantId ? orgIdByTenantId.get(tenantId) : undefined;
		if (!organizationId) skipped.push({ table, id, reason: "所屬舊店沒有對應組織" });
		return organizationId;
	};

	const botFaq: BotFaqRow[] = [];
	for (const f of oldRows.faqs) {
		const organizationId = orgOf("faqs", f.id, f.tenant_id);
		if (!organizationId) continue;
		botFaq.push({
			id: f.id,
			organizationId,
			question: f.question,
			answer: f.answer,
			updatedAt: toDrizzleTimestamp(f.updated_at),
		});
	}

	const botConversation: BotConversationRow[] = [];
	for (const c of oldRows.conversations) {
		const organizationId = orgOf("conversations", c.id, c.tenant_id);
		if (!organizationId) continue;
		botConversation.push({
			id: c.id,
			organizationId,
			userId: c.user_id,
			userText: c.user_text,
			aiText: c.ai_text,
			status: c.status,
			createdAt: toDrizzleTimestamp(c.created_at),
		});
	}

	const botUsageCounter: BotUsageCounterRow[] = [];
	for (const u of oldRows.usage_counters) {
		const organizationId = orgOf("usage_counters", `${u.tenant_id}/${u.month}`, u.tenant_id);
		if (!organizationId) continue;
		botUsageCounter.push({ organizationId, month: u.month, count: u.count });
	}

	return {
		botStore,
		botFaq,
		botConversation,
		botUsageCounter,
		missingOrgSlugs: [...missingOrgSlugs],
		skipped,
	};
}

type SqlValue = string | number | null;

const literal = (v: SqlValue): string => {
	if (v === null) return "NULL";
	if (typeof v === "number") return String(v);
	return `'${v.replace(/'/g, "''")}'`;
};

const insertOrReplace = (table: string, row: Record<string, SqlValue>): string => {
	const cols = Object.keys(row);
	const colList = cols.map((c) => `"${c}"`).join(", ");
	const valList = cols.map((c) => literal(row[c])).join(", ");
	return `INSERT OR REPLACE INTO "${table}" (${colList}) VALUES (${valList});`;
};

export function toSql(result: MigrationResult): string[] {
	return [
		...result.botStore.map((r) => insertOrReplace("bot_store", r)),
		...result.botFaq.map((r) => insertOrReplace("bot_faq", r)),
		...result.botConversation.map((r) => insertOrReplace("bot_conversation", r)),
		...result.botUsageCounter.map((r) => insertOrReplace("bot_usage_counter", r)),
	];
}
