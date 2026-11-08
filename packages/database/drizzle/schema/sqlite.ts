import { createId as cuid } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
// Tables
export const user = sqliteTable("user", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
	image: text("image"),
	createdAt: integer("createdAt", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer("updatedAt", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	role: text("role"),
	banned: integer("banned", { mode: "boolean" }),
	twoFactorEnabled: integer("twoFactorEnabled", { mode: "boolean" }).default(false),
	banReason: text("banReason"),
	banExpires: integer("banExpires", { mode: "timestamp" }),
	onboardingComplete: integer("onboardingComplete", { mode: "boolean" }).notNull().default(false),
	paymentsCustomerId: text("paymentsCustomerId"),
	locale: text("locale"),
	lastActiveOrganizationId: text("lastActiveOrganizationId"),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
		ipAddress: text("ipAddress"),
		userAgent: text("userAgent"),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		impersonatedBy: text("impersonatedBy"),
		activeOrganizationId: text("activeOrganizationId"),
		token: text("token").notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
		updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
	},
	(table) => [uniqueIndex("session_token_idx").on(table.token)],
);

export const account = sqliteTable("account", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	expiresAt: integer("expiresAt", { mode: "timestamp" }),
	password: text("password"),
	accessTokenExpiresAt: integer("accessTokenExpiresAt", {
		mode: "timestamp",
	}),
	refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
		mode: "timestamp",
	}),
	scope: text("scope"),
	createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
	createdAt: integer("createdAt", { mode: "timestamp" }),
	updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

export const passkey = sqliteTable("passkey", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	name: text("name"),
	publicKey: text("publicKey").notNull(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	credentialID: text("credentialID").notNull(),
	counter: integer("counter").notNull(),
	deviceType: text("deviceType").notNull(),
	backedUp: integer("backedUp", { mode: "boolean" }).notNull(),
	transports: text("transports"),
	createdAt: integer("createdAt", { mode: "timestamp" }),
	aaguid: text("aaguid"),
});

export const twoFactor = sqliteTable("twoFactor", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	secret: text("secret").notNull(),
	backupCodes: text("backupCodes").notNull(),
	verified: integer("verified", { mode: "boolean" }).default(true),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	failedVerificationCount: integer("failedVerificationCount").default(0),
	lockedUntil: integer("lockedUntil", { mode: "timestamp" }),
});

export const organization = sqliteTable(
	"organization",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		name: text("name").notNull(),
		slug: text("slug").notNull().unique(),
		logo: text("logo"),
		createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
		metadata: text("metadata"),
		paymentsCustomerId: text("paymentsCustomerId"),
	},
	(table) => [uniqueIndex("organization_slug_idx").on(table.slug)],
);

export const member = sqliteTable(
	"member",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role").default("member").notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	},
	(table) => [uniqueIndex("member_user_org_idx").on(table.userId, table.organizationId)],
);

