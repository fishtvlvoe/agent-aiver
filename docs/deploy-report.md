# agent-aiver 部署報告

日期：2026-11-08
範圍：新 Cloudflare 資源、GitHub 分支與 PR、Worker 部署到 workers.dev、CI 守候。
未動：`app.aiver.me` 的 DNS 與 Pages 網域、舊 Worker `line-ai-saas`、任何既有 D1／KV、LINE 後台、main 分支。

## 1. 做了什麼與證據

### Cloudflare 資源（帳號 `6bbd30e22e41dd355b12126c69d38116`）

建立前先 `wrangler d1 list` 與 `wrangler kv namespace list` 確認同名不存在。

| 資源 | 名稱 | ID |
|---|---|---|
| D1 | `agent-aiver-db` | `a6526c36-ba8c-4a6a-a96f-8fa9f29343da` |
| KV | `agent-aiver-state` | `20e74ceec5b741e78466d59df9ccb866` |

遷移：`wrangler d1 migrations apply DB --remote` 套用 `0000`–`0009`，全部 ✅。

表名確認（遠端，共 21 張表）含 `bot_*`：
`bot_audit_event`、`bot_conversation`、`bot_faq`、`bot_store`、`bot_usage_counter`。

填入 TODO 的檔案：
- `apps/agent-aiver/wrangler.toml`：D1 `database_name` 由 `agent-aiver` 改為 `agent-aiver-db`，`database_id` 與 KV `id`、`preview_id` 已填入。
- `apps/saas/wrangler.jsonc`：prod 與 preview 的 `database_id` 皆填入上面的 D1 id。

### GitHub

- Repo：`fishtvlvoe/agent-aiver`（private）
- 分支：`standalone-rebuild`（由 `main` 建立，未推 main、未 force push）
- PR：**#1**（`standalone-rebuild` → `main`，未合併）
- 提交：`dc57f0c` 重建內容；`0444fa8` 修正 CI 測試腳本
- Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 已設定（`gh secret list` 可見，值未輸出）

### Worker 密鑰

- 程式讀取的解密金鑰順序為 `CREDENTIAL_ENC_KEY` → `MASTER_KEY` → `LINE_CHANNEL_SECRET`。本次只設 `CREDENTIAL_ENC_KEY`。
- 值以 `openssl rand -base64 48` 產生，存於來源資料夾 `.env`（權限 600，`.gitignore` 排除），並用 `wrangler secret put CREDENTIAL_ENC_KEY --name agent-aiver` 設定，輸出 `Uploaded secret CREDENTIAL_ENC_KEY`。
- LINE／LIFF：`/Users/fishtv/Development/.env` 中**沒有任何名稱含 LINE 或 LIFF 的變數**（只有 SHOPLINE_* 等）。因此本次沒有設任何 LINE 值。

### 部署

`wrangler deploy`（於 `apps/agent-aiver`）：

```
Uploaded agent-aiver (2.96 sec)
env.FORM_STATE (20e74ceec5b741e78466d59df9ccb866)  KV Namespace
env.DB (agent-aiver-db)                            D1 Database
Deployed agent-aiver triggers (0.92 sec)
  https://agent-aiver.fishandy1213.workers.dev
Current Version ID: 257d4159-da1d-4534-9518-ef0dec0dc0da
```

### 線上驗證（curl）

| 測試 | 結果 |
|---|---|
| `GET /` | HTTP 200，本文 `agent-aiver ok` |
| `GET /api/health`（帶 `Origin: https://app.aiver.me`） | HTTP 410，JSON `{"error":"舊後台已下線，請改用新後台"}` |
| `GET /` 帶 `Origin: https://app.aiver.me` | HTTP 200，`access-control-allow-origin: https://app.aiver.me`，`vary: Origin` |
| `OPTIONS /api/health` 帶 `Origin: https://app.aiver.me` | HTTP 204，ACAO 正確，`allow-methods: GET, POST, OPTIONS` |
| `GET /` 帶 `Origin: https://evil.example` | HTTP 200，**無** `access-control-allow-origin`（正確拒絕） |
| `GET /` 帶 `Origin: https://agent-aiver.pages.dev` | HTTP 200，ACAO 為該網域 |

### 本機測試（Node 22.19，對應 CI）

- 修正前 `node --test test/`：`Cannot find module .../test`，失敗（與 CI 相同）。
- 修正後 `node --test test/*.test.js`：`# tests 91 / # pass 91 / # fail 0`。

### CI（PR #1）

| 檢查 | 結果 |
|---|---|
| `test` | 第一次 fail（Node 22 將 `test/` 當模組載入）。修正後 **pass**（run `42483120692`，49 秒） |
| `GitGuardian Security Checks` | **fail**，見下方「未完成項」 |

修正輪數：1 輪（測試腳本），未超過 3 輪上限。

## 2. 未完成／未驗證

1. **GitGuardian 仍失敗（未解決）**。它偵測到 commit `dc57f0c` 中 `apps/agent-aiver/test/no-model-gate.test.js:88`，類型 Generic Password，incident `39823873`。這是測試用的假資料（`PASSWORD = "test-master-password"`、`"sk-own"`），不是真實憑證。但該 commit 已在 PR 歷史中，新 commit 無法清除掉偵測。可選的處理：
   - (a) 在 GitGuardian 後台把 incident `39823873` 標為 false positive／ignore（需要有後台權限的人操作）。
   - (b) 改寫分支歷史後 force push 到 `standalone-rebuild`（任務禁止，需你明確授權）。
   - 目前不做任何一項，等你決定。
2. **preview 與 prod 共用同一組 D1／KV**。`apps/saas/wrangler.jsonc` 的 prod 與 preview 都指向 `agent-aiver-db`，`wrangler.toml` 的 KV `id` 與 `preview_id` 也是同一個 namespace。任務只指定建一組，未另建 preview 資源。若要隔離，需要另建資源。
3. **LINE 頻道值未設定**。`.env` 沒有 LINE 相關變數，Worker 沒有全域 `LINE_CHANNEL_SECRET`／`LINE_CHANNEL_ACCESS_TOKEN`。程式的 webhook 會先讀 D1 中每個租戶加密存放的 secret（`webhook.js`），租戶資料由後台流程寫入。**尚未驗證真實 LINE webhook 能通過簽章驗證**，也沒有改 LINE 後台。
4. **`docs/cloudflare-adaptation.md` 等底座文件**未審視（沿用組裝報告的已知問題）。
5. **CI 的 `deploy.yml` 只會在 push main 時觸發**，本次未合併，因此 CI 部署路徑未實跑。
6. **未驗證 `wrangler deploy` 在 CI 中的 secrets 注入**，只確認了 secrets 已存在於 repo。

## 3. 下一步（需要你決定）

- 決定第 1 項 GitGuardian 的處理方式（a 或 b）。
- 決定 preview 是否需要獨立的 D1／KV。
- 提供 LINE 相關值（若要在 Worker 層設定全域值）。目前 `.env` 沒有。
