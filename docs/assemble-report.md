# agent-aiver 獨立 repo 組裝報告

日期：2026-11-08
範圍：本機組裝，未 push、未呼叫 Cloudflare / wrangler 遠端、未修改原 `agent-aiver` 資料夾與底座 repo。

## 1. 做了什麼

- 底座來源：`product/line-ai-admin`（HEAD c351f4b，帶 `bot_*` 表與 D1 遷移）。`.git` 已刪，`git init`，沒有 remote。
- 客服 Worker：`apps/agent-aiver/` 併入參考庫 `Cloudflare-Worker-LINE`（HEAD 6a4333c）的 `src/`、`test/`、fixtures。
- 新增 `package.json`（`type: module`，test / type-check 腳本）、`wrangler.toml`（name `agent-aiver`，D1 與 KV id 皆 TODO）、`tsconfig.json`。
- 新增 `src/lib/cors.js`，白名單 `https://app.aiver.me`、`https://agent-aiver.pages.dev`；`src/index.js` 套用並處理 OPTIONS 204；回應字串改為 `agent-aiver ok`。
- 新增 `test/cors.test.js`（4 條）。
- 新增遷移 `packages/database/drizzle/migrations/0009_bot_store_persona.sql`，同步更新 `meta/_journal.json`（idx 9）、`meta/0009_snapshot.json`，並在 `schema/sqlite.ts` 的 `botStore` 加 `persona`。原因：`store.js` 讀取 `s.persona`，底座 schema 原本沒有。
- CI：`.github/workflows/ci.yml`（PR：install、test、type-check）；`deploy.yml`（push main：test + type-check → `d1 migrations apply DB --remote` → `wrangler deploy`，secrets 只用 `${{ secrets.CLOUDFLARE_API_TOKEN }}`、`CLOUDFLARE_ACCOUNT_ID`）。已刪除 `upstream-sync.yml`。
- `apps/saas/wrangler.jsonc`：prod 與 preview 的 D1 `database_id` 改為 `TODO`。
- 刻意不併入：參考庫 `migrations/0001–0005`（舊 tenants/faqs，已由 `bot_*` 取代）、`0003_seed_demo`、`src/lib/guard.js`、`session.js`（依賴 KV session，與底座 better-auth 衝突）、`test/fmt-sync.test.js`、`test/inline-handlers.test.js`（依賴已退役的 web/）、`scripts/build.js`、`scripts/width-scan.mjs`、`web/`。

## 2. 測試證據

`pnpm --filter agent-aiver test`（`node --test test/`）：

```
ℹ tests 91
ℹ pass 91
ℹ fail 0
```

（組裝前基線為 87/87，新增 CORS 4 條後為 91/91。）

`pnpm --filter agent-aiver type-check`：EXIT=0。

遷移驗證：以 `node:sqlite` 記憶體庫依序套用 journal 的 10 支遷移（0000–0009），全部成功；`bot_store` 欄位共 23 個，含 `persona`。

根目錄 `pnpm install` 成功（23.8 秒，pnpm 12.4.2）。`pnpm-lock.yaml` 已更新。

舊 id 掃描：全 repo（排除 node_modules）無 `4a2a5716`、`c873ff12`、`e4f3651d`、`5b415511` 殘留。

## 3. 已知問題與取捨

- **type-check 改為 `checkJs: false`**。開啟 `checkJs` 時有 45 個錯誤，全部來自參考庫既有程式：`src/providers/official.js` 3 個（`unknown` 未收斂）、測試 mock 回傳值與 `Response` 型別不符 42 個。修正需要重寫大量測試，超出本次範圍。目前 type-check 只保證語法與模組解析正確，不是完整型別檢查。
- **CI 未實跑**：本機沒有 GitHub remote，`ci.yml` 與 `deploy.yml` 只完成撰寫，未在 Actions 上驗證。
- **Wrangler 未驗證**：`wrangler.toml` 的 id 全為 TODO，未執行 `wrangler deploy --dry-run`，也未驗證 `migrations_dir` 相對路徑在 wrangler 下解析正確。
- **0009 快照未經 drizzle-kit 產生**：`0009_snapshot.json` 由 0008 複製並手動加入 `persona` 欄位，`id` 為隨機 UUID，`when` 時間戳為手填值。尚未用 `drizzle-kit check` 驗證。
- **底座 `apps/saas` 測試未跑**：只改了 wrangler 的 id，未驗證 saas 能否在 TODO id 下啟動。
- **README、CHANGELOG 仍為底座內容**：未重寫為客服 Worker 說明。`docs/cloudflare-adaptation.md` 來自底座，未審視。
- **Secrets 未設定**：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、解密金鑰（`CREDENTIAL_ENC_KEY` 或 `MASTER_KEY` 或 `LINE_CHANNEL_SECRET`）需由人在 GitHub 與 Cloudflare 設定，未寫入 repo。
- **尚未 git commit**：工作樹全部為未追蹤檔案。

## 4. 下一步

1. 建立新的 Cloudflare D1 與 KV，把 TODO id 填入 `apps/agent-aiver/wrangler.toml` 與 `apps/saas/wrangler.jsonc`。
2. 決定是否要修掉 45 個 checkJs 錯誤，再把 `checkJs` 打開。
3. 建立 GitHub remote 後推上去，實跑 CI 並附 Actions 結果。
4. 用 `wrangler deploy --dry-run` 驗證 wrangler 設定。
5. 用 `drizzle-kit check` 驗證 0009 快照。
