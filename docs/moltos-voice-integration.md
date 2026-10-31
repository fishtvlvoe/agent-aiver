# MOLTOS 語音模組架構與 Cloudflare Worker 串接指南

> 來源倉庫：https://github.com/fishtvlvoe/moltos
> 本地存放路徑：`/Users/fishtv/Development/B-產品/Cloudflare-Worker-LINE/docs/moltos`

---

## 1. 核心檔案導覽

MOLTOS（摩托斯）專案具備完整的雙向語音通話與語音辨識/合成架構，主要技術棧基於 **ElevenLabs Conversational AI** 與瀏覽器原生 **Web Speech API**：

| 檔案路徑（相對於 `docs/moltos/`） | 用途與職責 |
|---|---|
| [`lib/elevenlabs.ts`](file:///Users/fishtv/Development/B-產品/Cloudflare-Worker-LINE/docs/moltos/lib/elevenlabs.ts) | ElevenLabs Conversational AI 客戶端 helper、音量正規化、情緒標籤清除 (`stripEmotionTags`) |
| [`app/api/elevenlabs-signed-url/route.ts`](file:///Users/fishtv/Development/B-產品/Cloudflare-Worker-LINE/docs/moltos/app/api/elevenlabs-signed-url/route.ts) | 後端以 API Key 向 ElevenLabs 申請 Signed URL，避免前端暴露金鑰 |
| [`app/api/elevenlabs-webhook/route.ts`](file:///Users/fishtv/Development/B-產品/Cloudflare-Worker-LINE/docs/moltos/app/api/elevenlabs-webhook/route.ts) | 接收通話結束後的 Webhook，解析逐字稿 (Transcript)、通話時長與對話分析 |
| [`lib/speech.ts`](file:///Users/fishtv/Development/B-產品/Cloudflare-Worker-LINE/docs/moltos/lib/speech.ts) | 瀏覽器原生 Web Speech API 封裝（STT / TTS 退場備援） |
| [`openspec/specs/voice-conversation/spec.md`](file:///Users/fishtv/Development/B-產品/Cloudflare-Worker-LINE/docs/moltos/openspec/specs/voice-conversation/spec.md) | 語音通話狀態機（連線中、說話中、聆聽中、靜音偵測、錯誤處理）規範 |
| [`docs/dev/elevenlabs-api-reference.md`](file:///Users/fishtv/Development/B-產品/Cloudflare-Worker-LINE/docs/moltos/docs/dev/elevenlabs-api-reference.md) | ElevenLabs API 模型比較、計費與串接參考 |

---

## 2. 語音通話核心流程解析

### 2.1 ElevenLabs Signed URL 取得機制
為防止 `xi-api-key` 或私有 `agent_id` 暴露給客戶端，MOLTOS 透過伺服器端簽署臨時 URL：
```typescript
// GET /api/elevenlabs-signed-url
const response = await fetch(
  `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
  {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
    },
  }
);
const data = await response.json();
// 回傳 data.signed_url 供前端或 WebSocket 用戶端直連
```

### 2.2 文字情感情緒標籤清理 (`stripEmotionTags`)
ElevenLabs 回傳可能帶有情緒標記（例如 `[laughs]`、`[sighs]`），在轉音訊或文字呈現前需清洗：
```typescript
export function stripEmotionTags(text: string): string {
  return text.replace(/\[[^\]]*\]/g, '').trim();
}
```

### 2.3 Webhook 通話結果處理
通話完成後，ElevenLabs 會將通話紀錄非同步推送到 Webhook：
- `conversation_id`：通話唯一識別碼
- `transcript`：包含角色 (`user` / `agent`) 的逐字稿
- `analysis`：呼叫評估與摘要
- `status`：通話狀態

---

## 3. 在 Cloudflare Worker + LINE Bot 的串接應用

在 LINE 機器人情境下，語音串接主要分為兩種場景：

### 場景 A：處理使用者傳入的 LINE 語音訊息（Inbound Audio）
1. LINE Webhook 收到 `message.type === 'audio'`。
2. Worker 呼叫 LINE Data API 抓取音訊內容：
   ```http
   GET https://api-data.line.me/v2/bot/message/{messageId}/content
   Authorization: Bearer {LINE_CHANNEL_ACCESS_TOKEN}
   ```
3. Worker 將音訊轉發至語音辨識（STT），取得文字逐字稿。
4. 送入 AI 生成回覆。

### 場景 B：機器人回覆語音訊息（Outbound Audio）
1. AI 生成文字回覆。
2. 呼叫 TTS API 生成音訊（MP3/M4A）。
3. 將音訊檔暫存至 Cloudflare R2，取得公開 URL 與播放長度（毫秒）。
4. 呼叫 LINE Reply API 送出語音訊息：
   ```json
   {
     "type": "audio",
     "originalContentUrl": "https://r2.yourdomain.com/audio/response-123.mp3",
     "duration": 5000
   }
   ```

### 場景 C：LIFF 內嵌即時語音對話
若需要在 LINE 內使用即時雙向語音：
1. 透過 LINE LIFF 開啟網頁。
2. 採用 MOLTOS 的架構：
   - Worker 提供 `/api/voice-token`（Signed URL 或 Ephemeral Token）。
   - 前端透過 WebSocket 直連語音服務（ElevenLabs 或 xAI Voice Agent）。
   - 瀏覽器端使用 `@11labs/react` 或 WebRTC / WebSocket 進行音訊串流。
