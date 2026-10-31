## Context

新專案 `B-產品/Cloudflare-Worker-Line`，從零建立。需求與 10 項決策來自 grilling（`docs/sr-drafts/line-ai-saas-notes.md`，SSOT）：多租戶 SaaS；每租戶專用 webhook 路徑；店家自助貼金鑰開通（B 半自助）；後台第一版＝貼金鑰＋編 FAQ＋看對話；模型平台統一（可插拔）；AI 只答 FAQ＋轉真人＋未命中收集；三層結構（Landing／店家後台／平台中台）；UX 三預設；費用雙煞車；Pages 靜態＋Worker 動態。設計視覺來源：四份 demo HTML（`docs/demo/`，依 opcosv2 版 `docs/DESIGN.md`）。

## Design Source

- Source: `B-產品/Cloudflare-Worker-Line/docs/demo/demo-store-knowledge.html`、`demo-store-conversations.html`、`demo-store-bind.html`、`demo-platform-admin.html`（2026-10-31 老魚定稿）
- Cache: `.spectra/design-cache/line-ai-saas-mvp/`（四份 demo HTML 原檔）
- Key values: 底色 `--background: oklch(98.8% 0.003 106.5)`（olive-50）；主按鈕色 `--primary: oklch(15.3% 0.006 107.1)`（olive-950），primary-foreground olive-50；邊框 olive-200；muted olive-100；muted-foreground olive-600；成功 green-800（淺色主題）／green-400（深色）；警告 yellow-700／yellow-500；危險 red-700／red-400；基準圓角 `--radius: 0.625rem`（按鈕/卡片 lg，輸入框 md = ×0.8，Modal xl = ×1.4）；圖示一律 Lucide 風格 inline SVG（stroke=currentColor、stroke-width 2、24×24 viewBox）；按鈕 min-height 44px；斷點 1024px（表格/卡片分界）與 768px（雙欄/單欄卡片分界）；字型 Inter + Noto Sans TC + Fira Code（數字 tabular-nums）

## Goals / Non-Goals

**Goals:**

- 一套 Cloudflare Worker 服務多租戶，每租戶資料完全隔離
- 店家 10 分鐘自助開通：申請 OA → 貼兩把金鑰 → 貼 webhook 網址 → 上線
- AI 只依知識庫回答，不知道就承認並留給真人，絕不編造價格/時間
- 平台成本可控：速率限制＋月上限雙煞車
- 手機（LIFF）為主要使用情境，電腦/平板同版面自適應
- 月費 NT$0（免費額度內）即可服務情境 2 規模店家（月 1,000–5,000 則）

**Non-Goals:**

- 付款/訂閱、優惠券/集點/問卷/群發、員工身分、mirasim tunnel 接入（皆後續 SR）
- 多語系（僅 zh-TW；zh-CN/en 等 opcosv2 慣例留待需要時）
- 深色主題完整驗收（第一版只做淺色，tokens 已預留）

## Decisions

### 每租戶以專用 webhook 路徑識別，簽名用該租戶 channel secret 驗證

URL 格式 `POST /webhook/:tenantSlug`。Worker 以 tenantSlug 查 tenants 表取 channel_secret，用 HMAC-SHA256 驗算 `X-Line-Signature`；驗證失敗一律 401，不觸發任何副作用。不採共用網址反查（body 不帶 channel id，反查需逐戶試簽，複雜且慢），不採每戶獨立 Worker（違背 SaaS 全自動化）。

Alternatives Considered: 共用 webhook 網址＋以 access token 反查（否決：需維護 token→tenant 對照且試錯耗時）；每租戶一個 Worker（否決：開店要部署，非全自動）。

### 金鑰一律 wrangler secrets 保管，資料庫與畫面只有遮罩

channel secret / access token 以 `wrangler secret put` 存於 Worker 環境，以 tenant_id 為 key 命名（如 `LINE_KEY_<tenant_id>`），由 Worker 依 tenant 動態取用；DB tenants 表只存遮罩尾四碼（如 `••••a1b2`）供畫面顯示。任何人（含平台管理員）呼叫任何 API 都拿不到明文。模型 API key 同樣走 secrets（平台層級，非每戶）。

Alternatives Considered: 金鑰直接放 D1 加密欄（否決：加解密金鑰也得放哪，且 Workers 無安全 enclave 之外的標準做法，secrets 是 Cloudflare 官方建議）。

### 模型呼叫抽象為 provider 介面，官方 API 為主、mirasim 為備援

定義 `chat(messages, opts) → {text, usage}` 介面；`providers/official.js` 實作 OpenAI 相容呼叫（預設模型 gpt-6-luna 或 deepseek-chat，平台 secrets 設定）；`providers/mirasim.js` 預留（路線 B，本次不實作呼叫，僅介面與 failover 掛點）。呼叫逾時 10 秒或 5xx 時自動切下一個 provider，記 audit_events（event=failover），客人端無感。

