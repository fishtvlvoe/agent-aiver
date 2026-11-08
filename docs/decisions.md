
## 2026-11-08 決定與回復資料
- 架構不變，只把 LINE 客服（含登入、後台）拉成獨立 repo `agent-aiver` 與獨立 CF 資源；資料全新。
- 切換 app.aiver.me、底座移除客服：驗證通過後再問老魚。
- CF OAuth：沿用既有 OPCOS 用戶端（Client ID 4945fa51a38ffdc8a49fbe6af858f1c1），金鑰重新產生，跳板站與新後台共用 STATE_KEY。
- LINE webhook 切換（老魚當場同意實測）：頻道 AIVER AI 語音助理 Messaging API（2011708742）
  - 舊網址（失敗時改回）：https://line-ai-saas.fishandy1213.workers.dev/webhook/store
  - 新網址：https://agent-aiver.fishandy1213.workers.dev/webhook/fish
舊身分 user,可改回: update user set role='user' where email='fish@fishot.com'

## 2026-11-08 中台與首頁
- 中台（/admin：使用者、機器人店家、組織）程式早已存在；老魚帳號原為 user 進不去，已改 admin（可改回 user）。
- 首頁（apps/marketing）程式在但未部署、文案為範本。老魚決定：先做「精簡一頁」（AIVER 是什麼、怎麼用、登入/註冊按鈕；先拿掉部落格、更新日誌），部署到新網址給老魚看，不換 app.aiver.me（換之前再問）。

## 2026-11-08 寄信改用 ToSend
- 寄件人固定 `fish@aiver.me`，金鑰 `TOSEND_API_KEY` 設為後台 Worker secret（不進版控）。
- 實測：忘記密碼信已寄達 Fish 信箱，內容為繁體中文。
- 首頁移除範本的英文 cookie 橫幅；首頁獨立部署為 `agent-aiver-web`。

## 2026-11-08 換成 aiver.me 短網址
- 首頁 `app.aiver.me`、後台 `admin.aiver.me`、機器人 `bot.aiver.me`；workers.dev 舊網址保留（`workers_dev = true`）。
- LINE 登入回呼已加 `https://admin.aiver.me/api/auth/callback/line`；實測 LINE 登入成功。
- 刪除舊 DNS：`app.aiver.me` CNAME → `agent-aiver.pages.dev`（橘雲開）。復原：重建該 CNAME。
- LINE 機器人 Webhook 尚未切到 bot.aiver.me（最後一步，需實測）。
- 2026-11-08 後續：Pages 專案 `agent-aiver` 已解除 `app.aiver.me` 綁定（專案本身保留）；復原需重綁該網域並重建 CNAME。
- LINE Webhook 已切到 `https://bot.aiver.me/webhook/fish`，LINE Verify 回 Success。舊網址 `https://agent-aiver.fishandy1213.workers.dev/webhook/fish` 仍可用，可隨時切回。

## 2026-11-08 部署改由 Cloudflare 自己建置
- 三個 Worker 已用 Builds API 接上 GitHub repo（push main 即建置部署）：首頁 `agent-aiver-web`、後台 `agent-aiver-admin`、機器人 `agent-aiver`（含 D1 遷移）。手動觸發三個建置皆成功。
- 可重用腳本：`scripts/cf-builds-connect.sh`（一個 Worker 一次呼叫）。
- GitHub 部署步驟待推送自動上線驗證後才移除，只留 test。
- 2026-11-08 驗證：合併 PR #3 後，Cloudflare 三個 Worker 皆自動建置成功並上線。GitHub 工作流程改名 test.yml，只留測試；部署全由 Cloudflare 執行。

## 2026-11-08 測信箱一律用 AgentEmail(老魚定)
- 要驗證任何寄出的信(重設密碼、驗證信、通知),代理自己讀 AgentEmail 信箱,不請老魚轉寄或截圖。
- 設定在 `/Users/fishtv/Development/.env`:`AGENTMAIL_API_KEY`、`AGENTMAIL_INBOX`(`fish-xiaoou@agentmail.to`)。不得印出金鑰。
- 讀信:`GET https://api.agentmail.to/v0/inboxes/$AGENTMAIL_INBOX/messages?limit=N`(Bearer 金鑰),信內連結看 `text` 欄位。
- 測試帳號:管理端已用此信箱註冊 `agentmail-test`,可直接觸發重設密碼收信。
- 實例:11/8 重設密碼信曾寫成 `localhost:3000`,PR #5 在 `apps/saas/wrangler.jsonc` 加 `vars` 修好,用 AgentEmail 收信確認連結為 `admin.aiver.me`。

