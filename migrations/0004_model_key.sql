-- 任務 9.3：tenants 增加自訂模型供應商欄位（apiKey 只存 wrapped，明文不進 D1）
ALTER TABLE tenants ADD COLUMN model_key_enc TEXT;
ALTER TABLE tenants ADD COLUMN model_key_mask TEXT;
