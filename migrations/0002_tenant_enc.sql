-- 任務 7.1： tenants 增加 wrapped 金鑰欄位（明文一律不進 D1）
ALTER TABLE tenants ADD COLUMN line_secret_enc TEXT;
ALTER TABLE tenants ADD COLUMN line_token_enc TEXT;
