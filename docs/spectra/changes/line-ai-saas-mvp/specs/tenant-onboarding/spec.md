# tenant-onboarding Specification

## Purpose

讓一家新店從「什麼都沒有」到「機器人上線自動回覆」，全程自助、不需要平台方人力。涵蓋租戶建立、LINE channel 金鑰綁定、驗證、webhook 網址發放與金鑰保密。

## ADDED Requirements

### Requirement: 租戶以專用店代號建立

系統 SHALL 為每個新租戶產生唯一店代號（slug），作為 webhook 路徑與未來子網域的識別字。

#### Scenario: 建立租戶

- **WHEN** 一個新的註冊流程完成（第一版由平台管理員或初始種子建立 tenant 記錄）
- **THEN** 系統建立 tenants 記錄，含 slug、名稱、狀態為未連線
- **AND** slug 在系統內唯一，重複時建立失敗並回錯誤

##### Example:
- slug `lao-zhang` 不存在 → 建立成功，回傳 `{slug: "lao-zhang", status: "unbound"}`
- slug `lao-zhang` 已存在 → 回 `{error: "slug_taken"}`，不建列

### Requirement: 店家貼金鑰自助綁定

店家 SHALL 能在後台輸入 LINE channel secret 與 channel access token，系統驗證有效後啟用。

#### Scenario: 金鑰有效，綁定成功

- **GIVEN** 租戶已建立且狀態未連線
- **WHEN** 店家送出有效的 channel secret 與 access token
- **THEN** 系統以 access token 呼叫 LINE API 驗證（例如取得 bot info）
- **AND** 驗證成功後狀態變為已連線
- **AND** 回傳專用 webhook 網址 `/webhook/<slug>`
- **AND** 兩把金鑰存入 secrets，資料庫只存遮罩（`••••` + 末四碼）

#### Scenario: 金鑰無效

- **WHEN** 店家送出 LINE 拒絕的 access token
- **THEN** 系統回「金鑰無效，請確認後重試」
- **AND** 狀態維持未連線

##### Example:
- 送入 access token `invalid-token-123` → LINE API 回 401 → 畫面顯示「金鑰無效，請確認後重試」，tenants.status 仍是 `unbound`

### Requirement: 金鑰明文任何身分都拿不到

系統 SHALL 保證 channel secret 與 access token 的明文只存在 Worker secrets，任何 API、任何身分（含平台管理員）都只能看到遮罩。

#### Scenario: 讀取金鑰一律遮罩

- **GIVEN** 租戶已完成綁定
- **WHEN** 店家或平台管理員呼叫任何回傳金鑰的 API
- **THEN** 只回傳 `••••` + 末四碼，不回傳明文

#### Scenario: 更新金鑰

- **WHEN** 店家重新貼上兩把金鑰並儲存
- **THEN** secrets 更新、遮罩更新，過程中 webhook 短暫以舊值處理中訊息直到切換完成

##### Example:
- 舊遮罩 `••••a1b2`、新 token 尾四碼 `z9y8` → 儲存後畫面顯示 `••••z9y8`，下一則 webhook 以新金鑰驗簽
