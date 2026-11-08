CREATE TABLE `bot_conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`userId` text,
	`userText` text,
	`aiText` text,
	`status` text,
	`createdAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bot_conversation_organizationId_idx` ON `bot_conversation` (`organizationId`);--> statement-breakpoint
CREATE TABLE `bot_faq` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`question` text,
	`answer` text,
	`updatedAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bot_faq_organizationId_idx` ON `bot_faq` (`organizationId`);--> statement-breakpoint
CREATE TABLE `bot_store` (
	`organizationId` text PRIMARY KEY NOT NULL,
	`lineSecretMask` text,
	`lineTokenMask` text,
	`lineSecretEnc` text,
	`lineTokenEnc` text,
	`modelMode` text DEFAULT 'platform',
	`modelBaseUrl` text,
	`modelName` text,
	`modelKeyEnc` text,
	`modelKeyMask` text,
	`modelProvider` text,
	`status` text DEFAULT 'unbound',
	`createdAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bot_usage_counter` (
	`organizationId` text NOT NULL,
	`month` text NOT NULL,
	`count` integer,
	PRIMARY KEY(`organizationId`, `month`),
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bot_usage_counter_organizationId_idx` ON `bot_usage_counter` (`organizationId`);