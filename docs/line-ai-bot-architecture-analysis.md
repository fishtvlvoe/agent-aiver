# LINE AI 店家機器人 — Cloudflare Worker 架構分析

> 日期：2026-10-31
> 目的：評估以 Cloudflare Worker 作為 LINE 官方帳號 webhook 後端，重現市售方案（keiitsu quote-dashboard 基礎版、J3M「GAS + Gemini LINE 秘書」教學）全部功能的可行性與成本。
> 結論：**功能全部做得出來；對手報價 NT$1,438/月（主機 NT$1,431 + AI NT$7~33），本架構 NT$0~160/月（視模型路線），成本差 10~20 倍。**

---

## 1. 對手方案拆解（keiitsu.github.io/quote-dashboard）

對手預設報價（情境2：每月 1,000~5,000 則，gpt-6-luna）：

| 項目 | 對手金額 | 說明 |
|---|---|---|
| 建置費 | NT$3,850 一次性 | 人力錢（設定、FAQ、選單、手冊），非架構差異 |
| 主機月費 | NT$1,431 | AWS Lightsail 8GB + n8n，24h 開機 —— 97% 的月費在這 |
| AI 使用費 | NT$7~33 | 官方牌價 NT$0.0067/則 |
| LINE 月費 | NT$0 | 純回覆免費，這點對手講得正確 |

弱點：**n8n + VPS 是過時架構**。LINE webhook 回覆機器人不需要常開 VM；Cloudflare Workers 免費額度（10 萬次請求/天）情境 6（月 20 萬則）都涵蓋。

## 2. 本架構總圖

```
客人 ──LINE App──> LINE 官方帳號（輕用量 NT$0）
                        │  Messaging API Webhook（reply 免費、不扣則數）
                        ▼
              ┌─ Cloudflare Worker（免費層，24h）─┐
              │ ① 驗證 X-Line-Signature（HMAC）    │
              │ ② 讀/寫對話歷史（Workers KV）      │
              │ ③ 組 prompt：店家卡 + FAQ + 近 3~5 句 │
              │ ④ 呼叫模型（後端可插拔，見 §3）      │
              │ ⑤ Reply API 回覆 + 寫 D1/KV        │
              │ ⑥ Cron Trigger：群發草稿、提醒推播    │
              └────────────────────────────────────┘
                        │  model backend
        ┌───────────────┴────────────────┐
        ▼                                ▼
 路線 A：官方 API                 路線 B：mirasim 雲端空間
 OpenAI / DeepSeek / Gemini      空間 API（localhost:4964）
 Worker 直連，牌價               + 空間內跑 cloudflared tunnel
 最簡單、零依賴                   暴露私密網址 → Worker 直連
                                 享 mirasim 折扣、24h 在線
                                 需：租空間 $49/月 + 儲值
```

**為什麼 Worker 是對的位置**：LINE webhook 需要固定 HTTPS URL + 即時回應（reply 視窗約 1 分鐘）；Worker 零主機、零維運、關掉家中所有電腦也照常運作。KV 免費層（10 萬 read/天）足夠記對話；D1（SQLite）記帳務/集點/問卷結構化資料。

## 3. 模型後端：路線 A vs 路線 B

### 路線 A — 官方 API 直連（預設）

| 項目 | 內容 |
|---|---|
| 每則成本（800 in / 250 out） | gpt-6-luna NT$0.0067；DeepSeek Flash 更便宜 |
| 月 5,000 則 | NT$7~33 |
| 依賴 | 無。Worker secrets 放各家 API key |
| 缺點 | 牌價，無折扣 |

### 路線 B — mirasim 雲端空間（折扣路線，本次新推導）

mirasim 空間 API 只監聽空間內 `127.0.0.1:4964`（金鑰「只在空間裡用」），但**雲端空間是一台可跑程式的 Linux**。在空間內跑 `cloudflared tunnel`（對外連線，不需公開端口、不需路由器設定），把空間 API 遞成私密 hostname，Worker 以此為 base URL 呼叫。

| 項目 | 內容 |
|---|---|
| 每則成本 | gpt-6-luna 限時 0.5 折 → 約 NT$0.0003（比牌價便宜 20 倍）；DeepSeek V4.1 Flash 5 折 → NT$0.009 |
| 必要條件 | ① 租雲端空間 $49/月 ② 儲值額度 ③ 空間內建 API 密鑰並設預設 |
| 限制 | API 暫不支援 Claude；折扣屬促銷可能調整；tunnel 接法非官方文件用法 |
| 備援 | mirasim 額度用完 → Worker 自動 fallback 路線 A（failover 邏輯簡單） |

**建議：Worker 做成雙路線 failover**——主走 B（有折扣時），失敗/額度盡自動切 A，回應速度不受影響。iMac 上的 Magpie（`127.0.0.1:3425`）維持給內部開發用，不進對客戶架構（綁實體主機開機）。

