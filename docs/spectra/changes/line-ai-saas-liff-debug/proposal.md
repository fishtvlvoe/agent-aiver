# line-ai-saas-liff-debug — LIFF 走查問題修復清單

> 2026-11-01 凌晨，關 3 手機（Android adb）走查發現的問題。修好前 SR `line-ai-saas-mvp` 不可封存。

## 問題清單

1. **[已修] LIFF endpoint 指向已下線的 voice-agent** — LIFF `2011708268-mYfaLqBv` 的 endpoint 原本是 `https://voice-agent.fishandy1213.workers.dev`，voice-agent 廢止後 LIFF 開啟即 404。已改為 `https://app.aiver.me/admin`。
2. **登入失敗時 gate 訊息誤導** — 任何登入失敗（含已在 LINE 內、但帳號沒權限）都顯示「請從 LINE 開啟」。應依 `login.reason` 區分：no-liff（真．LIFF 外）/ auth-failed（帳號未開通，要顯示 userId 給管理員）/ wrong-role。已局部修（admin/console gate 顯示原因＋userId），**待部署驗證**。
3. **測試手機的 LINE userId 未註冊** — 走查手機（adb 14b4c2f8）的 LINE 帳號不是 `U4e82e03e3cd09d5d164ec1da341e76eb`（Fish 本人），POST /api/auth/liff 回 403，無法進後台。需要：畫面顯示 userId（問題 2 已做）→ 管理員把 userId 加進 platform_admins 或 tenants.admin_line_user_id。**還缺「後台邀請/開通」功能**——第一版只能手動 SQL，應在中台加「新增管理員/店家管理員」UI（或先用 SQL 頂）。
4. **加好友與 LIFF 的關係未釐清** — 手機開 LIFF 出現「加入好友」開關（LIFF Add friend option 設為 On normal）。老魚指示：要加好友打開。需確認：LIFF 開啟是否必須先加 OA 好友；idToken 驗證與好友狀態無關，理論上不用。待驗證：不加好友直接開 LIFF 能不能登入。
5. **web/app.js 與 src/lib/format.js 雙份維護** — 前端 fmtMoney/fmtDate/fmtTime 是複本，易漂移。應改成 build 時注入或共用模組。
7. **管理員沒有入口**（已修）— 中台在 /console.html 但 LIFF endpoint 只開 /admin，管理員帳號登入被判 wrong-role 擋住。修法：admin.html 偵測 admin 角色自動 location.replace("/console.html")（同一 LIFF webview 內導航，liff SDK 仍可用）。已部署。
6. **走查還沒走完**：知識庫新增 FAQ → 手機問 → 回覆命中；未命中→後台紅點；用量頁；模型設定頁；中台 console.html。續走時遇到的新問題繼續記在這裡。

8. **[已修] LINE idToken 驗證 GET 被停用** — `GET /oauth2/v2.1/verify?client_id=..&id_token=..` 在 2026-11 實測一律回 400「Required request parameter 'access_token'」（LINE 端改版）。改 POST form（id_token + client_id）即通。這是 401 登入失敗的真正根因。auth.js 已加 [auth] 診斷 log。

9. **[已修] console.html 整頁 JS 字串引號炸掉** — showGate() 的字串用了雙引號包外層但內含 `href="/console.html"` 雙引號 → module 語法錯誤 → 整頁空白無選單（桌面開 console 的元兇）。已改單引號外層；build 加 inline module 語法檢查擋未來同類錯。已部署驗證（中台 KPI/店家列表正常顯示）。
10. **[已做] 首頁登入統一入口** — index.html「登入」按鈕改導 /admin.html：LIFF 內外通用，管理員自動跳 /console.html；你的 LINE（U4e82e03e…）已在 platform_admins 種子內，登入即管理員，無需額外綁定。

11. **中台只有總覽，缺三個分頁**（範圍縮水，2026-11-01 老魚驗收抓到）— console.html 只有 KPI＋店家啟用停用，demo 側邊欄的「店家／模型／用量」三頁沒實作。補齊：
    - 店家頁：全部店家列表（slug/狀態/本月用量/未命中數/待真人數）、新增店家（POST /api/tenants 已有，補 UI）、開通管理員（把 LINE userId 設為 tenants.admin_line_user_id —— 解決「手動 SQL 開通」問題 3）
    - 模型頁：平台預設模型設定（讀寫一個 platform_settings 列存 KV 或 D1：provider base URL/model/平台 key 參照；優先度：tenant custom > platform setting > env 預設）
    - 用量頁：平台本月總量＋各店 usage_counters 排名表（資料已有，補 UI）
    驗收：ego-browser 1440px 走查三頁都能操作、儲存有回饋、語法檢查過。

12. **LINE 官方帳號的產品設定應收納進後台**（老魚 2026-11-01 提）— 目前 webhook/greeting/rich menu/自動回覆開關等 LINE OA 層的設定散在 LINE Developers 後台，店家用不了。我們的店家後台應有一個「LINE 設定」頁，透過 Messaging API 代管：① 歡迎訊息（greeting）編輯 ② Rich Menu 圖文選單設定 ③ webhook 狀態顯示（綠燈）④ 自動回覆/加好友問候開關。讓店家不用進 LINE 後台就能完成產品設定，這才像 SaaS。

13. **模型頁應內建供應商選單，只填 API key**（老魚 2026-11-01 提）— 目前中台/店家後台的模型設定都要手打 base URL＋模型名，太工程師。應改成：內建常用供應商清單（OpenAI、DeepSeek、Gemini、Groq、OpenRouter、mirasim…），下拉選一家 → 只填 API key（和選模型，模型也可以從該供應商 /models 拉清單下拉選）；保留「自訂」選項給冷門供應商手填。畫面配置：平台層一組預設＋可選「各家預設」多組（key 用平台的），店家層沿用同樣介面。存 KV/D1 時記 provider id + key + model，baseUrl 由 provider id 對照表帶出。

## 驗收（修完逐項勾）

- [x] 部署後 gate 依原因顯示正確訊息（no-liff / auth-failed+userId / wrong-role）
- [x] LINE verify 改 POST，登入 401 根因修復（commit 28fc859）
- [ ] 測試手機帳號可被開通並登入後台（手動 SQL 或中台 UI 二擇一，文件寫清楚）
- [x] console 空白修復＋首頁統一登入入口（commit b073ae8）
- [ ] 不加好友開 LIFF 的行為有結論＋文件
- [ ] format.js 單一來源
- [x] 中台三頁補齋（店家/模型/用量＋開通管理員，commit 3f0ab54，101 tests green，已部署）
- [ ] 關 3 走查全部跑完一輪（知識庫/對話/用量/模型/中台）
