# xAI 語音串接資料與開發規格指南

> Console 來源：https://console.x.ai/team/9147f831-4b43-482d-ae89-2a28f3980c45/api-keys
> 團隊名稱：`rotisserie-viperfish-swimwear`
> 團隊 ID：`9147f831-4b43-482d-ae89-2a28f3980c45`

---

## 1. xAI 後台既有資源盤點

### 1.1 現有 API 金鑰清單
在該 Team 後台已建立以下 5 組金鑰：

| 金鑰名稱 | 金鑰預覽（Prefix / Suffix） | 狀態 | 建議用途 |
|---|---|---|---|
| `voice-agent-aiver` | `xai-...h1Pr` | 啟用 | 語音 Agent (Aiver) 專用 |
| `buygo-voice-hub` | `xai-...k4MD` | 啟用 | 賣場語音中心 |
| `bni-ai-saas-voice-agent` | `xai-...IjVN` | 啟用 | BNI SaaS 語音 Agent |
| `bni-line-bot-voice-spike` | `xai-...2zXw` | **已換發 (Rotated)** | **已寫入 .env (`XAI_API_KEY`)，全端點與模型可用** |
| `dify` | `xai-...bIgE` | 啟用 | Dify 外部平台整合 |

> [!TIP]
> `bni-line-bot-voice-spike` 已於 2026-10-31 成功執行 Rotate key，並實測通過 API 權限驗證（ACL: `api-key:model:*`, `api-key:endpoint:*`）。完整金鑰已寫入本專案與全域 `.env` 的 `XAI_API_KEY` 變數中。

### 1.2 現有 Voice Agents（語音代理人）
後台已有 2 個配置好的 Voice Agent：

| Agent 名稱 | Agent ID | 預設聲音 | 狀態 | WebSocket 串接端點 |
|---|---|---|---|---|
| **Aiver** | `agent_rwIeYJzbwTiNgfYB` | Carina (Multilingual) | Published (Live) | `wss://api.x.ai/v1/realtime?agent_id=agent_rwIeYJzbwTiNgfYB` |
| **AI 小華** | `agent_QunwnyBxY2AvgVaa` | 預設語音 | Published (Live) | `wss://api.x.ai/v1/realtime?agent_id=agent_QunwnyBxY2AvgVaa` |

---

## 2. xAI 語音 API 完整規格

Base URL：`https://api.x.ai`
WebSocket Realtime URL：`wss://api.x.ai/v1/realtime`

### 2.1 語音轉文字（Speech to Text / STT）
將使用者的語音檔轉為逐字稿，支援 LINE 音訊格式（m4a, mp3, ogg, wav）。

- **端點**：`POST https://api.x.ai/v1/stt`
- **標頭**：`Authorization: Bearer $XAI_API_KEY`
- **Body**：`multipart/form-data`
  - `model`：`grok-voice-transcribe-2.0`
  - `file`：音訊檔案二進位資料
  - `language`（選填）：`zh` 或 `zh-TW`

**cURL 範例**：
```bash
curl -X POST https://api.x.ai/v1/stt \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -F model=grok-voice-transcribe-2.0 \
  -F file=@audio.m4a
```

**回傳格式**：
```json
{
  "text": "你好我想詢問這週有營業嗎"
}
```

---

### 2.2 文字轉語音（Text to Speech / TTS）
將 AI 的文字回覆合成為語音檔（MP3 或 PCM），用於回傳給 LINE 使用者。

- **端點**：`POST https://api.x.ai/v1/tts`
- **標頭**：
  - `Authorization: Bearer $XAI_API_KEY`
  - `Content-Type: application/json`
- **Body**（JSON）：
  ```json
  {
    "text": "你好！我們本週六日正常營業，營業時間為上午 10 點至下午 6 點。",
    "voice_id": "carina",
    "language": "zh"
  }
  ```
- **支援聲音**：`carina`（多語言推薦）、`eve`（預設）、或已建立之自訂聲音 ID。
- **回傳**：二進位音訊檔案（Content-Type: `audio/mpeg`）。

**cURL 範例**：
```bash
curl -X POST https://api.x.ai/v1/tts \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好，這是測試語音。",
    "voice_id": "carina",
    "language": "zh"
  }' \
  --output reply.mp3
```

---

