# Tasks — line-ai-saas-mvp

> 難度標記：[輕] < 30 分鐘 / [中] 半天內 / [重] 登入、權限一律重。
> 規格需求對照：tenant-onboarding（TO）、ai-reply-engine（RE）、store-admin-web（WEB）三個 capability 的需求名稱標於各 task。
> Gherkin 對照：B＝後端（e2e/features/backend/backend.feature.md）、F＝前端（e2e/features/frontend/frontend.feature.md）。
> 三種身分測試帳號：① 平台管理員＝Fish 的 LINE userId（寫入 platform_admins 表）；② 測試店家＝新建專用 LINE 測試 OA（lao-zhang 測試租戶，Fish 建立 channel 後金鑰以 wrangler secret 設定）；③ 測試客人＝開發者的 LINE 帳號加測試 OA 好友，用手機實傳驗收。切換方式：身分差以 LINE userId 區分，登入後依身分路由 /admin（店家）或 /console（管理員）；客人身分不需登入。
> 每個 task 須程式、focused test、node --test 全綠、行為驗證過才勾選。標 e2e 的 task 須 e2e 全綠才可勾。


## 規格需求對照表（供 analyze 覆蓋度比對，實作以此表＋上方任務為準）

| 規格需求 | 對應任務 |
|---|---|
| 租戶以專用店代號建立 | 8.1 |
| 店家貼金鑰自助綁定 | 7.1 |
| 金鑰明文任何身分都拿不到 | 7.2 |
| webhook 收訊與簽名驗證 | 2.1、2.2 |
| 只依知識庫回答 | 3.3、3.4、3.5、4.1、4.2 |
| 轉真人機制 | 5.1 |
| 費用安全雙煞車 | 6.1、6.2、6.3 |
| 租戶資料隔離 | 8.3、8.4 |
| 模型 provider failover | 3.1、3.2 |
| 三裝置自適應 | 10.4 |
| 圖示一律 SVG | 10.5 |
| 儲存回饋 | 10.6 |
| 對話紀錄三態篩選 | 9.2、10.7 |
| 綁定設定頁 | 10.3 |
| 平台中台 | 9.4、10.8 |
| 格式規範全站一致 | 10.9 |
| 店家自訂模型供應商 | 9.3、10.10 |
| 更新金鑰 | 7.3 |

## 設計決策對照表

| 設計決策 | 對應任務 |
|---|---|
| 每租戶以專用 webhook 路徑識別，簽名用該租戶 channel secret 驗證 | 2.1、8.1 |
| 金鑰一律 wrangler secrets 保管，資料庫與畫面只有遮罩 | 7.2 |
| 模型呼叫抽象為 provider 介面，官方 api 為主、mirasim 為備援 | 3.1、3.2 |
| 店家可自填模型供應商 | 9.3、10.10 |
| prompt 組裝：店家卡＋知識庫全量＋最近 5 句，超過 token 預算則截斷 | 3.3 |
| 對話狀態機：resolved / handoff / missed | 3.4、5.1 |
| 費用雙煞車：per-user 速率限制＋per-tenant 月上限 | 6.1、6.2 |
| 三層界面同庫不同路由：pages 靜態、worker 動態 api | 10.1、10.2、10.3、10.8 |
| 響應式斷點雙層：1024px（表格/卡片）＋768px（卡片欄數） | 10.4 |
| 驗收以 gherkin 劇本為準，三種身分測試帳號先備妥 | 8.6、11.1、11.2 |

## 1. 專案骨架與 D1 schema [輕]

- [x] 1.1 建立專案骨架：`B-產品/Cloudflare-Worker-Line/` 含 `src/`、`web/`、`test/`、`wrangler.toml`（KV binding、D1 binding）、`package.json`（test script = `node --test`）；驗證：`npm test` 空跑通過、`wrangler dev` 起得來
- [x] 1.2 建 D1 六張表（tenants、faqs、conversations、usage_counters、platform_admins、audit_events），含 design.md 定義的欄位與 UNIQUE/PRIMARY KEY；驗證：`wrangler d1 migrations apply` 成功，`.tables` 列出六表

## 2. webhook 收訊與驗簽（對應 REwebhook 收訊與簽名驗證）[重]

- [x] 2.1 需求 webhook 收訊與簽名驗證：實作 `POST /webhook/:tenantSlug`：依 slug 查租戶、以該租戶 channel secret 驗算 X-Line-Signature，失敗回 401 且無副作用（B2 場景二）；驗證：純函式測試 `verifyLineSignature(secret, body, signature)` 涵蓋正確/錯誤/缺 header 三例
- [x] 2.2 驗簽通過後回 200 並把事件交給回覆管線（先接 mock provider）；驗證：e2e 假 LINE payload 正確簽名 → 200，錯誤簽名 → 401（B2 場景一、二）

