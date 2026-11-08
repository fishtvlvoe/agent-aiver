# Cloudflare 改造說明（給合併官方更新時參考）

本 repo 是 supastarter 官方版的改造版：`apps/saas` 跑在 Cloudflare Workers（OpenNext），資料庫用 D1，ORM 用 Drizzle（sqlite）。

- 官方版：`upstream-main`（remote `ours` 分支 `ours/upstream-main`，同步自 supastarter 官方 `main`）
- 改造版：`main`（remote `ours`，本檔所在版本）
- 差異查看：`git diff ours/upstream-main..ours/main --stat`

此文件是給 AI 解衝突與人工 review 用的說明書。每次官方更新合併時，**必須保留本檔列出的 Cloudflare 改造**，除非是官方明確改了同一段的功能邏輯，且已在 PR 內說明。

## 改動檔案與原因

| 檔案                                                          | 改了什麼                                                                                                                                                                             | 為什麼                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `apps/saas/wrangler.jsonc`                                    | 新增。Worker 名 `opcos-cf-starter`；D1 綁定 `DB`；`ASSETS`；`WORKER_SELF_REFERENCE`；`env.preview` 指向 `opcos-cf-starter-preview` 與測試 D1                                         | OpenNext 部署設定。wrangler 的 `env` 不會繼承 `services`、`d1_databases`、`assets`，所以 preview 必須完整重寫 |
| `apps/saas/open-next.config.ts`                               | 新增，`defineCloudflareConfig({})`                                                                                                                                                   | OpenNext 的 Cloudflare 設定，目前沒有額外選項                                                                 |
| `apps/saas/package.json`                                      | 新增 scripts `preview`、`deploy`；devDependencies 加 `@opennextjs/cloudflare`、`wrangler`                                                                                            | 本機預覽與部署指令                                                                                            |
| `apps/saas/next.config.ts`                                    | 移除 `@prisma/nextjs-monorepo-workaround-plugin` 與 `PrismaPlugin` 區塊                                                                                                              | 已不用 Prisma                                                                                                 |
| `apps/saas/.gitignore`                                        | 加 `.dev.vars`、`.open-next`、`.wrangler`                                                                                                                                            | 本機 secret 與 build 產物不進版控                                                                             |
| `packages/auth/auth.ts`                                       | `prismaAdapter(db, {provider: "postgresql"})` → `drizzleAdapter(db, {provider: "sqlite"})`；`requireEmailVerification` 改讀 `AUTH_REQUIRE_EMAIL_VERIFICATION`（僅 `"false"` 時關閉） | better-auth 改用 Drizzle sqlite；preview 不寄真信，需關閉驗證才能跑冒煙測試                                   |
| `packages/database/package.json`（續）                        | 移除 `generate`（Prisma）腳本                                                                                                                                                        | turbo 的 `type-check` 依賴 `generate`，沒有 `DATABASE_URL` 時 Prisma 會失敗；Drizzle 版不需要它               |
| `.github/workflows/validate-prs.yml`                          | **刪除**                                                                                                                                                                             | 官方版針對 Prisma／Postgres，與 Cloudflare 版不相容；檢查改由 `ci.yml` 的 `checks` job 執行                   |
| `.oxfmtrc.json`、`.gitignore`                                 | 格式檢查忽略 `drizzle/migrations/meta/**`；忽略本機 `.agent-brief/`                                                                                                                  | drizzle-kit 產生的 JSON 不格式化，避免噪音；交件報告不進版控                                                  |
| `packages/database/drizzle/client.ts`                         | 改用 `drizzle-orm/d1`。D1 binding 只有在 request 中才存在（`getCloudflareContext().env.DB`），所以用 Proxy 延遲建立 client                                                           | Workers 沒有 `DATABASE_URL`，連線靠 D1 binding                                                                |
| `packages/database/drizzle/drizzle.config.ts`                 | dialect `sqlite`，schema 指向 `schema/sqlite.ts`，輸出到 `drizzle/migrations`                                                                                                        | D1 用 sqlite；遷移檔由 drizzle-kit 產生、由 wrangler 套用                                                     |
| `packages/database/drizzle/queries/*.ts`                      | `ilike` → `like`；import 從 `schema/postgres` 改成 `schema/sqlite`                                                                                                                   | SQLite 沒有 `ilike`；schema 來源改為 sqlite                                                                   |
| `packages/database/drizzle/schema/index.ts`                   | `export * from "./sqlite"`                                                                                                                                                           | 同上                                                                                                          |
| `packages/database/drizzle/zod.ts`                            | 新增 `UserType` 型別匯出                                                                                                                                                             | 查詢層需要，原本 postgres 版沒有                                                                              |
| `packages/database/index.ts`                                  | `export * from "./drizzle"`（原為 `./prisma`）                                                                                                                                       | 整個 `@repo/database` 改用 Drizzle                                                                            |
| `packages/database/package.json`                              | 加 `@opennextjs/cloudflare`、`@cloudflare/workers-types`                                                                                                                             | D1 型別與 `getCloudflareContext`                                                                              |
| `packages/database/tsconfig.json`                             | exclude 改成 `prisma/**/*.ts`                                                                                                                                                        | Prisma 生成檔仍在 repo，但不參與型別檢查                                                                      |
| `packages/database/drizzle/migrations/`                       | 新增 `0000_clear_red_shift.sql`、`meta/_journal.json`、`meta/0000_snapshot.json`                                                                                                     | D1 遷移來源                                                                                                   |
| `pnpm-workspace.yaml`                                         | `allowBuilds` 加 `workerd: true`；catalog `next` 由 `^16.4.0` 改 `^16.4.3`                                                                                                           | workerd 需要 build 腳本；16.4.0 會被 Next 安全閘門擋下（SecurityFatalError）                                  |
| `pnpm-lock.yaml`                                              | 依上述依賴變動重新鎖定                                                                                                                                                               | —                                                                                                             |
| `.github/workflows/ci.yml`、`deploy.yml`、`upstream-sync.yml` | 新增                                                                                                                                                                                 | PR 驗證、main 部署、每週同步官方                                                                              |
| `scripts/cf-smoke.sh`                                         | 新增                                                                                                                                                                                 | 部署後 smoke test                                                                                             |

