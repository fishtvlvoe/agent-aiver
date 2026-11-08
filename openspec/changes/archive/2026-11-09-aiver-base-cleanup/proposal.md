## Why

底座 `opcos-cf-starter` 應只保留 LINE 登入,機器人功能全在 AIVER;另有 BNI 誤建資源待清。這些動到外部資源,先寫清楚,找時間再處理。

## What Changes

- 盤點底座機器人功能(已完成:main 上無機器人後台,只存在於未合併的 PR #12)。
- 決定 PR #12 的處理(建議關閉、保留分支)。
- 修復底座 GitHub 的 Cloudflare 金鑰後合併 PR #13。
- 清理 BNI 誤建資源。
- 修好 `cf-saas` 瀏覽器測試環境並更新驗收清單。

## Non-Goals

- 不改 AIVER 本身功能(屬 `aiver-finish`)。
- 不在未取得老魚同意前刪除任何外部資源。

## Capabilities

### New Capabilities

- `base-cleanup`: 底座與誤建資源的整理條件與同意關卡。

### Modified Capabilities

## Impact

`opcos-cf-starter`(PR #12、#13、GitHub 金鑰)、GitHub `line-ai-saas`、Pages `line-ai-saas`、D1 `line-ai-saas-db-v2`、Worker `line-ai-saas`、本機 `line-ai-saas`、`cf-saas`。