## 3. AI 回覆核心（對應 RE模型 provider failover與只依知識庫回答）[重]

- [x] 3.1 需求 模型 provider failover：實作 provider 介面 `chat({system, storeCard, faqs, history, maxTokens})` 與 `providers/official.js`（OpenAI 相容、逾時 10 秒、5xx retry 一次）；驗證：mock fetch 測試成功路徑與逾時路徑
- [x] 3.2 實作 failover：主要 provider 失敗自動切備援，全部失敗回目前忙碌，請稍後再傳並寫 audit_events；驗證：mock 雙 provider 測試切換與全滅兩路（B5）
- [x] 3.3 實作 prompt 組裝（system 鐵則＋店家卡＋FAQ 全量＋最近 5 句，輸入 >8K tokens 由最舊對話丟棄）；驗證：組裝函式單測含截斷例
- [x] 3.4 實作 `classifyOutcome(aiReply, userText)` → resolved/missed/handoff（含真人/客服關鍵字）；驗證：Gherkin 對照例全數命中（B2 場景三、四）
- [x] 3.5 透過 LINE Reply API 回覆客人，對話寫入 conversations（含 status）；驗證：mock LINE API 斷言回覆內容與 DB 列（B2 場景一）

## 4. 知識庫鐵則與防編造（對應 RE只依知識庫回答）[中]

- [x] 4.1 需求 只依知識庫回答：知識庫無答案時回這題我確認後回覆您、標 missed（B2 場景三）；驗證：e2e
- [x] 4.2 不得編造價格測試：知識庫無折扣碼時，mock 模型即使回出自創碼也觸發兜底（輸出過濾＋missed 判定）（B2 場景五）；驗證：該測試存在且通過

## 5. 轉真人（對應 RE轉真人機制）[輕]

- [x] 5.1 需求 轉真人機制：真人/客服/轉接關鍵字 → 回已幫您轉達，真人會盡快回覆＋標 handoff＋後台計數 +1（B2 場景四）；驗證：單測關鍵字表與計數

## 6. 費用安全雙煞車（對應 RE費用安全雙煞車）[中]

- [x] 6.1 需求 費用安全雙煞車：KV 滑動窗口速率限制（每 tenant+userId 60 秒 3 次），超限回請稍等，我們盡快回覆並記 rate_limited（B3 場景二）；驗證：純函式＋mock KV 時間序列測試
- [x] 6.2 月上限計數（usage_counters，台灣時區月界），≥5000 降級回店家將盡快親自回覆您不呼叫模型（B3 場景一）；驗證：單測
- [x] 6.3 用量查詢 API `GET /api/usage` 回傳本月 count/limit 與超限標示；驗證：單測

## 7. 租戶綁定與金鑰保密（對應 TO店家貼金鑰自助綁定、金鑰明文任何身分都拿不到）[重]

- [x] 7.1 需求 店家貼金鑰自助綁定：綁定 API `POST /api/bind`：呼叫 LINE API 驗證 token 有效性，成功啟用並回 webhookUrl＋遮罩；失敗回金鑰無效，請確認後重試維持未連線（B1 場景一、二）；驗證：mock LINE API 兩路測試
- [x] 7.2 需求 金鑰明文任何身分都拿不到：金鑰只存 wrangler secrets（`LINE_KEY_<tenant_id>`），DB 只存 `maskSecret`（••••＋末四碼）；任何 API 不回明文（B1 場景三、F4 場景二）；驗證：單測遮罩＋手動呼叫 API 確認無明文
- [x] 7.3 金鑰更新流程（重貼驗證並切換，TO更新金鑰）；驗證：單測更新路徑

## 8. 租戶建立與隔離、身分（對應 TO租戶以專用店代號建立、RE租戶資料隔離）[重]

- [x] 8.1 需求 租戶以專用店代號建立：租戶建立（slug 唯一、初始狀態未連線）與測試種子 lao-zhang；驗證：單測重複 slug 失敗
- [x] 8.2 LINE Login session（LIFF getIDToken 與瀏覽器 OAuth 兩路），session 存 KV TTL 7 天；驗證：登入成功/失敗/過期三例
- [x] 8.3 需求 租戶資料隔離：所有 `/api/*` 依 session 的 tenant_id 過濾資料（B4 場景二）；驗證：跨租戶存取 403 測試
- [x] 8.4 webhook 只用該租戶的金鑰與知識庫（B4 場景一）；驗證：mock 斷言 prompt 只含本戶 FAQ
- [x] 8.5 平台管理員白名單（platform_admins）路由 `/console/*`；驗證：店家 session 存取 /console 403
- [x] 8.6 三種身分測試帳號建立：Fish 的 LINE userId 寫入 platform_admins；測試 OA channel 建為 lao-zhang；驗證：三身分依序登入各自頁面成功

