-- 任務 1.2：LINE AI SaaS 初始資料表

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE,
  name TEXT,
  line_secret_mask TEXT,
  line_token_mask TEXT,
  llm_key_mask TEXT,
  model_mode TEXT DEFAULT 'platform',
  model_base_url TEXT,
  model_name TEXT,
  status TEXT DEFAULT 'unbound',
  created_at TEXT
);

CREATE TABLE faqs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  question TEXT,
  answer TEXT,
  updated_at TEXT
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  user_text TEXT,
  ai_text TEXT,
  status TEXT,
  created_at TEXT
);

CREATE TABLE usage_counters (
  tenant_id TEXT,
  month TEXT,
  count INTEGER,
  PRIMARY KEY (tenant_id, month)
);

CREATE TABLE platform_admins (
  line_user_id TEXT PRIMARY KEY
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  event TEXT,
  detail TEXT,
  created_at TEXT
);
