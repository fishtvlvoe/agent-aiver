## Purpose

定義底座整理與誤建資源清理的條件,確保外部資源只在取得老魚同意後才被動到。

## ADDED Requirements

### Requirement: 底座只保留 LINE 登入
底座 main SHALL NOT 包含 LINE 機器人後台功能。

#### Scenario: 盤點底座
- **WHEN** 列出底座 main 的檔案
- **THEN** LINE 相關檔案只有登入與身分相關,無機器人後台

### Requirement: 外部資源刪除需同意
刪除任何外部資源(倉庫、Pages、D1、Worker、本機專案)前,系統 SHALL 先列出內容並取得老魚逐項同意。

#### Scenario: 刪除 D1 資料庫
- **WHEN** 準備刪除 `line-ai-saas-db-v2`
- **THEN** 先列出資料表與筆數並取得老魚同意,刪除後附前後對照

### Requirement: 底座 PR 需 CI 全綠才合併
底座 PR SHALL 在 CI 全綠後才合併。

#### Scenario: 合併連線腳本 PR
- **WHEN** PR #13 準備合併
- **THEN** Cloudflare 金鑰已修復且所有檢查通過

### Requirement: cf-saas 畫面測試可執行
`cf-saas` 的 `playwright test` SHALL 能啟動瀏覽器並跑完全部測試。

#### Scenario: 執行全部測試
- **WHEN** 執行 `pnpm exec playwright test`
- **THEN** 51 個測試(含 15 個畫面測試)全部通過
