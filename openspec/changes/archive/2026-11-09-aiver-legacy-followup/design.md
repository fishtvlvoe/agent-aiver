## Context

`line-ai-saas-db` 於 2026-11-09 唯讀查看:tenants 1、faqs 1、conversations 6、usage_counters 1、platform_admins 1、audit_events 5。舊版程式共 101 個提交,86 個未推送,內含 `.env`。

## Decisions

- D1 先保留不動,老魚說「先看」;刪除前再列資料並取得同意。
- 比對只讀舊版提交紀錄與 agent-aiver 的檔案與路由,產出對照表,不修改任何一邊。
- 舊版程式留在本機,不推 GitHub。

## Risks

- 舊 D1 可能含仍需要的設定,刪除前須比對 agent-aiver 是否已涵蓋。