## 4. 功能對照：keiitsu 基礎版 & J3M 教學 → 本架構

| 功能（來源） | 實作方式 | 成本 |
|---|---|---|
| 店家資訊、歡迎訊息 | Messaging API greeting + Worker 回應 | 免費 |
| 10 組 FAQ 自動回覆 | prompt 內嵌 FAQ + 模型回答（或關鍵字直答降成本） | AI 費 |
| 六格選單連購物網站 | Rich Menu API（圖片放 R2/Images） | 免費 |
| 優惠券 | LIFF 頁面 + D1 核銷碼表 | 免費 |
| 集點卡 | LIFF + D1 點數表 | 免費 |
| 問卷 | LIFF 表單 + D1 結果表 | 免費 |
| 群發草稿 | D1 存草稿 + Cron Trigger 定時 Push API | 扣 LINE 則數（客戶自付方案） |
| 記帳→試算表（J3M） | 模型輸出 JSON → D1（或 Google Sheets API 同步） | AI 費 |
| 語音訊息轉提醒（J3M） | LINE 語音 → 模型音訊轉文字 → 解析 → D1 | AI 費 |
| 定時提醒推播（J3M） | Cron Trigger 每 10 分掃 D1 → Push API | 扣 LINE 則數 |
| 串客戶既有系統（POS/訂單） | Worker 加 route 呼叫客戶 API | 另案報價 |

LINE 端原則與對手相同：**一律用 Reply（免費），主動推播才計則數**。

## 5. 成本總表（情境2：月 1,000~5,000 則）

| 方案 | 主機 | AI | LINE | 每月合計 |
|---|---|---|---|---|
| 對手（Lightsail+n8n+牌價） | NT$1,431 | NT$7~33 | NT$0 | **NT$1,438~1,464** |
| 本架構 路線 A | NT$0 | NT$7~33 | NT$0 | **NT$7~33** |
| 本架構 路線 B | NT$0（Worker）+ NT$1,600（mirasim 空間 $49） | NT$0.3~2 | NT$0 | **NT$1,600~1,620** |
| 本架構 A+B failover | NT$1,600（空間） | NT$0.3~33 | NT$0 | NT$1,600~1,650 |

**注意路線 B 的帳**：空間租金 NT$1,600 > 省下的 AI 錢（約 NT$30/月）。單為一個 bot 租空間**不划算**；划算的條件是「空間本來就要租」（順便當開發環境、跑多個客戶的 bot 共享 $49）、或客戶量大到 AI 折扣省超過租金（月 30 萬則以上級距）、或 mirasim 之後開放對外 API 免租金。小客戶方案主打路線 A；路線 B 留作大客戶與內部工具選項。

## 6. 待 Fish 完成的人類關卡（代理無法代辦）

1. **儲值 mirasim 額度**（mirasim.ai 帳號頁，刷卡）
2. （若走路線 B）**租雲端空間 $49/月**
3. **LINE 官方帳號**：建專用新帳號（勿用共用帳號，防私訊外洩——J3M 教學第 2 步同款警告）、開 Messaging API、關自動回覆、開 Webhook、關 redelivery、取 channel secret + access token
4. **各家模型 API key**（路線 A）：OpenAI / DeepSeek / Gemini 任選
5. **Cloudflare 帳號**：Worker + KV + D1 皆可用免費額度

## 7. 實作清單（關卡完成後代理可全自動執行）

- [ ] `wrangler` 建立 Worker 專案（本目錄），KV namespace + D1 建表（conversations / coupons / points / surveys / reminders / broadcast_drafts）
- [ ] webhook endpoint：`POST /webhook` 驗簽 → 取訊息 → 組 prompt → 調模型 → Reply
- [ ] 模型 client：雙路線 failover（B→A），timeout 與重試；secrets 存放 key
- [ ] 歡迎訊息、Rich Menu 部署腳本（LINE API 一次性設定）
- [ ] LIFF：優惠券 / 集點 / 問卷三頁（Worker 本身 serve HTML）
- [ ] Cron Trigger：提醒掃描、群發草稿
- [ ] Gherkin 驗收情境 + 端到端實測（LINE 手機傳訊 → 收到回覆 → D1 有紀錄）
- [ ] 對客戶報價模板（依本文件 §5）

## 8. 風險與保留

- mirasim 折扣屬促銷（「限時 0.5 折」隨時可結束），對客戶報價用 5 折或牌價保守估。
- 路線 B 的 tunnel 接法非官方文件用法；正式採用前建議信 support@mirasim.ai 確認空間 API 可否對外服務，或等待官方開放 public endpoint。
- LINE 2026/11/1 起新價：中用量 NT$1,000、高用量 NT$1,400；純回覆方案不受影響。
- Gemini 免費層（J3M 教學的免費來源）不適合客戶個資；正式服務一律 paid tier。