## 2026-11-09 測試階段決定(老魚)
- AIVER 目前是測試市場需求的 SaaS,不是正式產品;內容細節由代理決定,不逐項請老魚確認。
- 法律頁面沿用 fishot.com 的隱私權政策與服務條款改寫(營運方核流有限公司)。
- 知識庫批次貼上匯入:老魚同意未來要做,另開一張 SR(`aiver-kb-bulk-import`),不放進 aiver-finish。

## 2026-11-09 開發過程教訓(aiver-finish 復盤)
1. 訪客可見頁面,合併前後都要看線上實際回應。法律頁換文字後單元測試全綠,線上卻 500(Workers 禁用執行期 eval)。做法:部署後跑 `scripts/smoke-live.sh`,新增頁面就加進清單。
2. 這個底座的 Next.js 頁面不可在執行期編譯 MDX 或用 eval/new Function,內容一律建置時轉好。
3. 疊在一起的 PR(#7→#8→#9)要先合併前一個再檢查下一個的衝突;勾選檔 tasks.md 是最常衝突處。
4. 先找本機與 fishot.com 現成資源再問老魚(法律頁就是這樣省掉一輪)。
5. 測試階段產品,內容細節代理自己決定,不逐項問。

## 2026-11-09 教訓:不要自己決定專案歸屬(老魚指出)
- 事實:早期我沒問老魚,就把 AIVER 做在 BNI 底下(GitHub `line-ai-saas`、Pages `line-ai-saas`、D1 `line-ai-saas-db-v2`、Worker `line-ai-saas`、本機 `B-產品/products/line-ai-saas`),不是老魚要的獨立產品。後來才改成獨立的 `fishtvlvoe/agent-aiver`。
- 規則:①建立任何新專案、儲存庫或雲端資源之前,先用一句話跟老魚確認「這是哪個產品、放在哪裡、叫什麼名字」,對不上就不動手。②老魚沒給的網站內容或歸屬,不自己決定;測試階段的小細節(文案、範例資料)才由代理決定。③建立前先查本機與既有專案有沒有現成的,避免重複與誤放。
- 善後:上面五項誤建資源列在 `aiver-base-cleanup`,逐項刪除前都先問老魚。

## 2026-11-09 流程已升級為全域
手機實機冒煙(`scripts/phone-smoke.mjs`)、線上冒煙(`scripts/smoke-live.sh`)、寄信測試、建 repo(private)、CI 與 Workers Builds 自動部署，已整理到全域 `~/.agent-guardrails/flows/cf-saas-ship.md`(dev-flow 規則 55)。本專案只留腳本實例。

## 2026-11-09 底座 PR #12(老魚決定)
- 關閉底座 `opcos-cf-starter` 的 PR #12(LINE AI 店家機器人後台),保留分支 `product/line-ai-admin`,不刪程式碼。

## 2026-11-09 想法歸想法,不是指令;範圍由老魚決定,代理不自己砍也不自己擴(老魚指出)
- 事實:老魚提到「新客戶上線第一天就能把舊 FAQ 全部搬進來」,是在談**未來可能的方向**,不是要代理現在處理。代理當場把它當成待辦,先提議開新 SR(`aiver-kb-migrate`),被老魚指出沒有市場證據後,又自己宣布「作廢、不開」。兩次都是代理單方面決定,沒有先跟老魚討論。
- 沒有市場證據的事實:目前沒有任何客戶說過搬舊 FAQ 是購買障礙,也沒有客戶說願意為此付費。批次貼上功能來自內部想法,不是客戶的話。
- 規則:①老魚講的方向或想法,先記錄、先討論,不自動變成 SR 或開發。②代理不得單方面「擴大」或「取消」範圍;要改範圍,先講清楚理由與選項再等老魚說。③有新功能想法時,先問「有客戶要嗎、願意付錢嗎」,沒有證據就列為待驗證,不開工。
- 待驗證清單:「新客戶第一天搬舊 FAQ」(格式混亂、超過 100 則、去重、匯入結果報告)。需先訪談 3 到 5 個真實潛在客戶。

## 2026-11-09 AIVER 目前定位(老魚指定)
- 這是工作坊的測試。只要功能能動就可以,不做別的,不擴大範圍、不做市場驗證開發。
