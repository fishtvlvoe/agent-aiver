## Why

市售 LINE 店家機器人方案（如 keiitsu quote-dashboard）以 n8n + VPS 架構每月向小店收取 NT$1,400+，其中 97% 是過時的常開主機費用。本專案用 Cloudflare Worker（免費額度）重構同一服務為多租戶 SaaS，讓 Fish 能以 10~20 倍成本優勢銷售給多個店家。

## What Changes

- 新建多租戶 SaaS 專案 `B-產品/Cloudflare-Worker-Line`：Cloudflare Worker（webhook + API）＋ Cloudflare Pages（靜態三層界面）＋ D1/KV
- 新能力「租戶自助綁定」：店家在後台自行貼上 LINE channel secret / access token，系統驗證並啟用，產生專用 webhook 網址 `/webhook/<tenant_slug>`
- 新能力「AI 客服回覆」：LINE webhook 收訊 → 驗簽 → 依該租戶知識庫組 prompt → 呼叫模型（可插拔後端，官方 API 主、mirasim 備援）→ Reply API 回覆 → 寫對話紀錄
- 新能力「對話營運」：對話紀錄標記 resolved / handoff（客人要求真人或 AI 判斷超範圍）/ missed（未命中），後台可篩選，未命中可一鍵轉 FAQ
- 新能力「費用安全機制」：每客人 1 分鐘最多 3 次回覆（速率限制）＋ 每租戶每月 5,000 則 AI 回覆上限，超限降級為「店家將盡快親自回覆」
- 新能力「三層網頁界面」：Landing Page（行銷＋LINE Login 入口）／店家後台（知識庫、對話紀錄、綁定設定、用量）／平台中台（Fish 管全部店家、啟用停用、模型與用量）
- 新能力「響應式 UI」：≥1024px 側邊欄＋表格；768–1023px 漢堡＋雙欄卡片；<768px 漢堡＋底部導覽＋單欄卡片（LIFF 手機優先）；圖示一律 SVG
- 資料表：tenants、faqs、conversations（含 status）、usage_counters、audit_events

## Non-Goals

- 不做付款／訂閱（既有金流程式碼後續 SR 接入）
- 不做優惠券、集點卡、問卷、群發排程（後續 SR）
- 不做店家員工身分（第一版僅平台管理員＋店家兩種）
- 不經營 mirasim 折扣 tunnel（路線 B 僅保留可插拔介面，預設官方 API）
- 不自動代店家建立 LINE 官方帳號（永遠需要店家本人在 LINE 後台操作）

## Capabilities

### New Capabilities

- `tenant-onboarding`: 店家註冊租戶、貼金鑰綁定 LINE channel、驗證與啟用、產生專用 webhook 網址；金鑰遮罩與明文保護
- `ai-reply-engine`: LINE webhook 收訊驗簽、依租戶知識庫組 prompt 呼叫模型、Reply 回覆、對話紀錄寫入（含 resolved/handoff/missed 狀態判定、費用安全機制、租戶隔離、模型 failover）
- `store-admin-web`: 店家後台（知識庫編輯、對話紀錄篩選、綁定設定、用量檢視）＋ Landing Page＋平台中台，響應式三裝置、SVG 圖示、儲存回饋、1024px 表格/卡片分界

### Modified Capabilities

（無——本 change 全部為新能力）

## Impact

- 新專案目錄：`B-產品/Cloudflare-Worker-Line/`（Worker 原始碼 `src/`、前端 `web/`、測試 `test/` 與 `e2e/`、wrangler 設定）
- Cloudflare 資源：Workers（免費額度）、Pages、D1、KV namespace
- 外部 API：LINE Messaging API（Reply／驗證 token）、OpenAI 或 DeepSeek 官方 API（模型）
- 金鑰保管：channel secret/access token、模型 API key 一律 wrangler secrets，畫面只顯示遮罩
- 設計規範：`docs/DESIGN.md`（opcosv2 版）＋ demo HTML 四份（`docs/demo/`）
- 決策紀錄：`docs/sr-drafts/line-ai-saas-notes.md`、詞彙表 `CONTEXT.md`、Gherkin 劇本 `e2e/features/`
