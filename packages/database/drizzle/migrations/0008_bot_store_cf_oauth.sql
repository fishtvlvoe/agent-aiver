ALTER TABLE `bot_store` ADD `cfRefreshTokenEnc` text;--> statement-breakpoint
ALTER TABLE `bot_store` ADD `cfAccessExpiresAt` integer;--> statement-breakpoint
ALTER TABLE `bot_store` ADD `cfOauthVersion` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `bot_store` ADD `cfRefreshingUntil` integer;--> statement-breakpoint
ALTER TABLE `bot_store` ADD `cfOauthStatus` text;