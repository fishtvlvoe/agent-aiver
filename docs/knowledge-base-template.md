# 知識庫填寫範本（店家內容）

> 對應 SR aiver-finish 的 1.1、1.2。本文件只提供格式與空白範本，不含任何真實店家內容。
> 老闆貼上自己的資料即可使用；範本中的「請填入」是佔位字，必須換成真實內容，不能保留。

## 1. 知識庫的組成

機器人回覆客人時，只會依下列兩部分的內容作答，沒寫的資料一律不會編造：

| 區塊 | 寫在哪裡 | 內容 | 限制 |
|---|---|---|---|
| 店家名稱 | 組織（店家）設定 | 會出現在店家卡，給機器人辨識店家 | 以系統內的組織名稱為準 |
| 說話風格（可選） | 後台「模型設定」頁的 PersonaForm | 例如「像年輕小編，愛用語助詞」 | 不可違反系統鐵則 |
| 知識庫問答 | 後台「知識庫」頁的 KnowledgeBlock | 一則一則的問與答 | 問題最多 200 字，回答最多 2000 字 |

營業時間、商品、運費、退換貨等，都是寫成「問答」放進知識庫。目前系統沒有獨立的「營業時間」或「商品」欄位，三段式範本只是幫老闆整理內容，每一則仍要逐筆新增到知識庫。

## 2. 匯入方式

目前沒有批次匯入功能，也沒有 CSV／Excel 上傳。

1. 登入後台，進入該店家的「知識庫」頁（路徑：`/{organizationSlug}/knowledge`）。
2. 按「新增問答」，填入「客人會怎麼問」與「回答」，儲存。
3. 重複步驟 2，直到範本的每一則都填完。
4. 修改或刪除：在列表點「編輯」或「刪除」。

說明：`packages/database/scripts/migrate-bot-data.ts` 是把舊 Cloudflare Worker 的資料遷移到新系統用的一次性腳本，不是給老闆用的匯入功能。

## 3. 填寫範本（複製後以真實內容取代「請填入」）

```text
【店家名稱】
請填入：店家正式名稱

【說話風格（可選，留空即可）】
請填入：例如「親切、簡短、像朋友聊天」

【營業時間】（每一行一則，建議各自新增為一則知識庫問答）
問：請填入客人可能會問的問題，例如「你們幾點營業？」
答：請填入真實回答，例如「請填入營業日與時段」

問：請填入，例如「週末有營業嗎？」
答：請填入

【商品】（每個商品一則）
問：請填入，例如「請填入商品名稱的常見問法」
答：請填入商品說明、價格、庫存狀況（沒有的資料請不要填猜測值）

問：請填入
答：請填入

【常見問答】（運費、付款、退換貨、取貨方式等）
問：請填入，例如「運費怎麼算？」
答：請填入真實規則

問：請填入，例如「可以貨到付款嗎？」
答：請填入
```

填寫注意：
- 價格、庫存、活動期間等數字，只填老闆確認過的內容。知識庫沒寫的數字，機器人不會給，只會回「我確認後，再回覆你」。
- 每則回答建議一到三句話，超過 2000 字會無法儲存。
- 問題用客人實際會打的說法來寫，多寫幾種常見問法，比寫一則很長的問題更容易命中。

## 4. 現有測試資料位置（僅供開發參考，不是店家內容）

以下資料都是測試用的假資料，正式上線前不得當作店家內容使用。

| 位置 | 內容 | 說明 |
|---|---|---|
| `apps/agent-aiver/test/store.test.js:73` | `INSERT INTO bot_faq`，含「運費？／滿 599 免運」「批發價？」等 | 測試租戶隔離，`:204-211` 驗證只回本店 FAQ |
| `apps/agent-aiver/test/reply-pipeline.test.js:7` | `FAQS = [{ question: "運費？", answer: "滿 599 免運" }]` | 整合測試的假 D1 回傳值 |
| `apps/agent-aiver/test/prompt.test.js:8` | `faqs = [{ question: "運費？", ... }]` | prompt 組裝測試 |
| `apps/agent-aiver/test/prompt-isolation.test.js:18-19` | 假資料含「B 店機密批發價」 | 驗證他戶 FAQ 不會進 prompt |
| `packages/api/modules/bot/bot-faq.test.ts:117、130` | 「營業時間幾點？」 | 後台 API 的 mock 資料 |
| `apps/agent-aiver/test/fixtures/bot-migrations/0002_keen_hardball.sql` | `bot_faq` 表結構 | 只有 schema，沒有資料 |

目前沒有任何 seed 腳本會在開發庫寫入店家資料；店家資料都要由老闆自己在後台新增。

## 5. 資料表與程式位置（給開發者）

- 資料表：`bot_faq`（欄位 `id`、`organizationId`、`question`、`answer`、`updatedAt`）
- 寫入 API：`packages/api/modules/bot/procedures/create-faq.ts`、`update-faq.ts`、`delete-faq.ts`
- 讀取（回覆用）：`apps/agent-aiver/src/lib/store.js` 的 `getFaqs(env, tenant)`，依 `organizationId` 過濾
- 組 prompt：`apps/agent-aiver/src/lib/prompt.js` 的 `buildPrompt`，FAQ 為全量傳入，無知識庫時標示「知識庫目前無資料」
