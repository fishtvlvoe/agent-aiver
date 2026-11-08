## Why

`aiver-base-cleanup` 封存時留下兩件第一代 AIVER 的後續:舊 D1 `line-ai-saas-db` 的少量測試資料,與舊版程式 86 個未推送提交的功能比對。這兩件不阻擋清理封存,獨立成這張 SR。

## What Changes

- 處理舊 D1 `line-ai-saas-db`(保留或刪除,刪除需老魚同意)。
- 比對 `agent-aiver-legacy-worker` 的 86 個未推送提交,列出已在 agent-aiver 重做與未重做的功能。

## Non-Goals

- 不把舊版程式推上 GitHub(內含 `.env`)。
- 不在未取得老魚同意前刪除任何外部資源。

## Capabilities

### New Capabilities

- `legacy-followup`: 第一代 AIVER 遺留資料與程式的處理條件。

### Modified Capabilities

## Impact

D1 `line-ai-saas-db`、本機 `B-產品/products/agent-aiver-legacy-worker`、`agent-aiver`。
