# 後端 Gherkin 測試劇本 — LINE AI 店家機器人 SaaS

> 放 `e2e/features/backend/`。繁中「假設／當／那麼」。對應 SR tasks.md 勾選依據。

## B1. 租戶開通與綁定

```gherkin
功能: 店家自助綁定 LINE channel
  背景: 平台已存在一個租戶「老張牛肉麵」，slug 為 lao-zhang

  場景: 店家貼上有效的金鑰完成綁定
    假設 店家已在 LINE Developers 取得有效的 channel secret 與 access token
    當 店家在後台送出這兩把金鑰
    那麼 系統呼叫 LINE API 驗證成功
    並且 顯示「已連線」綠燈
    並且 產生 webhook 網址 https://<網域>/webhook/lao-zhang

  場景: 金鑰無效
    當 店家送出一把 LINE 拒絕的 access token
    那麼 系統顯示「金鑰無效，請確認後重試」
    並且 綁定狀態維持「未連線」

  場景: 金鑰明文不可外洩
    假設 綁定已完成
    當 任何人（含平台管理員）呼叫後台 API 讀取金鑰
    那麼 只回傳遮罩後的值（••••1234），不回傳明文
```

## B2. Webhook 收訊與 AI 回覆（核心）

```gherkin
功能: 客人傳訊給店家，AI 依知識庫回覆
  背景: 租戶 lao-zhang 已連線，知識庫有「週日公休。平日 11:00–20:00。」

  場景: 問到知識庫有的問題
    當 LINE 把客人訊息「你們週日有開嗎？」推到 /webhook/lao-zhang
    那麼 Worker 用 lao-zhang 的 channel secret 驗簽成功
    並且 呼叫模型（prompt 含知識庫內容）
    並且 透過 Reply API 回覆客人，內容提到週日公休
    並且 這則對話寫入 conversations，狀態為 resolved

  場景: 簽名驗證失敗直接拒絕
    當 請求的 X-Line-Signature 與 channel secret 不符
    那麼 Worker 回傳 401，不呼叫模型、不寫資料

  場景: 知識庫答不出來 → 未命中
    當 客人問「你們有賣寵物餐嗎？」（知識庫無相關內容）
    那麼 機器人回覆兜底話術「這題我確認後回覆您」
    並且 對話標記 missed，出現在後台「未命中問題」

  場景: 客人要求真人 → 待真人
    當 客人傳「我要找真人」
    那麼 機器人回覆「已幫您轉達，真人會盡快回覆」
    並且 對話標記 handoff，後台「待真人處理」計數 +1

  場景: 只依知識庫回答，不編造價格
    當 客人問「折扣碼多少？」（知識庫無折扣碼資訊）
    那麼 回覆不得出現任何自創折扣碼或價格
```

## B3. 費用安全機制

```gherkin
功能: AI 費用煞車
  背景: 租戶 lao-zhang 本月已回覆 4,999 則，上限 5,000

  場景: 達到月上限後降級
    當 第 5,001 則訊息進來
    那麼 機器人回覆「店家將盡快親自回覆您」，不呼叫模型
    並且 後台用量顯示 5,000/5,000 與超限標示

  場景: 同一客人 1 分鐘第 4 次
    當 同一 userId 在 60 秒內收到第 4 則回覆請求
    那麼 不回覆 AI 內容，回覆「請稍等，我們盡快回覆」
    並且 記錄 rate_limited 事件
```

## B4. 租戶隔離

```gherkin
功能: 店家資料互相隔離
  場景: A 店家的 webhook 不能回 B 店家的訊息
    假設 訊息是從 lao-zhang 的 channel 送來
    當 Worker 處理 /webhook/lao-zhang
    那麼 回覆使用 lao-zhang 的 access token
    並且 prompt 只含 lao-zhang 的知識庫

  場景: 店家登入後台只看得到自己
    當 lao-zhang 的管理者呼叫 /api/conversations
    那麼 回傳的每一列 tenant_id 都是 lao-zhang
```

## B5. 模型路由（可插拔）

```gherkin
功能: 模型後端 failover
  場景: 主要模型供應商逾時 → 自動切備援
    假設 主要供應商（官方 API）回應超過 10 秒
    當 Worker 呼叫主要供應商失敗
    那麼 自動改呼叫備援供應商
    並且 客人仍收到回覆（延遲可接受）
    並且 記錄 failover 事件供平台中台查看
```
