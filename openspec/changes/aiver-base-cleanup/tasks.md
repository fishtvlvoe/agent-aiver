## 1. 盤點與決定

- [x] 1.1 底座機器人功能清單(需求「底座只保留 LINE 登入」)。行為:確認 main 無機器人後台。驗證:2026-11-08 對 origin/main 檔案清單盤點,結論見 design.md
- [x] 1.2 PR #12 處理決定。行為:老魚決定關閉、保留或拆分。驗證:老魚回覆記入 `docs/decisions.md`;狀態 [等老魚]。測到的(2026-11-09):老魚同意關閉;底座 PR #12 狀態 CLOSED,分支 product/line-ai-admin 仍在遠端。

## 2. 底座 PR

- [x] 2.1 修復底座 GitHub 的 Cloudflare 金鑰(驗證錯誤 10000)。驗證:PR #13 預覽部署檢查通過;需老魚同意改金鑰。測到的(2026-11-09):老魚同意;以 .env 的 Workers 金鑰(先驗證 active)更新底座 GitHub secret CLOUDFLARE_API_TOKEN,重跑 CI,PR #13 三項檢查全綠(含預覽部署與 smoke test)。
- [ ] 2.2 合併 PR #13(需求「底座 PR 需 CI 全綠才合併」)。驗證:合併後 CI 全綠;狀態 [等老魚]

## 3. 清理誤建資源(每項需老魚同意)

- [ ] 3.1 GitHub `line-ai-saas` 與 Pages `line-ai-saas`(需求「外部資源刪除需同意」)。驗證:刪前列內容、刪後查詢不存在;狀態 [等老魚]
- [ ] 3.2 D1 `line-ai-saas-db-v2` 與舊 Worker `line-ai-saas`。驗證:刪前列資料表與筆數、刪後查詢;狀態 [等老魚]
- [ ] 3.3 本機 `B-產品/products/line-ai-saas`。驗證:刪前 `ls` 與 `git status`;狀態 [等老魚]

## 4. cf-saas

- [ ] 4.1 查瀏覽器一啟動就關閉的原因並修好(對應需求「cf-saas 畫面測試可執行」)。行為:全套 e2e 可跑。驗證:`pnpm exec playwright test` 51 個全過
- [ ] 4.2 更新 `cf-saas` 驗收清單 R1-2 並記驗收意見。驗證:`docs/acceptance/acceptance-backlog.md` diff
