CREATE TABLE `line_liff_token_claim` (
	`tokenHash` text PRIMARY KEY NOT NULL,
	`lineUserId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `line_liff_token_claim_expiresAt_idx` ON `line_liff_token_claim` (`expiresAt`);