export const invitation = sqliteTable(
	"invitation",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role"),
		status: text("status").default("pending").notNull(),
		expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		inviterId: text("inviterId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const purchase = sqliteTable("purchase", {
	id: text("id")
		.$defaultFn(() => cuid())
		.primaryKey(),
	organizationId: text("organizationId").references(() => organization.id, {
		onDelete: "cascade",
	}),
	userId: text("userId").references(() => user.id, {
		onDelete: "cascade",
	}),
	type: text({ enum: ["SUBSCRIPTION", "ONE_TIME"] }).notNull(),
	customerId: text("customerId").notNull(),
	subscriptionId: text("subscriptionId").unique(),
	priceId: text("priceId").notNull(),
	status: text("status"),
	trialEndsAt: integer("trialEndsAt", { mode: "timestamp" }),
	createdAt: integer("createdAt", { mode: "timestamp" })
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: integer("updatedAt", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

export const notification = sqliteTable(
	"notification",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text({ enum: ["WELCOME", "APP_UPDATE"] }).notNull(),
		data: text("data", { mode: "json" })
			.$type<Record<string, unknown>>()
			.notNull()
			.$default(() => ({})),
		link: text("link"),
		read: integer("read", { mode: "boolean" }).notNull().default(false),
		createdAt: integer("createdAt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: integer("updatedAt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`)
			.$onUpdate(() => new Date()),
	},
	(table) => [index("notification_userId_idx").on(table.userId)],
);

export const userNotificationPreference = sqliteTable(
	"user_notification_preference",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		type: text({ enum: ["WELCOME", "APP_UPDATE"] }).notNull(),
		target: text({ enum: ["IN_APP", "EMAIL"] }).notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" })
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
	},
	(table) => [
		index("user_notification_preference_userId_idx").on(table.userId),
		uniqueIndex("user_notification_preference_user_type_target_uidx").on(
			table.userId,
			table.type,
			table.target,
		),
	],
);

// Relations
// LIFF idToken 防重放：只存 SHA-256 雜湊，不存原始 token。
export const lineLiffTokenClaim = sqliteTable(
	"line_liff_token_claim",
	{
		tokenHash: text("tokenHash").primaryKey(),
		lineUserId: text("lineUserId").notNull(),
		expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
		createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
	},
	(table) => [index("line_liff_token_claim_expiresAt_idx").on(table.expiresAt)],
);

// LINE AI 機器人（舊 Cloudflare-Worker-LINE tenants 系列，改掛 organization）
export const botStore = sqliteTable("bot_store", {
	organizationId: text("organizationId")
		.primaryKey()
		.references(() => organization.id, { onDelete: "cascade" }),
	lineSecretMask: text("lineSecretMask"),
	lineTokenMask: text("lineTokenMask"),
	lineSecretEnc: text("lineSecretEnc"),
	lineTokenEnc: text("lineTokenEnc"),
	modelMode: text("modelMode").default("platform"),
	modelBaseUrl: text("modelBaseUrl"),
	modelName: text("modelName"),
	modelKeyEnc: text("modelKeyEnc"),
	modelKeyMask: text("modelKeyMask"),
	modelProvider: text("modelProvider"),
	modelAccountId: text("modelAccountId"),
	monthlyLimit: integer("monthlyLimit"),
	lineSecretVerifiedAt: integer("lineSecretVerifiedAt"),
	usePlatformModel: integer("usePlatformModel", { mode: "boolean" }).notNull().default(false),
	status: text("status").default("unbound"),
	createdAt: integer("createdAt", { mode: "timestamp" }),
	// Cloudflare OAuth 連結：refresh token 加密存放；cfOauthStatus 為 null 表示未用 OAuth
	cfRefreshTokenEnc: text("cfRefreshTokenEnc"),
	cfAccessExpiresAt: integer("cfAccessExpiresAt"),
	cfOauthVersion: integer("cfOauthVersion").notNull().default(0),
	cfRefreshingUntil: integer("cfRefreshingUntil"),
	cfOauthStatus: text("cfOauthStatus"),
	persona: text("persona"),
});

export const botFaq = sqliteTable(
	"bot_faq",
	{
		id: text("id").primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		question: text("question"),
		answer: text("answer"),
		updatedAt: integer("updatedAt", { mode: "timestamp" }),
	},
	(table) => [index("bot_faq_organizationId_idx").on(table.organizationId)],
);

export const botConversation = sqliteTable(
	"bot_conversation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("userId"),
		userText: text("userText"),
		aiText: text("aiText"),
		status: text("status"),
		createdAt: integer("createdAt", { mode: "timestamp" }),
	},
	(table) => [index("bot_conversation_organizationId_idx").on(table.organizationId)],
);

export const botUsageCounter = sqliteTable(
	"bot_usage_counter",
	{
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		month: text("month").notNull(),
		count: integer("count"),
	},
	(table) => [
		primaryKey({ columns: [table.organizationId, table.month] }),
		index("bot_usage_counter_organizationId_idx").on(table.organizationId),
	],
);

export const botAuditEvent = sqliteTable(
	"bot_audit_event",
	{
		id: text("id").primaryKey(),
		organizationId: text("organizationId")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		event: text("event"),
		detail: text("detail"),
		createdAt: integer("createdAt", { mode: "timestamp" }),
	},
	(table) => [index("bot_audit_event_organizationId_idx").on(table.organizationId)],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	passkeys: many(passkey),
	members: many(member),
	invitations: many(invitation),
	twoFactors: many(twoFactor),

	purchases: many(purchase),
	memberships: many(member),
	notifications: many(notification),
	notificationPreferences: many(userNotificationPreference),
}));

export const organizationRelations = relations(organization, ({ many, one }) => ({
	members: many(member),
	invitations: many(invitation),
	purchases: many(purchase),
	botStore: one(botStore),
	botFaqs: many(botFaq),
	botConversations: many(botConversation),
	botUsageCounters: many(botUsageCounter),
	botAuditEvents: many(botAuditEvent),
}));

export const botStoreRelations = relations(botStore, ({ one }) => ({
	organization: one(organization, {
		fields: [botStore.organizationId],
		references: [organization.id],
	}),
}));

export const botFaqRelations = relations(botFaq, ({ one }) => ({
	organization: one(organization, {
		fields: [botFaq.organizationId],
		references: [organization.id],
	}),
}));

export const botConversationRelations = relations(botConversation, ({ one }) => ({
	organization: one(organization, {
		fields: [botConversation.organizationId],
		references: [organization.id],
	}),
}));

export const botUsageCounterRelations = relations(botUsageCounter, ({ one }) => ({
	organization: one(organization, {
		fields: [botUsageCounter.organizationId],
		references: [organization.id],
	}),
}));

export const botAuditEventRelations = relations(botAuditEvent, ({ one }) => ({
	organization: one(organization, {
		fields: [botAuditEvent.organizationId],
		references: [organization.id],
	}),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
	user: one(user, {
		fields: [passkey.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

export const purchaseRelations = relations(purchase, ({ one }) => ({
	organization: one(organization, {
		fields: [purchase.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [purchase.userId],
		references: [user.id],
	}),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, {
		fields: [twoFactor.userId],
		references: [user.id],
	}),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
	user: one(user, {
		fields: [notification.userId],
		references: [user.id],
	}),
}));

export const userNotificationPreferenceRelations = relations(
	userNotificationPreference,
	({ one }) => ({
		user: one(user, {
			fields: [userNotificationPreference.userId],
			references: [user.id],
		}),
	}),
);
