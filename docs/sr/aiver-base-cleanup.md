# SR:底座整理與外部資源清理(找時間再處理)

狀態:Draft(2026-11-08 建立)。**下列涉及外部資源或底座的項目,動手前逐項取得老魚同意。**

## 目標
讓底座(`opcos-cf-starter`)只留 LINE 登入,機器人功能全部在 AIVER;清掉誤建的 BNI 相關資源。

## 任務
- [ ] 1. 列出底座要移除的機器人功能清單(唯讀盤點,代理自行做)。
- [ ] 2. PR #12(`product/line-ai-admin`,新增 19,100 行店家機器人後台)的處理建議:關閉、保留或拆分。老魚決定。
- [ ] 3. PR #13(連線腳本)合併。CI 的預覽部署因 GitHub 上的 Cloudflare 金鑰失效而失敗(Authentication error 10000,與本 PR 內容無關),需先更新該金鑰,或確認合併可略過。
- [ ] 4. 從底座移除機器人功能。需老魚同意。
- [ ] 5. 清理 BNI 誤建資源:GitHub `line-ai-saas`、Pages `line-ai-saas`、D1 `line-ai-saas-db-v2`、本機 `B-產品/products/line-ai-saas`、舊 Worker `line-ai-saas`。刪除前逐一列內容確認,需老魚同意。
- [ ] 6. `cf-saas` 瀏覽器測試環境:15 個畫面測試啟動瀏覽器就失敗,查原因並讓全套 e2e 可跑;跑通後更新 `cf-saas` 驗收清單 R1-2。
- [ ] 7. `cf-saas` 驗收意見記進 `acceptance-backlog.md`。

## 驗收
- 1、2:清單與建議文件。
- 3:PR 合併且 CI 全綠。
- 4:底座測試全綠,LINE 登入仍可用。
- 5:刪除前後清單對照,附輸出。
- 6:`playwright test` 全部通過,附輸出。

## 人類關卡
- 2、4、5 需要老魚同意(外部資源、不可逆)。
