# store-admin-web Specification

## Purpose

提供三層網頁界面：對外 Landing Page、店家後台（知識庫、對話紀錄、綁定設定、用量）、平台中台（店家管理、模型、用量）。響應式支援電腦/平板/手機（LIFF），圖示一律 SVG，視覺依 docs/DESIGN.md（opcosv2 版）。

## ADDED Requirements

### Requirement: 三裝置自適應

界面 SHALL 在電腦（≥1024px）、平板（768–1023px）、手機（<768px，含 LIFF）正確呈現，同一套程式碼依寬度切換版面。

#### Scenario: 電腦 1440px

- **WHEN** 視窗寬度 1440px
- **THEN** 左側側邊欄常駐（240px），列表以多欄表格呈現，無底部導覽列

#### Scenario: 平板 800px

- **WHEN** 視窗寬度 800px
- **THEN** 側邊欄收成漢堡抽屉，列表以雙欄卡片呈現

#### Scenario: 手機 390px（LIFF）

- **WHEN** 視窗寬度 390px
- **THEN** 顯示底部導覽列（知識/對話/用量/設定四個 SVG 圖示）
- **AND** 列表為單欄卡片
- **AND** 頁面無橫向捲動（scrollWidth 等於視窗寬）
- **AND** 按鈕點擊區 ≥44px

#### Scenario: 邊界 1023 與 1024

- **WHEN** 視窗寬度 1023px，走卡片版面
- **WHEN** 視窗寬度 1024px，走表格版面

### Requirement: 圖示一律 SVG

全站圖示 SHALL 使用 SVG（Lucide 風格），禁止以 emoji 字元當圖示。

#### Scenario: 檢查所有圖示

- **WHEN** 逐一檢查導覽列、按鈕、狀態徽章、底部導覽
- **THEN** 所有圖示都是 svg 元素
- **AND** 頁面無 emoji 字元

##### Example:
- 渲染後 DOM 以腳本掃描：`document.querySelectorAll('svg').length >= 20`，且 `/[\u{1F300}-\u{1FAFF}]/u` 比對文字內容為零匹配

### Requirement: 儲存回饋

任何儲存動作 SHALL 給予明確的成功或失敗回饋。

#### Scenario: 儲存成功

- **WHEN** 店家儲存 FAQ 成功
- **THEN** 按鈕顯示「已儲存 ✓」綠色狀態，1.5 秒後恢復

#### Scenario: 儲存失敗

- **WHEN** 儲存 API 失敗
- **THEN** 顯示紅色「儲存失敗，請重試」
- **AND** 已填內容保留不清空

##### Example:
- 儲存時模擬 500 → 按鈕區出現紅字「儲存失敗，請重試」，答案欄仍顯示剛才輸入的「滿千免運」

### Requirement: 對話紀錄三態篩選

店家 SHALL 能依全部 / 待真人 / 未命中篩選對話。

#### Scenario: 篩選未命中

- **WHEN** 店家點「未命中」
- **THEN** 清單只顯示未命中對話
- **AND** 每筆未命中有「加入知識庫」操作

##### Example:
- 清單原有 3 筆（已解決、待真人、未命中各一）→ 點「未命中」後只剩李大文那筆，卡片底部有「加入知識庫」按鈕

#### Scenario: 待真人紅點計數

- **WHEN** 有 3 筆待真人對話未處理
- **THEN** 選單「待真人處理」旁顯示紅點 3

### Requirement: 綁定設定頁

綁定頁 SHALL 提供 webhook 網址（含複製鈕）、金鑰遮罩輸入、連線狀態燈、內嵌教學步驟。

#### Scenario: 複製 webhook 網址

- **WHEN** 店家點「複製」
- **THEN** 出現「已複製」提示
- **AND** 網址格式含 `/webhook/<店代號>`

#### Scenario: 金鑰預設遮罩

- **WHEN** 店家進入綁定頁
- **THEN** 金鑰欄位顯示遮罩，畫面任何位置無明文

##### Example:
- 欄位值為 `••••a1b2`，頁面原始碼與 DOM 皆搜尋不到真實 secret 字串

#### Scenario: LIFF 內不開新分頁

- **WHEN** 店家從 LINE 內開綁定頁
- **THEN** 教學與說明以頁內展開或 dialog 呈現，不依賴開新分頁

##### Example:
- 在 LINE 內開綁定頁 → 點「怎麼拿到金鑰？」→ 六步驟以頁內 accordion 展開，`window.open` 呼叫次數為 0

### Requirement: 平台中台

平台管理員 SHALL 能檢視全平台 KPI、管理店家啟用/停用，且看不到任何金鑰明文。

#### Scenario: 總覽 KPI

- **WHEN** 管理員開啟中台總覽
- **THEN** 看到店家數、本月 AI 回覆、AI 費用（NT$ 千分位無小數）、待真人數四張卡

##### Example:
- 四卡依序顯示 `12`、`38,204`、`NT$260`、`17`，費用卡為 Fira Code 字型的 `NT$260`

#### Scenario: 停用店家即時生效

- **WHEN** 管理員停用某店家
- **THEN** 該店家 webhook 回 403，AI 不再回覆

### Requirement: 格式規範全站一致

金額、日期、時間格式 SHALL 全站使用同一支格式化函式。

#### Scenario: 金額與日期顯示

- **WHEN** 畫面出現金額與日期
- **THEN** 金額為 `NT$1,200`（千分位、無小數），日期 `2026/10/31`，時間 24 小時制 `14:30`

### Requirement: 店家自訂模型供應商

店家 SHALL 能在後台「設定 → 模型」選擇使用平台預設或自訂供應商（OpenAI 相容 base URL＋API key＋模型名稱）；自訂金鑰的保管與遮罩規則同 LINE 金鑰。

#### Scenario: 自訂供應商並生效

- **GIVEN** 店家在模型設定頁填寫有效的 base URL、API key、模型名稱
- **WHEN** 儲存成功
- **THEN** 該租戶之後的 AI 回覆改用自訂供應商呼叫
- **AND** API key 只存 secrets，畫面與 API 只顯示遮罩

#### Scenario: 清空回到平台預設

- **WHEN** 店家清除自訂供應商設定
- **THEN** AI 回覆回到平台預設模型與金鑰

##### Example:
- 清除自訂後下一次回覆的 usage 記錄 provider 為 `platform`，費用計入平台

#### Scenario: 自訂金鑰無效

- **WHEN** 店家儲存一組供應商拒絕的 API key
- **THEN** 顯示「金鑰無效，請確認後重試」且不切換供應商

##### Example:
- 自訂 key 打供應商回 401 → 錯誤訊息出現，tenants 的模型設定仍是平台預設，下一次 AI 回覆仍走平台 key
