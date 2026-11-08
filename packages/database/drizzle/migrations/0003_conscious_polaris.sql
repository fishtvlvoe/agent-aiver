CREATE TABLE `bot_audit_event` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`event` text,
	`detail` text,
	`createdAt` integer,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bot_audit_event_organizationId_idx` ON `bot_audit_event` (`organizationId`);