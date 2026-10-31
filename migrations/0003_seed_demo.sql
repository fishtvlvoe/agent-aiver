-- 任務 8.2/8.6：tenants 增加管理者 LINE userId；8.1/8.6 種子測試帳號
--
-- 三種身分切換方式（本機測試用）：
-- 1) platform_admins 有該 userId → 登入為 admin（平台管理員，全租戶可讀）
-- 2) tenants.admin_line_user_id = 該 userId → 登入為 store（僅本租戶資料）
-- 3) 兩者皆無 → LINE Login 驗證過也回 403
ALTER TABLE tenants ADD COLUMN admin_line_user_id TEXT;

-- 測試店家：老張五金（lao-zhang），管理者為 Fish 本人 LINE userId
INSERT INTO tenants (id, slug, name, admin_line_user_id, status, created_at)
VALUES ('t-lao-zhang', 'lao-zhang', '老張五金', 'U4e82e03e3cd09d5d164ec1da341e76eb', 'bound', '2026-10-31');

-- 同一 userId 也在 platform_admins → 以 admin 身分登入（優先序：先查 platform_admins）
INSERT INTO platform_admins (line_user_id) VALUES ('U4e82e03e3cd09d5d164ec1da341e76eb');
