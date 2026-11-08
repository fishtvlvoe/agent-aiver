## 1. 盤點與決定

- [x] 1.1 底座機器人功能清單(需求「底座只保留 LINE 登入」)。行為:確認 main 無機器人後台。驗證:2026-11-08 對 origin/main 檔案清單盤點,結論見 design.md
- [x] 1.2 PR #12 處理決定。行為:老魚決定關閉、保留或拆分。驗證:老魚回覆記入 `docs/decisions.md`;狀態 [等老魚]。測到的(2026-11-09):老魚同意關閉;底座 PR #12 狀態 CLOSED,分支 product/line-ai-admin 仍在遠端。

## 2. 底座 PR

- [x] 2.1 修復底座 GitHub 的 Cloudflare 金鑰(驗證錯誤 10000)。驗證:PR #13 預覽部署檢查通過;需老魚同意改金鑰。測到的(2026-11-09):老魚同意;以 .env 的 Workers 金鑰(先驗證 active)更新底座 GitHub secret CLOUDFLARE_API_TOKEN,重跑 CI,PR #13 三項檢查全綠(含預覽部署與 smoke test)。
- [x] 2.2 合併 PR #13(需求「底座 PR 需 CI 全綠才合併」)。驗證:合併後 CI 全綠;狀態 [等老魚]。測到的(2026-11-09):老魚說合併;底座 PR #13 已合併,main 上 CI 跑完 success。

## 3. 清理誤建資源(每項需老魚同意)

- [x] 3.1 GitHub `line-ai-saas` 與 Pages `line-ai-saas`(需求「外部資源刪除需同意」)。驗證:刪前列內容、刪後查詢不存在;狀態 [等老魚]。測到的(2026-11-09):老魚同意;GitHub repo line-ai-saas 與 Pages line-ai-saas 已刪,查詢皆回找不到。
- [x] 3.2 D1 `line-ai-saas-db-v2` 與舊 Worker `line-ai-saas`。驗證:刪前列資料表與筆數、刪後查詢;狀態 [等老魚]。測到的(2026-11-09):老魚同意;D1 line-ai-saas-db-v2(7 表全 0 筆)已刪;Worker line-ai-saas 已刪(刪前查無其他 Worker 的 service binding、無網域路由,底座 repo 無引用),查詢皆不存在,app.aiver.me 仍 200。還沒驗的:D1 line-ai-saas-db(10/31)內容未看,未刪。
- [x] 3.3 本機 `B-產品/products/line-ai-saas`。驗證:刪前 `ls` 與 `git status`;狀態 [等老魚]。測到的(2026-11-09):老魚說「搬出再刪」;刪前發現 reference/Cloudflare-Worker-LINE 是 AIVER 第一代,有 86 個未推送提交,已搬到 B-產品/products/agent-aiver-legacy-worker(提交數 101 不變,不推 GitHub,內有 .env);外層 .env/.dev.vars 的鍵經比對皆與 agent-saas-demo 同值;外層資料夾已刪,查詢不存在。還沒驗的:86 個提交的功能是否已在 agent-aiver 重做。

## 4. cf-saas

- [x] 4.1 查瀏覽器一啟動就關閉的原因並修好(對應需求「cf-saas 畫面測試可執行」)。行為:全套 e2e 可跑。驗證:`pnpm exec playwright test` 全過。測到的(2026-11-09):原因是 Playwright 1.58.0 需要 `chromium_headless_shell-1208`,本機只有 1248 版;`playwright install` 下載成功但解壓卡死(逾時 exit 124,目錄只有 1.5 MB)。改用系統 unzip 解壓同一個官方 zip(95,530,994 位元組),執行檔 `--version` 回 145.0.7632.6,完整 e2e 50 個全過(原寫 51 為誤植,實際共 50 個、10 個檔)。還沒驗的:Playwright 內建解壓為何卡住,根因未查;其他機器重裝可能再遇到,改用系統 unzip 即可
- [x] 4.2 更新 `cf-saas` 驗收清單 R1-2 並記驗收意見。驗證:`docs/acceptance/acceptance-backlog.md` diff。測到的(2026-11-09):R1-2 由「未做」改為「已補」並附 commit f9f2cce 與 e2e 結果;檔案在 cf-saas repo 的 docs/acceptance/。還沒驗的:真人看付款頁畫面
