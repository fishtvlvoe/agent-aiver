ALTER TABLE `bot_store` ADD `cfRefreshTokenEnc` text;
ALTER TABLE `bot_store` ADD `cfAccessExpiresAt` integer;
ALTER TABLE `bot_store` ADD `cfOauthVersion` integer DEFAULT 0 NOT NULL;
ALTER TABLE `bot_store` ADD `cfRefreshingUntil` integer;
ALTER TABLE `bot_store` ADD `cfOauthStatus` text;