## 合併官方更新時必須保留的規則

1. **資料庫一律是 D1 + Drizzle sqlite**。官方若改 `schema/postgres.ts`，要同步到 `schema/sqlite.ts`（我們用的是 sqlite 版），不得把 postgres 版設成匯出來源。
2. **`packages/database/drizzle/client.ts` 保留 D1 版本**（Proxy + `getCloudflareContext`）。不得改回 `DATABASE_URL` 或 `node-postgres`。
3. **`packages/auth/auth.ts` 保留 `drizzleAdapter` + `provider: "sqlite"`**。
4. **`ilike` 一律改 `like`**（SQLite 沒有 `ilike`）。官方新增的查詢若用到 `ilike`，要改掉。
5. **Prisma 相關改動不還原**：`next.config.ts` 不加回 `PrismaPlugin`；`packages/database/index.ts` 保持 `./drizzle`。
6. **資料庫遷移**：官方改 schema 後，必須在 `packages/database` 用 `drizzle-kit generate` 產生新的 sqlite 遷移檔，並放進 `drizzle/migrations/`，不得手改已發佈的 SQL。`wrangler d1 migrations apply` 只認 `meta/_journal.json` 裡的檔。
7. **`wrangler.jsonc` 的 `env.preview` 與頂層 `d1_databases` 都要保留**，不得把 preview 的 D1 id 與正式的 D1 id 對調。
8. **版本釘選**：`next` 不得降回 `^16.4.0`（安全閘門會擋 build）。`@opennextjs/cloudflare`、`wrangler` 版本以 lockfile 為準。
9. **Secrets 不進 repo**：`BETTER_AUTH_SECRET` 用 `wrangler secret put`（正式與 preview 各一份）；本機用 `apps/saas/.dev.vars`（gitignore）。
10. _*NEXT_PUBLIC\_* 是 build 期間寫死的_*：`NEXT_PUBLIC_SAAS_URL` 會被 `packages/auth/auth.ts` 讀取。正式與 preview 必須各自 build，build 時在 workflow 環境變數帶入對應網址。
11. **官方若新增需要 Node 專屬 API（例如 `fs`、`child_process`）的功能，要先在 Workers 上確認可用**，不可直接假設可跑。
12. **`.github/workflows/validate-prs.yml` 同步官方時一律保持刪除**（它要求 `DATABASE_URL` 與 Prisma generate）。若官方新增檢查步驟，改加進 `ci.yml` 的 `checks` job。
13. **`AUTH_REQUIRE_EMAIL_VERIFICATION` 只允許在 preview 設為 `"false"`**，正式環境不設或設為其他值，維持要求信箱驗證。冒煙測試不得用改資料庫的方式把帳號標成已驗證。
14. **冒煙測試任一步非預期狀態碼都必須 exit 1**，CI 才會變紅。`scripts/cf-smoke.sh` 的 `request` 函式已實作此行為。
15. **正式站只跑唯讀冒煙**（`scripts/cf-smoke.sh --readonly`）：只檢查登入頁與 `get-session`，不註冊、不登入、不建組織，不在正式 D1 產生測試帳號。完整四步冒煙只用於 preview。

## 驗證指令

```bash
pnpm install
pnpm --filter @repo/database type-check
pnpm --filter @repo/auth type-check
pnpm --filter saas type-check
cd apps/saas && pnpm exec opennextjs-cloudflare build
pnpm exec wrangler d1 migrations apply DB --local
```

部署後的 smoke test：`scripts/cf-smoke.sh <BASE_URL>`。