Alternatives Considered: 直接寫死單一供應商 SDK（否決：之後加 mirasim 折扣或換模型要改動核心邏輯）。

### Prompt 組裝：店家卡＋知識庫全量＋最近 5 句，超過 token 預算則截斷

每次呼叫組裝：① system（角色＋「只依知識庫回答，不知道就說確認後回覆，絕不編造價格時間」的鐵則）② 店家卡（名稱、產業、語氣）③ 知識庫 FAQ 全文（ tenants.faqs 全量，實測小店 10~50 題約 2K~6K tokens）④ 最近 5 句對話（KV）。預算：輸入 ≤8K tokens，超出由最舊對話開始丟棄。回覆長度上限 300 tokens。

### 對話狀態機：resolved / handoff / missed

客人傳訊 → AI 回覆成功 → resolved。AI 判斷知識庫無答案（prompt 要求輸出結構化標記或依回覆模板偵測）→ missed，回覆兜底話術「這題我確認後回覆您」。客人訊息含「真人/客服/轉接」關鍵字，或 AI 依知識庫明確要求轉人工 → handoff，回覆「已幫您轉達，真人會盡快回覆」並在後台「待真人處理」計數 +1。判定邏輯抽成純函式 `classifyOutcome(reply, userText, faqs)` 可單測。

### 費用雙煞車：per-user 速率限制＋per-tenant 月上限

速率限制：KV key `rl:<tenant>:<userId>`，60 秒滑動窗口內最多 3 次 AI 回覆，超出回「請稍等，我們盡快回覆」並記 rate_limited。月上限：D1 usage_counters（tenant_id, month, count），每次回覆前 SELECT count，≥5000 則降級回覆「店家將盡快親自回覆您」、不呼叫模型；計数以 calendar month（台灣時區 UTC+8）為界。

### 三層界面同庫不同路由：Pages 靜態、Worker 動態 API

`web/`（Vite 或 Astro build）→ Cloudflare Pages：三個 entry（`/` landing、`/admin/*` 店家後台、`/console/*` 平台中台）。Worker 提供 `/api/*`（JSON）與 `/webhook/:slug`；Pages 以 fetch 呼叫同源 `/api`。身分：店家與管理員皆走 LINE Login（LIFF 內 liff.getIDToken 自動帶；瀏覽器走 OAuth 授權碼），session 存 KV（TTL 7 天），admin 身分以 LINE userId 白名單（platform_admins 表）區分。LIFF 內不開新分頁：金鑰教學、webhook 說明皆以頁內展開或 dialog 呈現。

### 響應式斷點雙層：1024px（表格/卡片）＋768px（卡片欄數）

≥1024px：左側 240px 側邊欄常駐＋多欄表格。768–1023px：漢堡抽屉＋雙欄卡片。<768px：漢堡抽屉＋單欄卡片＋底部導覽四圖示（知識/對話/用量/設定）。手機檢查點：scrollWidth 等於視窗寬（無橫捲）、按鈕 ≥44px。視覺依 DESIGN.md tokens，禁止 emoji 圖示、禁止自創色票。

### 驗收以 Gherkin 劇本為準，三種身分測試帳號先備妥

劇本：`e2e/features/backend/backend.feature.md`（5 功能 12 場景）、`e2e/features/frontend/frontend.feature.md`（6 功能 15 場景）。測試身分三種：① 平台管理員＝Fish 的 LINE 帳號（platform_admins 表）；② 測試店家＝新建專用 LINE 測試 OA（不用共用帳號，防私訊外洩），channel 由 Fish 建立後金鑰交 PM 設定；③ 測試客人＝開發者的 LINE 帳號加測試 OA 好友。切換方式：身分差以 LINE userId 區分，後台依登入身份路由到 /admin 或 /console。



> 實作偏差（2026-10-31，任務 7）：Workers secrets 執行期唯讀、無法依 tenant 動態寫入，故 per-tenant 金鑰改採 AES-GCM 包裹存 D1（`line_secret_enc`/`line_token_enc`），主金鑰 `MASTER_KEY` 放 secrets（未設時開發 fallback）。遮罩規則與「任何 API 不回明文」不變。

### 店家可自填模型供應商（Supersedes 決策「模型呼叫抽象為 provider 介面」中的平台統一前提）

**Supersedes**: line-ai-saas-mvp / 模型呼叫抽象為 provider 介面，官方 API 為主、mirasim 為備援（僅就「店家無法自訂」這一點）

店家後台「設定 → 模型」頁可選擇：使用平台預設（預設）或自訂供應商。自訂時填三欄：provider base URL（OpenAI 相容）、API key、模型名稱。儲存後該租戶的 AI 回覆改用店家自己的 key 呼叫（費用由店家對供應商負責，平台不代付）；清空則回到平台預設。API key 存 wrangler secrets（`LLM_KEY_<tenant_id>`），DB 只存遮罩。任何 OpenAI 相容端點（DeepSeek、Groq、OpenRouter、mirasim 等）皆可填入，不需要改程式。