### 2.3 即時雙向語音 Agent（Speech to Speech Realtime WebSocket）
透過 WebSocket 進行即時低延遲語音對話，支援打斷（Interruption）、Server VAD（靜音偵測）與 Tool Calling。

- **連線網址**：
  - 指定既有 Agent：`wss://api.x.ai/v1/realtime?agent_id=agent_rwIeYJzbwTiNgfYB`
  - 指定模型：`wss://api.x.ai/v1/realtime?model=grok-voice-latest`
- **連線標頭**：`Authorization: Bearer $XAI_API_KEY`

**主要事件協定**：
1. **建立對話項目（文字/音訊）**：
   ```json
   {
     "type": "conversation.item.create",
     "item": {
       "type": "message",
       "role": "user",
       "content": [{ "type": "input_text", "text": "你好！" }]
     }
   }
   ```
2. **觸發回應**：
   ```json
   { "type": "response.create" }
   ```
3. **接收逐字稿增量串流**：
   - 事件：`response.output_audio_transcript.delta`
   - 欄位：`event.delta`（字串片段）
4. **接收音訊串流**：
   - 事件：`response.output_audio.delta`
   - 欄位：`event.delta`（Base64 編碼之 PCM 音訊）

---

### 2.4 客戶端暫態憑證（Ephemeral Tokens）
若要在 LIFF 前端或瀏覽器直接連線 xAI Realtime WebSocket，不可在前端暴露 `XAI_API_KEY`，需由 Worker 後端發放暫態金鑰：
- **端點**：`POST https://api.x.ai/v1/realtime/client_secrets`
- **標頭**：`Authorization: Bearer $XAI_API_KEY`
- **用途**：產生短時效 Token（幾分鐘內有效），僅限該連線使用。

---

## 3. Cloudflare Worker 實作程式碼範例

### 3.1 Worker 處理 LINE 傳來的語音訊息（STT 轉文字）
```typescript
/**
 * 處理 LINE Audio Message
 * @param messageId LINE 訊息 ID
 * @param lineToken LINE Channel Access Token
 * @param xaiKey xAI API Key
 */
export async function transcribeLineAudio(
  messageId: string,
  lineToken: string,
  xaiKey: string
): Promise<string> {
  // 1. 從 LINE Data API 下載音訊內容
  const lineAudioRes = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: {
        Authorization: `Bearer ${lineToken}`,
      },
    }
  );

  if (!lineAudioRes.ok) {
    throw new Error(`無法取得 LINE 錄音檔: ${lineAudioRes.statusText}`);
  }

  const audioBlob = await lineAudioRes.blob();

  // 2. 打包成 FormData 送交 xAI STT
  const formData = new FormData();
  formData.append('model', 'grok-voice-transcribe-2.0');
  formData.append('file', audioBlob, `${messageId}.m4a`);

  const sttRes = await fetch('https://api.x.ai/v1/stt', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${xaiKey}`,
    },
    body: formData,
  });

  if (!sttRes.ok) {
    const errText = await sttRes.text();
    throw new Error(`xAI STT 辨識失敗: ${errText}`);
  }

  const result = (await sttRes.json()) as { text: string };
  return result.text;
}
```

### 3.2 Worker 產生語音並回傳給 LINE（TTS 合成語音訊息）
```typescript
/**
 * 將 AI 文字轉為語音並透過 R2 產生公開網址送回 LINE
 */
export async function generateSpeechReply(
  text: string,
  xaiKey: string,
  r2Bucket: R2Bucket,
  publicR2UrlBase: string
): Promise<{ audioUrl: string; durationMs: number }> {
  // 1. 呼叫 xAI TTS
  const ttsRes = await fetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${xaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: 'carina',
      language: 'zh',
    }),
  });

  if (!ttsRes.ok) {
    throw new Error(`xAI TTS 生成失敗: ${await ttsRes.text()}`);
  }

  const audioBuffer = await ttsRes.arrayBuffer();
  const fileKey = `voice-replies/${crypto.randomUUID()}.mp3`;

  // 2. 上傳到 Cloudflare R2
  await r2Bucket.put(fileKey, audioBuffer, {
    httpMetadata: {
      contentType: 'audio/mpeg',
    },
  });

  // 3. 預估播放秒數（或讀取音訊標頭，約 1 字 250ms）
  const durationMs = Math.max(1000, text.length * 250);
  const audioUrl = `${publicR2UrlBase}/${fileKey}`;

  return { audioUrl, durationMs };
}
```
