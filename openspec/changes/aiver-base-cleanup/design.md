## Context

底座 main 只有 LINE 登入與 supastarter 內建 `chatbot` 範例頁;機器人後台只在 PR #12(105 檔,+19,100/-98)。BNI 誤建資源與 AIVER 無關聯。

## Goals / Non-Goals

**Goals:** 底座乾淨、資源清單明確、每個刪除動作有同意與前後對照。

**Non-Goals:** 改動 AIVER。

## Decisions

- 不合併 PR #12;建議關閉但保留分支,內容已在 AIVER。老魚決定。
- 任何刪除前先列內容(`ls`、清單),逐項取得老魚同意,再執行並附前後對照。
- `cf-saas` 瀏覽器問題與清理分開處理,不阻擋其他項。

## Risks / Trade-offs

- 誤刪仍被引用的資源 → 刪前查引用、逐項同意。
- #13 的 CI 失敗與內容無關,若不修金鑰就無法綠燈合併 → 先修金鑰或由老魚決定略過。
