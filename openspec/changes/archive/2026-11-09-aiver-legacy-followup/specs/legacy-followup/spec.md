## Purpose

定義第一代 AIVER 遺留的資料庫與程式的處理條件。

## ADDED Requirements

### Requirement: 舊資料庫刪除需同意
刪除舊 D1 `line-ai-saas-db` 前,系統 SHALL 先列出資料表與筆數並取得老魚同意。

#### Scenario: 刪除前確認
- **WHEN** 準備刪除 `line-ai-saas-db`
- **THEN** 先列出各表筆數並取得老魚同意,刪除後附查詢不存在的證據

##### Example: 目前內容
- **GIVEN** 2026-11-09 的唯讀查詢結果
- **WHEN** 列出資料表筆數
- **THEN** tenants 1、faqs 1、conversations 6、usage_counters 1、platform_admins 1、audit_events 5

### Requirement: 舊版提交功能需比對
系統 SHALL 在放棄舊版程式前,產出 86 個未推送提交的功能對照表。

#### Scenario: 產出對照表
- **WHEN** 比對完成
- **THEN** 對照表逐項標示「已在 agent-aiver 重做」或「未重做」

##### Example: 對照表一列
- **GIVEN** 舊版有一個提交新增常見問答功能
- **WHEN** 在 agent-aiver 找到對應路由與測試
- **THEN** 該列標示「已重做」並附檔案路徑
