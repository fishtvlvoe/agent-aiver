
## 2026-11-08 決定與回復資料
- 架構不變，只把 LINE 客服（含登入、後台）拉成獨立 repo `agent-aiver` 與獨立 CF 資源；資料全新。
- 切換 app.aiver.me、底座移除客服：驗證通過後再問老魚。
- CF OAuth：沿用既有 OPCOS 用戶端（Client ID 4945fa51a38ffdc8a49fbe6af858f1c1），金鑰重新產生，跳板站與新後台共用 STATE_KEY。
- LINE webhook 切換（老魚當場同意實測）：頻道 AIVER AI 語音助理 Messaging API（2011708742）
  - 舊網址（失敗時改回）：https://line-ai-saas.fishandy1213.workers.dev/webhook/store
  - 新網址：https://agent-aiver.fishandy1213.workers.dev/webhook/fish
