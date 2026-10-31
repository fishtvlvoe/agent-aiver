# ai-reply-engine Specification

## Purpose

LINE webhook 收到客人訊息後，驗證簽名、依該租戶知識庫呼叫模型、以 Reply API 回覆，並把對話標記為 resolved / handoff / missed 之一寫入紀錄。含費用安全機制（速率限制＋月上限）、租戶隔離、模型 provider failover。

## ADDED Requirements

### Requirement: webhook 收訊與簽名驗證

系統 SHALL 以 URL 路徑中的店代號識別租戶，並以該租戶的 channel secret 驗證 LINE 簽名。

#### Scenario: 簽名正確，進入處理

- **GIVEN** 租戶 lao-zhang 已連線
- **WHEN** LINE 推訊息至 `POST /webhook/lao-zhang`，簽名正確
- **THEN** 系統以 lao-zhang 的 channel secret 驗算 `X-Line-Signature` 通過
- **AND** 進入 AI 回覆流程

#### Scenario: 簽名錯誤一律拒絕

- **WHEN** 任一 webhook 請求簽名驗算失敗
- **THEN** 回應 401，不呼叫模型、不寫任何資料

### Requirement: 只依知識庫回答

模型回覆 SHALL 只根據該租戶的知識庫內容；知識庫沒有的資訊不得編造。

#### Scenario: 知識庫有答案

- **GIVEN** 知識庫有「週日公休。平日 11:00–20:00。」
- **WHEN** 客人問「你們週日有開嗎？」
- **THEN** 回覆內容包含週日公休資訊
- **AND** 對話標記為 resolved

#### Scenario: 知識庫沒有答案 → 未命中

- **WHEN** 客人問知識庫未涵蓋的問題
- **THEN** 回覆兜底話術「這題我確認後回覆您」
- **AND** 對話標記為 missed，出現在後台未命中問題清單

##### Example:
- 客人問「有賣寵物餐嗎」、知識庫只有運費/營業時間/退換貨 → 回覆「這題我確認後回覆您」，conversations.status = `missed`

#### Scenario: 不得編造價格或時間

- **WHEN** 客人問知識庫沒有的折扣碼或價格
- **THEN** 回覆不得包含任何自創折扣碼、價格或時間

##### Example:
- 知識庫無折扣資訊，客人問「折扣碼多少」→ 回覆走 missed 兜底，字串中無 `%`、`NT$`、代碼格式字串

### Requirement: 轉真人機制

客人明確要求真人，或問題超出 AI 處理範圍時，系統 SHALL 轉交真人並給予客人明確回覆。

#### Scenario: 客人要求真人

- **WHEN** 客人訊息表達要找真人（如「我要找真人」「客服」）
- **THEN** 回覆「已幫您轉達，真人會盡快回覆」
- **AND** 對話標記為 handoff，後台待真人處理計數 +1

### Requirement: 費用安全雙煞車

系統 SHALL 實作 per-user 速率限制與 per-tenant 月上限，防止 AI 費用失控。

#### Scenario: 同一客人 1 分鐘內第 4 次

- **GIVEN** 同一 userId 在 60 秒內已收到 3 次 AI 回覆
- **WHEN** 第 4 則訊息進來
- **THEN** 不回 AI 內容，回覆「請稍等，我們盡快回覆」
- **AND** 記錄 rate_limited 事件（不對客人暴露被限制）

#### Scenario: 達到月上限後降級

- **GIVEN** 租戶本月已用 5,000 則
- **WHEN** 新訊息進來
- **THEN** 不呼叫模型，回覆「店家將盡快親自回覆您」
- **AND** 後台用量顯示 5,000/5,000 與超限標示

### Requirement: 租戶資料隔離

任一租戶的 webhook、知識庫、對話紀錄 SHALL 只能被該租戶與平台管理員存取。

#### Scenario: webhook 只用該租戶的金鑰與知識庫

- **WHEN** 處理 `/webhook/lao-zhang` 的訊息
- **THEN** 回覆使用 lao-zhang 的 access token，prompt 只含 lao-zhang 的知識庫

#### Scenario: 店家 API 只回自己的資料

- **WHEN** lao-zhang 的管理者呼叫 `/api/conversations`
- **THEN** 每一列的 tenant_id 都是 lao-zhang

### Requirement: 模型 provider failover

模型呼叫 SHALL 抽象為可插拔 provider；主要供應商失敗時自動切備援並記錄。

#### Scenario: 主要供應商逾時自動切換

- **GIVEN** 主要 provider 回應超過 10 秒
- **WHEN** Worker 呼叫主要 provider 失敗
- **THEN** 自動改呼叫備援 provider
- **AND** 客人仍收到回覆
- **AND** 記錄 failover 事件供中台查看

#### Scenario: 全部供應商失敗

- **WHEN** 所有 provider 都失敗
- **THEN** 回覆客人「目前忙碌，請稍後再傳」
- **AND** 記錄事件，不回傳錯誤細節給客人

##### Example:
- 主備 provider 皆逾時 → 客人收到「目前忙碌，請稍後再傳」，audit_events 寫入 `event=all_providers_failed` 含兩家錯誤細節
