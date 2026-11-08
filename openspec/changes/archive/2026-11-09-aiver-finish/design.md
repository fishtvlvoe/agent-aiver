## Context

AIVER 已在 `app/admin/bot.aiver.me` 上線,推 main 即由 Cloudflare 建置部署。剩下的是內容與收尾,不涉及架構改動。

## Goals / Non-Goals

**Goals:** 內容真實、授權可用、語系精簡、重設流程完整、老魚真人驗收一次。

**Non-Goals:** 新功能、底座整理。

## Decisions

- 知識庫與法律文字由老魚提供;代理先備好填寫格式與版面位置,不自行編造。
- 語系只留 zh-TW,其他語系先移除,缺鍵退回繁中(沿用 dev-flow 規則 12)。
- 重設密碼以 AgentEmail 信箱收信驗證(見 `docs/decisions.md`),不請老魚轉寄。

## Risks / Trade-offs

- 移除語系可能漏改引用處 → 以型別檢查與單元測試擋下。
- 內容尚未到位時,第 1、2 項無法勾選 → 明列為等老魚。
