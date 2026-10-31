# LINE AI 店家機器人 — grilling 決策紀錄

> 2026-10-31 dev-flow 步驟 1。分「已確認」與「待確認」。

## 已確認

1. **產品定位：多租戶 SaaS（C）**——一套 Cloudflare Worker 系統服務多個店家，每個店家有自己的 LINE 官方帳號、自己的 FAQ/設定、自己的對話紀錄。不是單一個人秘書，也不是單一客戶客製案。
   - 影響：需要租戶（tenant）概念、每租戶一組 LINE channel secret/token、租戶資料隔離、日後要有註冊/開通流程與計費依據。

2. **租戶識別：每租戶專用 webhook 路徑（A）**——店家開通時拿到 `https://<網域>/webhook/<tenant_slug>` 貼進 LINE Developers；Worker 用路徑分辨店家、用該店 channel secret 驗簽。不採共用網址反查、不採每戶獨立 Worker。
   - 影響：webhook route 設計、tenant 資料表要有 slug + channel secret + access token 欄位。

3. **開通流程：B 半自助**——店家本人申請 LINE OA 與 Messaging API，在我們的設定頁自己貼 channel secret/access token，系統自動驗證並開通；我們不碰店家金鑰。
   - 後續加付款（C）：Fish 確認既有金流程式碼（之前專案做過、測試過）可直接重用，接到 Cloudflare 打通即可，難度不高。付款列為後續 SR，不阻塞第一版。
   - 影響：需要「設定/後台頁」+ 綁定驗證流程（打 LINE API 驗證 token 有效）。

4. **後台範圍（第一版）：A 最小可用**——① 貼金鑰綁定 ② 編輯 FAQ/店家介紹（AI 回答依據）③ 看對話紀錄。歡迎訊息/Rich Menu 用部署腳本預設值；優惠券、集點、問卷、群發排程、付款列後續 SR。資料表預留欄位不預留 UI。

5. **模型選擇：平台統一為預設＋店家可自訂（2026-10-31 老魚追加）**——店家後台「設定 → 模型」可自填 OpenAI 相容供應商（base URL＋API key＋模型名稱），填了用店家的 key、清空回平台預設。key 存 secrets、畫面遮罩。決策 5 原「店家無法自訂」部分已被 design.md 新決策標 Supersedes。

6. **AI 回答範圍：A 只答 FAQ ＋ 兩配套**——prompt 限定只依店家資料回答，不知道就承認；配套①轉真人（客人說「真人/客服」或 AI 判斷超範圍 → 回覆轉達话术＋後台「待真人處理」清單）；配套②未命中收集（答不出的對話自動標記，後台可篩出、一鍵轉成新 FAQ）。業界依據：Intercom 知識庫局限法、混合式客服轉接、答不出問題的營運迴圈。

7. **三層結構確認**——同一個 Cloudflare Worker，三種路由＋權限：
   - Landing Page 前台：產品介紹/價格、LINE Login 登入入口（日後付款掛這層）。
   - 後台（店家）：只見自己——貼金鑰綁定、編 FAQ/店家介紹、對話紀錄、待真人清單、未命中問題。
   - 中台（平台管理員 Fish）：全部店家、啟用/停用、切模型、平台用量。
   - 身分：第一版只有「平台管理員＋店家」兩種，員工身分資料表預留不開放；店家登入用 LINE Login（bni 專案已驗證做法），不做帳號密碼。

8. **UX 三預設（grilling 固定題）**：① 儲存回饋＝按鈕變「已儲存 ✓」綠色 1.5 秒、失敗紅字。② 對話紀錄表格 1024px 以下改卡片。③ 金額 NT$ 千分位無小數、日期 2026/10/31、時間 24h，全站共用格式化函式。

9. **費用安全上限：A+C 並用**——C 速率限制（同一客人 1 分鐘最多 3 次回覆，防惡搞）＋ A 每店家月上限 5,000 則 AI 回覆（超過後機器人回「將盡快親自回覆」、後台顯示用量與超用標示；自動通知與加購排後續 SR）。

10. **技術棧（修正後）**：
    - 靜態網頁（Landing/後台/中台）：獨立 `web/` 前端專案，輕量 build 工具（Vite/Astro 級），deploy 到 **Cloudflare Pages** 靜態託管。不採手刻 HTML 字串（bni 方式不適用多頁面管理界面）。
    - 動態（LINE webhook＋API＋模型呼叫）：**Cloudflare Worker**，純 JavaScript、node:test，風格沿用 bni line-bot。
    - 日後多租戶子網域：wildcard DNS `*.網域` → Worker 依 hostname 判斷 tenant，後台登入網址與 webhook 網址合一。
    - 第一版網域：先用 `*.workers.dev` / Pages 免費網址，正式網域等產品命名確定再接。
    - 測試帳號（dev-flow 三身分）：① 平台管理員＝Fish 的 LINE 帳號 ② 測試店家＝新建專用 LINE 測試 OA（不用共用帳號，防私訊外洩）③ 測試客人＝我們的 LINE 帳號加測試 OA 好友。寫進 SR tasks.md。

11. **UI/UX 定案（老魚 2026-10-31）**：
    - 設計規範：沿用 opcosv2 版 `docs/DESIGN.md`（橄欖綠語意 tokens、Inter+Noto Sans TC、--radius 0.625rem、**圖示一律 SVG，禁止 emoji 當圖示**、按鈕一律橫放、一卡一事留白）。
    - 手機優先：店家主要從 LINE LIFF 進後台；<768px 漢堡＋底部導覽列（知識/對話/用量/設定），LIFF 內不開新分頁。
    - 三裝置：≥1024 側邊欄常駐＋表格；768–1023 漢堡＋卡片雙欄；<768 漢堡＋底部導覽＋單欄卡片。
    - Demo HTML 四份在 `docs/demo/`，定稿後照此實作。

## 待確認

（無——所有決策已定。）

---

## 環境與帳號設定（2026-10-31 完成）

- **正式網域**：`app.aiver.me`（老魚定，LIFF endpoint＝`https://app.aiver.me/admin`）
- **LINE channel（華AI provider）**：
  - Messaging API channel `2011708742`（AIVER AI 語音助理）→ 作為 SaaS 第一個測試租戶 lao-zhang 的 channel。⚠️ 此 channel 目前 webhook 指向舊服務 `voice-agent.fishandy1213.workers.dev`，串接新 SaaS 前老魚已知情。
  - LINE Login channel `2011708268`（AIVER AI 語音助理）→ 登入用。
  - LIFF app `2011708268-mYfaLqBv`（`https://liff.line.me/2011708268-mYfaLqBv`，名稱「AIVER 店家後台」）→ 店家後台在 LINE 內開的入口。Scope 含 openid、profile、**chat_message.write（老魚要求開啟，日後代店家發訊息用）**；Add friend option 老魚已改為開啟。
- **金鑰存放**：以上全部寫入專案 `.env`（`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`、`LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`、`LIFF_ID`、`APP_DOMAIN`）；`.env` 已加入 `.gitignore`。上線時改以 `wrangler secret put` 進 Worker secrets。
- **既有可用**：`OPENAI_API_KEY`、`CLOUDFLARE_API_TOKEN`、`GEMINI_API_KEY`、`MIRASIM_API_KEY/MIRASIM_API_BASE`。
