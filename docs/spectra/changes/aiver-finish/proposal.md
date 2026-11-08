## Why

LINE AI 助理(AIVER)目前能跑,但知識庫是測試資料、法律頁面是範本,不能交給真店家使用。要補齊這些才算上線就緒。

## What Changes

- 知識庫換成真實營業時間、商品與常見問答。
- 法律頁面(隱私權政策、服務條款)換成正式版。
- 管理後台「連接 Cloudflare」授權在 `admin.aiver.me` 重跑並驗證。
- 語系只留繁體中文,缺鍵時退回繁中。
- 重設密碼信走完整流程驗證。
- 整合版本交老魚手機真人驗收一次。

## Non-Goals

- 不處理底座 `opcos-cf-starter` 與 BNI 資源(屬 `aiver-base-cleanup`)。
- 不新增機器人功能。

## Capabilities

### New Capabilities

- `aiver-launch-readiness`: AIVER 上線前的內容、授權、語系與流程就緒條件。

### Modified Capabilities

## Impact

`apps/agent-aiver`(知識庫資料)、`apps/saas`(法律頁面、授權按鈕、語系)、`apps/marketing`(法律連結)。
