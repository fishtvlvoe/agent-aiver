-- 問題 13：tenants 增加供應商欄位（model_settings 改存 provider 格式）
ALTER TABLE tenants ADD COLUMN model_provider TEXT;
