
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
