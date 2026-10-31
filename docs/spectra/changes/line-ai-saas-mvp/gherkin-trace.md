# Gherkin 對照表（任務 11.1）

> 每個 Gherkin 場景 → 對應測試檔或人工走查記錄。2026-10-31，npm test 92 pass / 0 fail。

## 後端 B1 綁定

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| B1-1 有效金鑰綁定成功 | ✅ 測試 | test/bind.test.js（200＋webhookUrl＋遮罩） |
| B1-2 金鑰無效 | ✅ 測試 | test/bind.test.js（401＋零副作用） |
| B1-3 金鑰明文不可外洩 | ✅ 測試 | test/bind.test.js＋test/crypto.test.js（序列化無明文、往返/錯密碼） |

## 後端 B2 回覆核心

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| B2-1 知識庫有答案 → resolved | ✅ 測試 | test/reply-pipeline.test.js |
| B2-2 簽名失敗 401 | ✅ 測試 | test/webhook.test.js、test/line-signature.test.js |
| B2-3 未命中 → missed | ✅ 測試 | test/outcome.test.js、test/reply-pipeline.test.js |
| B2-4 找真人 → handoff | ✅ 測試 | test/reply-pipeline.test.js（固定話術＋零模型呼叫） |
| B2-5 不編造價格 | ✅ 測試 | test/outcome.test.js（兜底＋[MISS] 判定） |

## 後端 B3 費用煞車

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| B3-1 月上限降級 | ✅ 測試 | test/monthly-limit.test.js（4999/5000/5001） |
| B3-2 速率限制 | ✅ 測試 | test/ratelimit.test.js（0/1/3/4/5、跨窗口、隔離） |

## 後端 B4 租戶隔離

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| B4-1 webhook 只用本戶金鑰/知識庫 | ✅ 測試 | test/prompt-isolation.test.js、test/webhook.test.js |
| B4-2 店家 API 只回自己資料 | ✅ 測試 | test/guard-isolation.test.js（跨戶 403） |

## 後端 B5 failover

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| B5-1 主敗切備援 | ✅ 測試 | test/failover.test.js |
| B5-2 全滅回忙碌 | ✅ 測試 | test/failover.test.js＋test/reply-pipeline.test.js（audit all_providers_failed） |

## 前端 F1 響應式

| 場景 | 覆蓋 | 說明 |
|---|---|---|
| F1-1 電腦 1440 側欄＋表格 | 🚶 人工走查 | 步驟 5 關 3（ego-browser 390/1440 雙寬度截圖） |
| F1-2 平板 800 漢堡＋雙欄卡片 | 🚶 人工走查 | 同上 |
| F1-3 手機 390 底部導覽＋無橫捲＋44px | 🚶 人工走查 | 同上（scrollWidth 斷言於走查時執行） |
| F1-4 1023/1024 邊界 | 🚶 人工走查 | 同上 |

## 前端 F2 知識庫

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| F2-1 新增 FAQ＋綠勾 1.5 秒 | 🚶 人工走查 | 關 3 走查（API 層 test/faqs-crud.test.js 已覆蓋 CRUD） |
| F2-2 手機編輯全螢幕 | 🚶 人工走查 | 關 3 |
| F2-3 失敗紅字保留內容 | 🚶 人工走查 | 關 3（web/app.js toast 錯誤路徑） |

## 前端 F3 對話篩選

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| F3-1 篩未命中＋加入知識庫 | ✅ API 測試＋🚶 UI | test/conversations-filter.test.js；UI 走查關 3 |
| F3-2 待真人紅點 | 🚶 人工走查 | 關 3（refreshHandoffBadge） |

## 前端 F4 綁定頁

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| F4-1 複製 webhook 網址 | 🚶 人工走查 | 關 3 |
| F4-2 金鑰遮罩 | ✅ 測試 | test/bind.test.js（回應無明文） |
| F4-3 全站 SVG 無 emoji | ✅ 測試 | build 時掃描零命中（progress-10 記錄） |

## 前端 F5 中台

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| F5-1 KPI 四卡 | ✅ API 測試＋🚶 UI | test/console.test.js（overview）；UI 關 3 |
| F5-2 停用店家 webhook 403 | ✅ 測試 | test/console.test.js＋test/webhook.test.js |
| F5-3 管理員看不到金鑰明文 | ✅ 測試 | test/bind.test.js、test/crypto.test.js |

## 前端 F6 Landing

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| F6-1 未登入訪客看到主張/三步驟/價格 | 🚶 人工走查 | 關 3 |
| F6-2 手機 CTA 滿寬置底 | 🚶 人工走查 | 關 3 |

## 模型設定（spec 補充）

| 場景 | 覆蓋 | 測試 |
|---|---|---|
| 自訂供應商生效 | ✅ 測試 | test/model-settings.test.js |
| 清空回平台預設 | ✅ 測試 | 同上 |
| 自訂金鑰無效不切換 | ✅ 測試 | 同上 |

**統計**：B1–B5 全數測試覆蓋；F1–F6 中 API/邏輯層已測，UI 互動層（emoji 掃描除外）排於步驟 5 關 3 人工走查——走查需已部署環境（LIFF 登入需真實 LINE），受「webhook 切換需老魚確認」阻塞。
