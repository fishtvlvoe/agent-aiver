# agent-aiver 舊版 86 個未推送提交 對照表

舊版：`agent-aiver-legacy-worker`（main，@{u}..HEAD，共 86 筆）
新專案：`agent-aiver-push`（apps/agent-aiver、packages/）

| 提交 | 功能（提交標題） | 狀態 | 新專案對應路徑 | 備註 |
|---|---|---|---|---|
| 6a4333c | feat(prompt): 稱呼客人用「你」 | 已重做 | apps/agent-aiver/src/lib/prompt.js |  |
| 46fb285 | feat(prompt): 兜底句改為「我確認後，再回覆你」，分類改用寬鬆比對 | 已重做 | apps/agent-aiver/src/lib/outcome.js; apps/agent-aiver/src/lib/prompt.js |  |
| 1488f15 | fix(provider): 三則 system 合併為單一 system，修 Gemini 忽略鐵則 | 已重做 | apps/agent-aiver/src/providers/official.js |  |
| 8ad32ff | test: tenant 欄位含 persona | 已重做 | apps/agent-aiver/test/store.test.js |  |
| d9373d5 | test: 兩個測試載入 persona 遷移 | 已重做 | apps/agent-aiver/test/cf-oauth-refresh.test.js; apps/agent-aiver/test/store.test.js |  |
| 874129a | test: 加 persona 遷移 fixture | 已重做 | apps/agent-aiver/test/fixtures/bot-migrations/0009_bot_store_persona.sql |  |
| 7a8682b | feat(prompt): 讀取店家自訂說話風格 persona | 已重做 | apps/agent-aiver/src/lib/prompt.js; apps/agent-aiver/src/lib/store.js; packages/api/modules/bot/procedures/save-persona.ts |  |
| 494956a | feat(prompt): 加入客服人格,口語親切、不機器人口吻 | 已重做 | apps/agent-aiver/src/lib/prompt.js |  |
| 2623bcd | fix: webhook 有 ctx 時背景處理並先回 200，避免 AI 呼叫拖慢被取消 | 已重做 | apps/agent-aiver/src/webhook.js; apps/agent-aiver/src/index.js |  |
| 2a9d06e | feat: Cloudflare OAuth 自動續期(ensureFreshCfToken)與 invalid 狀態閘 | 已重做 | apps/agent-aiver/src/lib/cf-oauth-refresh.js; packages/api/modules/bot/lib/cf-oauth.ts |  |
| 7a6e892 | chore: 封存 line-admin-on-starter | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 1c6ac1c | docs: 勾 4.5 驗收通過 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 89cc5f2 | docs: 勾選 6.3 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 58cab24 | docs: 勾選 5.6 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 2abdffc | docs: 勾選 5.5 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 9456c6a | docs: 勾選 6.2 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| b63c56f | fix: Cloudflare Account ID 格式錯時不得退回平台模型;補金鑰檢查測試 | 已重做 | apps/agent-aiver/src/reply.js; apps/agent-aiver/test/model-key-gate.test.js |  |
| 9ced687 | docs: 勾選 7.5 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| a677eff | docs: 勾選 7.1-7.4 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| fe5ee1c | docs: 新增第 7 組店家入口任務 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 7a4a0a8 | docs: 勾選 6.4 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| c50d265 | docs: 勾選 6.1 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| a06fac9 | feat: 核心支援 Cloudflare AI 供應商(店家自填 Account ID + Token) | 已重做 | apps/agent-aiver/src/lib/providers-catalog.js; packages/api/modules/bot/cloudflare-provider.test.ts |  |
| d8dc72b | docs: 勾選 5.1-5.4 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 3c68c5b | feat: 店家自填 AI 金鑰閘道(未開通平台模型且無自有金鑰不回覆) | 已重做 | apps/agent-aiver/src/reply.js; apps/agent-aiver/test/no-model-gate.test.js; packages/api/modules/bot/model-key-gate.test.ts |  |
| 82826c6 | docs: 新增第 6 組 Cloudflare AI 任務 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| e4694c4 | fix: 舊平台金鑰解不開時略過,改走 env 預設模型 | 已重做 | apps/agent-aiver/src/reply.js |  |
| c725ba7 | fix: 解密金鑰優先用 CREDENTIAL_ENC_KEY(與底座一致) | 已重做 | apps/agent-aiver/src/lib/crypto.js; packages/api/modules/bot/lib/crypto.ts |  |
| 85be438 | docs: 勾選 4.4 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| bdf891e | chore: 核心改綁底座 D1 opcos-cf-starter | 已重做 | apps/agent-aiver/wrangler.toml | 改為獨立 D1 agent-aiver-db，不沿用 opcos-cf-starter |
| e2cc6a8 | docs: 勾選 4.3 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 90b3ca9 | docs: 勾選 4.2 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| ee1ddd9 | docs: 勾選 1.7 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 7935f97 | feat(core): 首次簽章驗證成功寫入 lineSecretVerifiedAt | 已重做 | apps/agent-aiver/src/lib/store.js; apps/agent-aiver/src/webhook.js; packages/database/drizzle/migrations/0005_bot_store_secret_verified.sql |  |
| 6b27559 | docs: line-admin-on-starter 勾選 3.2 3.3 4.1 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| f2c94a7 | feat(web): 舊後台頁面下線,首頁改為搬家提示 | 不適用 | — | 舊後台網頁 web/，新專案不含 |
| f0f0c8d | test(core): 移除舊後台測試 | 不適用 | — | 舊後台測試 |
| 6db064f | feat(core): 舊後台 API 下線(/api/* 回 410,/api/bind 不再可用) | 已重做 | apps/agent-aiver/src/index.js | /api/* 回 410 |
| 4178b76 | docs: SR 草稿指向正式 change | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| a947d60 | docs: 建立 Spectra change line-admin-on-starter | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 9b4349b | docs: SR 進度補記 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 32d9f98 | test(core): 月上限自訂與預設 | 已重做 | apps/agent-aiver/test/monthly-limit.test.js |  |
| d17f9e8 | feat(core): 月上限改讀店家設定 | 已重做 | apps/agent-aiver/src/lib/store.js; apps/agent-aiver/src/reply.js; packages/database/drizzle/migrations/0004_bot_store_monthly_limit.sql |  |
| dcd4adc | docs: SR 每月上限可設定 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 4bf2ddb | test(core): 核心測試改用新資料表假 D1 | 已重做 | apps/agent-aiver/test/webhook.test.js; apps/agent-aiver/test/store.test.js |  |
| d71cd56 | feat(core): 機器人核心改讀底座資料表(store.js) | 已重做 | apps/agent-aiver/src/lib/store.js; apps/agent-aiver/src/webhook.js; apps/agent-aiver/src/reply.js | guard.js 不搬（舊後台登入用） |
| ff5dc20 | docs: SR 核心接法 5a-5d | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| fc38668 | docs: SR 補資料庫接法 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 51b49a4 | docs: SR 指標更新 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 1c1d589 | docs: SR 補示範頁簽收決定 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 51a8afd | docs: 後台換底座 SR 草稿 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| fa38dc3 | docs: 新增免費版 SR line-ai-saas-free-signup 與換底座對焦紀錄 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 6f8400a | docs: 底座 LINE 登入已合併 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 0b09186 | docs: 交接補 LIFF 登入評估 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| defb508 | docs: 後台換底座交接說明 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| f3e1fa2 | docs: 記錄後台換共用底座決定 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 3d6ecc7 | docs: 記錄 C18 儀表板跳轉與 C19 多帳號綁定 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 20e4c10 | docs: 記錄 C9 驗收結果與免費模型預設需求 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| d256823 | fix: 修正中台進入店家永遠失敗（api() 回傳已解析資料） | 不適用 | — | 舊後台 web/console.html |
| 7616869 | docs: C5 完整流程（解除封鎖後進後台） | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 13e8060 | docs: C5 重測結果（Aggressive 生效，需解除封鎖才能進後台） | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| d9ad3ed | docs: 老魚決定後台強制加好友，待開 LIFF aggressive 後重測 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 076e385 | docs: C5 老魚確認手機帳號為店家管理員 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| bc02b07 | docs: C5 未加好友實機測試結果 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 83745a4 | docs: liff-debug C7/C8 勾選 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 2467007 | docs: mvp flow-status 更新關 3 結果 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| b0fdb24 | docs: liff-debug C15 實機重看觀察 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 4a5b37b | docs: liff-debug C14 勾選（靜態資源加版本號並部署） | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 04af5a4 | fix(build): 靜態資源加內容雜湊版本號，避免 WebView 吃到舊 CSS／JS | 不適用 | — | 舊後台靜態資源 scripts/build.js |
| 03c2a74 | docs: liff-debug C13 勾選、新增 C14 防快取 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| ed19d43 | docs(acceptance): 補 C13 Android 實機只讀走查紀錄 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 1fed535 | docs: liff-debug C12 勾選（☰ 選單已修並部署） | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| d58af25 | fix(ui): 選單與返回中台改用 addEventListener，修手機 ☰ 打不開 | 不適用 | — | 舊後台 web/ 選單 |
| a712596 | docs: liff-debug C11 查證結果、新增 C12/C13 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| e569e76 | docs: liff-debug C10 勾選（模型頁已修並部署） | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| fbfb9e2 | fix(ui): 模型頁供應商下拉預設、單選排版、模型可選清單 | 不適用 | — | 舊後台 web/ 模型頁 |
| 31c9403 | docs: liff-debug C6 結果與新增 C10/C11，驗收意見補 2~5 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| b01b933 | fix(width): 對話頁不存截圖，避免客戶訊息外流到本機檔案 | 不適用 | — | 舊後台對話頁截圖 |
| 7cd7cc1 | test(width): 新增寬度掃描腳本 width-scan.mjs（逐頁×寬度檢查橫向溢出與截圖） | 不適用 | — | 舊後台寬度掃描腳本 |
| d6facbb | docs: liff-debug C3 勾選；C4/C5 記錄手機已登入的實況 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| bc07a89 | docs: 補 LIFF 實測結論與店家管理員開通步驟 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| 2932700 | test: 驗證 web/fmt.js 由 build 產生且與 src/lib/format.js 輸出一致（問題 5） | 不適用 | — | 舊後台 web/fmt.js 同步測試 |
| b0e3405 | docs: liff-debug C1 勾選、C4 縮小範圍（授權留老魚） | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| c26ba46 | docs: liff-debug SR 補完整（情境、待做分工、中午驗收清單、邊界）＋驗收意見清單 | 不適用 | — | 純文件／勾選（新專案 docs 另立） |
| b6784fb | feat: Gemini 為主、OpenAI 備援 | 已重做 | apps/agent-aiver/src/providers/official.js; apps/agent-aiver/test/providers.test.js |  |
| 542938a | fix: Gemini 改用獨立 GEMINI_MODEL（預設 gemini-3.5-flash-lite）、診斷 log 移除 key 末碼、header 統一 Authorization；補 liff-debug tasks.md | 已重做 | apps/agent-aiver/src/lib/providers-catalog.js; apps/agent-aiver/src/providers/failover.js; apps/agent-aiver/src/providers/official.js |  |

## 統計

- 已重做：24
- 未重做：0
- 不適用：62
