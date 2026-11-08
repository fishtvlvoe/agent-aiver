# aiver-launch-readiness Specification

## Purpose

定義 AIVER 對外上線前必須成立的內容、授權、語系與流程條件,讓真店家可直接使用。

## Requirements

### Requirement: 知識庫使用通用範例店家資料
系統 SHALL 在測試階段使用通用範例店家的營業時間、商品與常見問答,SHALL NOT 保留先前的假資料(運費、批發價等)。

#### Scenario: 詢問營業時間
- **WHEN** 顧客在 LINE 詢問營業時間
- **THEN** 機器人回覆的內容與店家提供的營業時間一致

##### Example: 營業時間問答
- **GIVEN** 知識庫記載「週一至週六 10:00–19:00,週日公休」
- **WHEN** 顧客傳送「你們幾點開?」
- **THEN** 機器人回覆含「10:00」與「19:00」,不回覆先前假資料的時間


<!-- @trace
source: aiver-finish
updated: 2026-11-09
code:
  - docs/knowledge-base-template.md
  - apps/marketing/content/legal/privacy-policy.md
  - apps/marketing/package.json
  - apps/marketing/app/[locale]/legal/[...path]/page.tsx
  - packages/i18n/translations/zh-TW/saas.json
  - scripts/smoke-live.sh
  - scripts/phone-smoke.mjs
  - apps/saas/modules/shared/components/Footer.tsx
  - apps/marketing/content-collections.ts
  - docs/decisions.md
  - docs/legal-pages-status.md
  - package.json
  - apps/saas/wrangler.jsonc
  - apps/marketing/content/legal/terms.md
-->

---
### Requirement: 法律頁面為正式版
系統 SHALL 提供正式的隱私權政策與服務條款頁面,且首頁與註冊頁 SHALL 連到這兩頁。

#### Scenario: 開啟隱私權政策
- **WHEN** 訪客從首頁點選隱私權政策
- **THEN** 顯示正式版文字,不含範本佔位文字

##### Example: 佔位字檢查
- **GIVEN** 隱私權政策頁 `/legal/privacy`
- **WHEN** 搜尋頁面文字中的「Lorem」「範本」「佔位」
- **THEN** 命中數為 0


<!-- @trace
source: aiver-finish
updated: 2026-11-09
code:
  - docs/knowledge-base-template.md
  - apps/marketing/content/legal/privacy-policy.md
  - apps/marketing/package.json
  - apps/marketing/app/[locale]/legal/[...path]/page.tsx
  - packages/i18n/translations/zh-TW/saas.json
  - scripts/smoke-live.sh
  - scripts/phone-smoke.mjs
  - apps/saas/modules/shared/components/Footer.tsx
  - apps/marketing/content-collections.ts
  - docs/decisions.md
  - docs/legal-pages-status.md
  - package.json
  - apps/saas/wrangler.jsonc
  - apps/marketing/content/legal/terms.md
-->

---
### Requirement: Cloudflare 授權可用
管理後台「連接 Cloudflare」 SHALL 在 `admin.aiver.me` 完成授權並回到後台。

#### Scenario: 完成授權
- **WHEN** 管理者點選連接 Cloudflare 並同意授權
- **THEN** 回到 `admin.aiver.me` 並顯示已連接


<!-- @trace
source: aiver-finish
updated: 2026-11-09
code:
  - docs/knowledge-base-template.md
  - apps/marketing/content/legal/privacy-policy.md
  - apps/marketing/package.json
  - apps/marketing/app/[locale]/legal/[...path]/page.tsx
  - packages/i18n/translations/zh-TW/saas.json
  - scripts/smoke-live.sh
  - scripts/phone-smoke.mjs
  - apps/saas/modules/shared/components/Footer.tsx
  - apps/marketing/content-collections.ts
  - docs/decisions.md
  - docs/legal-pages-status.md
  - package.json
  - apps/saas/wrangler.jsonc
  - apps/marketing/content/legal/terms.md
-->

---
### Requirement: 介面只提供繁體中文
系統 SHALL 只提供繁體中文介面;缺少翻譯鍵時 SHALL 退回繁體中文。

#### Scenario: 缺少翻譯鍵
- **WHEN** 某文字在目前語系沒有翻譯
- **THEN** 顯示繁體中文文字,不顯示鍵名

##### Example: 退回繁中
- **GIVEN** 瀏覽器語言為 en,且某按鈕在 en 沒有翻譯鍵
- **WHEN** 開啟含該按鈕的頁面
- **THEN** 按鈕顯示繁體中文,不顯示 `common.save` 這類鍵名


<!-- @trace
source: aiver-finish
updated: 2026-11-09
code:
  - docs/knowledge-base-template.md
  - apps/marketing/content/legal/privacy-policy.md
  - apps/marketing/package.json
  - apps/marketing/app/[locale]/legal/[...path]/page.tsx
  - packages/i18n/translations/zh-TW/saas.json
  - scripts/smoke-live.sh
  - scripts/phone-smoke.mjs
  - apps/saas/modules/shared/components/Footer.tsx
  - apps/marketing/content-collections.ts
  - docs/decisions.md
  - docs/legal-pages-status.md
  - package.json
  - apps/saas/wrangler.jsonc
  - apps/marketing/content/legal/terms.md
-->

---
### Requirement: 重設密碼完整流程
系統 SHALL 寄出連到 `admin.aiver.me` 的重設信,且使用者 SHALL 能依信中連結改密碼並以新密碼登入。

#### Scenario: 重設後登入
- **WHEN** 使用者點信中連結、設定新密碼
- **THEN** 能以新密碼登入,舊密碼失效

##### Example: 以測試信箱走完重設
- **GIVEN** 測試帳號 `fish-xiaoou@agentmail.to` 已註冊
- **WHEN** 請求重設、從 AgentEmail 讀到以 `https://admin.aiver.me/api/auth/reset-password/` 開頭的連結、設定新密碼
- **THEN** 新密碼登入回應 200,舊密碼登入回應 401

<!-- @trace
source: aiver-finish
updated: 2026-11-09
code:
  - docs/knowledge-base-template.md
  - apps/marketing/content/legal/privacy-policy.md
  - apps/marketing/package.json
  - apps/marketing/app/[locale]/legal/[...path]/page.tsx
  - packages/i18n/translations/zh-TW/saas.json
  - scripts/smoke-live.sh
  - scripts/phone-smoke.mjs
  - apps/saas/modules/shared/components/Footer.tsx
  - apps/marketing/content-collections.ts
  - docs/decisions.md
  - docs/legal-pages-status.md
  - package.json
  - apps/saas/wrangler.jsonc
  - apps/marketing/content/legal/terms.md
-->