## 9. 後台 API（對應 WEB對話紀錄三態篩選）[中]

- [x] 9.1 FAQ CRUD API（/api/faqs），含 updated_at；驗證：單測四路
- [x] 9.2 對話紀錄 API `GET /api/conversations?status=`（全部/待真人/未命中）；驗證：F3 場景一對照測試
- [x] 9.3 需求 店家自訂模型供應商：模型設定 API `GET/PUT /api/model-settings`（平台預設／自訂供應商：base URL＋API key＋模型名稱；key 存 secrets `LLM_KEY_<tenant_id>`、DB 只存遮罩；儲存前以最低成本請求驗證 key 有效性，無效回金鑰無效不切換）；驗證：mock 供應商測試設定／清除／無效三路的行為與遮罩
- [x] 9.4 中台 API（/api/console/tenants 列表、toggle 啟用停用、平台用量總覽）；驗證：管理員 session 測試通過、店家 session 403

## 10. 前端三層界面 [重]

- [x] 10.1 `web/` 骨架（Vite 或 Astro）＋ DESIGN.md tokens 全域 CSS 變數；驗證：build 成功、變數與 docs/DESIGN.md 一致
- [x] 10.2 Landing Page（價值主張、三步驟、價格、LINE Login 按鈕）；驗證：F6 兩場景 ego-browser 390/1440 截圖
- [x] 10.3 店家後台四頁（知識庫、對話紀錄、綁定設定、用量）照 docs/demo/ 四份定稿 HTML 結構實作（對應 WEB綁定設定頁）；驗證：F2、F3、F4 各場景 ego-browser 走查
- [x] 10.4 響應式三裝置版面（對應 WEB三裝置自適應：1024 側欄＋表格 / 768 漢堡＋雙欄卡片 / <768 漢堡＋底部導覽＋單欄）；驗證：F1 四場景，含 1023/1024 邊界截圖與 scrollWidth===視窗寬斷言
- [x] 10.5 圖示全站 SVG、無 emoji（對應 WEB圖示一律 SVG）；驗證：F4 場景三——script 掃描渲染後 DOM 無 emoji 字元
- [x] 10.6 儲存回饋（成功綠勾 1.5 秒／失敗紅字保留內容，對應 WEB儲存回饋）；驗證：F2 場景二、三 ego-browser
- [x] 10.7 待真人紅點計數（對應 WEB對話紀錄三態篩選）；驗證：F3 場景二 ego-browser
- [x] 10.8 平台中台總覽（KPI 四卡＋店家啟用/停用）；驗證：F5 場景一、二 ego-browser
- [x] 10.9 格式函式（NT$ 千分位、2026/10/31、24h 全站共用，對應 WEB格式規範全站一致）；驗證：函式單測＋畫面抽檢

- [x] 10.10 店家後台設定 → 模型頁（平台預設/自訂切換、三欄表單、遮罩顯示、儲存回饋、清空回預設）；驗證：ego-browser 走查設定→手機問一句→回覆來自自訂模型（mock 或真 key）；並驗證清空後回平台預設

## 11. 收尾 [中]

- [x] 11.1 Gherkin 全量對照（gherkin-trace.md，B1–B5 全測試覆蓋；F1–F6 UI 層排關 3 走查）：B1–B5、F1–F6 每場景有對應測試或人工走查記錄；`node --test` 全綠
- [ ] 11.2 PM 四關驗收：本功能 e2e 全綠、舊功能回歸（本專案無舊功能，標 N/A）、ego-browser 三身分走查、Fish 白話清單驗收
- [ ] 11.3 `flow-status.md` 建立並全程更新；commit + PR（pr skill）；retro 白話 HTML

## Fish 驗收清單（白話版）

1. 手機 LINE 傳一句你們週日有開嗎給測試 OA，30 秒內收到知識庫的答案
2. 傳我要找真人，收到轉達話術；後台待真人出現紅點
3. 傳知識庫沒有的問題，收到確認後回覆您；後台未命中可篩出、可一鍵轉 FAQ
4. 故意傳錯金鑰，看到金鑰無效；全站找不到任何金鑰明文
5. 後台改 FAQ → 按儲存 → 看到綠勾；手機再問一次，答案變了
6. 把月上限改成已用盡的數字，機器人改說店家將盡快親自回覆您
7. 用 390px 和電腦各看一輪：無橫捲、無 emoji 圖示、按鈕構得到
8. 以管理員身分停用測試店家，再傳訊，AI 不回、webhook 回 403