Alternatives Considered: 僅平台統一不可自訂（否決：老魚 2026-10-31 要求可串其它模型）；自訂欄位做成多供應商下拉選單（否決：第一版用自由填寫的 base URL 最通用，下拉等供應商清單穩定再說）。

## Implementation Contract

**Behavior:**

- 店家完成綁定後，客人傳訊至其 LINE OA，30 秒內收到依知識庫的回答；知識庫無答案時收到「這題我確認後回覆您」，對話出現在後台「未命中問題」
- 客人說「找真人」→ 收到「已幫您轉達」，對話出現在「待真人處理」（紅點計數）
- 簽名錯誤的 webhook 請求一律 401，不產生任何資料
- 每租戶只能讀寫自己的資料；平台管理員可讀全部但看不到任何金鑰明文
- 月用量 5,000 則用盡後，AI 停止回覆，改回「店家將盡快親自回覆您」

**Interface / data shape:**

- Webhook: `POST /webhook/:tenantSlug`，LINE Messaging API 格式；回應 200（回覆經 Reply API 送出）
- API（皆 JSON，Bearer session）：`POST /api/bind` `{channelSecret, accessToken}` → `{ok, webhookUrl, maskedSecret, maskedToken}`；`GET /api/faqs` / `POST /api/faqs` / `PUT /api/faqs/:id` / `DELETE /api/faqs/:id`；`GET /api/conversations?status=`；`GET /api/usage`；console：`GET /api/console/tenants`、`POST /api/console/tenants/:id/toggle`
- D1 表：tenants(id, slug UNIQUE, name, line_secret_mask, line_token_mask, status, created_at)、faqs(id, tenant_id, question, answer, updated_at)、conversations(id, tenant_id, user_id, user_text, ai_text, status, created_at)、usage_counters(tenant_id, month, count, PRIMARY KEY(tenant_id, month))、platform_admins(line_user_id)、audit_events(id, tenant_id, event, detail, created_at)
- 店家模型設定：`GET/PUT /api/model-settings` `{mode: "platform"|"custom", baseUrl?, apiKey?, model?}` → 回傳遮罩；自訂時 chat() 改用該租戶 secrets 的 key
- Provider 介面：`async function chat({system, storeCard, faqs, history, maxTokens}) → {text, usage:{promptTokens, completionTokens}}`
- 純函式：`classifyOutcome(aiReply, userText) → 'resolved'|'missed'|'handoff'`、`isOverRateLimit(kvKey)`、`maskSecret(s) → '••••'+last4`

**Failure modes:**

- 模型供應商全部失敗 → 回客人「目前忙碌，請稍後再傳」，記 audit_events（不對客人暴露錯誤細節）
- LINE API 呼叫失敗（token 被撤）→ 標記該租戶 binding_status=error，中台顯示「連線異常」
- 儲存失敗 → API 回 4xx/5xx JSON `{error}`，前端顯示紅字並保留已填內容（F2 場景）
- 故意靜默：驗簽失敗（401 無 body）、速率限制（一般話術回覆不說「你被限制」）

**Acceptance criteria:**

- `node --test test/` 全綠（classifyOutcome、mask、rate limit、月上限計數、簽名驗證為純函式測試）
- e2e 依 Gherkin：後端 B1–B5、前端 F1–F6 全數有對應自動或人工場景通過
- ego-browser 三種身分各走一輪：管理員看 /console、店家看 /admin、客人用手機 LINE 實傳
- 390px 與 1440px 截圖對照 demo HTML 無結構走樣；scrollWidth 等於視窗寬

**Scope boundaries:**

- in scope：上述 API、D1 schema、webhook 流程、三層界面、Gherkin 涵蓋功能
- out of scope：付款、優惠券/集點/問卷/群發、員工身分、深色主題、多語系、mirasim provider 實作

## Risks / Trade-offs

- **風險：AI 把沒有的資訊講得像有（幻覺）** → prompt 鐵則＋missed 判定＋Gherkin「不編造價格」場景釘死；無 100% 保證，靠營運迴圈（未命中收集）持續補知識庫。
- **風險：Cloudflare 免費額度被單一爆量租戶吃光** → 雙煞車＋中台即時用量檢視；情境 6 以上規模需升 Workers Paid（約 NT$160/月），轉嫁或吸收待商業決策。
- **風險：店家貼錯金鑰或忘記開 webhook** → 綁定流程自動驗證（打 LINE API）並明確錯誤提示；教學六步內嵌綁定頁。
- **取捨：知識庫全量塞 prompt（不做 RAG/embedding）** → 小店 10~50 題成本遠低於 RAG 基礎建設；FAQ 成長到 200 題以上再評估檢索（design 已把 faqs 讀取獨立成函式，可換實作）。
