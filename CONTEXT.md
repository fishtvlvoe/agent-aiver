# CONTEXT.md — LINE AI 店家機器人 SaaS

> 本檔只收「這次新出現的詞」。新增功能時同步補。
> 決策依據與訪談紀錄：`docs/sr-drafts/line-ai-saas-notes.md`（SSOT）。

## 詞彙表

| 詞 | 白話意思（一句） | 不是什麼（易混淆） | 程式裡叫什麼 |
|---|---|---|---|
| 租戶（tenant） | 一家使用本服務的店家，有自己的 LINE 帳號和自己的資料 | 不是 LINE 官方帳號本身，也不是平台管理員 | `tenants` 資料表 / `tenant_id` |
| 店代號（tenant slug） | 店家的專用代號，webhook 網址和子網域裡的那串字 | 不是店名；店名可以改，slug 不改 | `tenant_slug`（如 `abc-shop`） |
| Webhook | LINE 把客人訊息「推過來」的那個網址 | 不是我們去 LINE 抓資料，是 LINE 主動送來 | `POST /webhook/:tenantSlug` |
| Channel secret | LINE 給的「驗章鑰匙」，用來確認訊息真的來自 LINE | 不是 access token；secret 驗身份，token 才能發話 | `line_channel_secret` |
| Channel access token | LINE 給的「發言鑰匙」，機器人靠它回覆客人 | 不是 secret；外流了別人就能用你的帳號發訊息 | `line_access_token` |
| 知識庫 | 店家寫的 FAQ 清單，AI 回答的唯一依據 | 不是 AI 自己上網查的資料 | `faqs` 資料表 |
| 未命中 | AI 在知識庫找不到答案、答不出來的一題 | 不是客人罵髒話或系統壞掉 | `missed`（conversations.status） |
| 待真人 | 客人要求真人、或 AI 判斷要轉交給店家的對話 | 不是未解決的 bug；是正常的工作流程 | `handoff` |
| 回覆（Reply） | 客人傳訊後「回他」，LINE 免費不扣則數 | 不是主動推播（Push）；主動傳才扣 LINE 則數 | LINE Reply API |
| 則數上限 | 每店家每月 AI 回覆最多 5,000 次，超過就降級 | 不是 LINE 的則數；是「我們平台」對 AI 費用的煞車 | `monthly_reply_limit = 5000` |
| 速率限制 | 同一個客人 1 分鐘最多被回 3 次，防惡搞 | 不是針對店家；是針對單一聊天對象 | `rate_limit: 3/min per user` |
| LIFF | LINE 裡面開的網頁，自動帶客人/店家身份 | 不是一般瀏覽器網頁；不能開新分頁 | LINE Front-end Framework |
| 三層結構 | 前台 Landing（行銷）／店家後台（管自己）／平台中台（Fish 管全部） | 不是三個系統；是同一個 Worker 的三組路由 | `web/`（Pages）＋ Worker routes |
| 金鑰 | 統稱 channel secret + access token 這兩把 | 不是加密金鑰（encryption key） | `credentials`（secrets 存放） |

## 白話規則（全站共用）

- **儲存回饋**：按鈕變「已儲存 ✓」1.5 秒，失敗顯示紅字。
- **表格/卡片分界**：1024px。以上表格，以下卡片。手機不準左右滑、字不準被切。
- **金額**：`NT$1,200`（千分位、無小數）；**日期** `2026/10/31`；**時間** 24 小時制 `14:30`。全站共用同一支格式化函式。
- **圖示一律 SVG，禁止 emoji 當圖示**；按鈕一律橫放；一張卡一件事。
- **不秀內部狀態**：畫面只講使用者要知道的事（opcosv2 後台通則 6 條）。
