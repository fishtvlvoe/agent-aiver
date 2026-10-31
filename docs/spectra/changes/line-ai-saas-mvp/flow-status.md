# flow-status — line-ai-saas-mvp

> dev-flow 步驟進度表。每做完一步更新，記「做了、沒做、為什麼」。

| 步驟 | 狀態 | 備註 |
|---|---|---|
| ① GATE 對焦 | ✅ 做了 | 一句話複述＋規模判斷＋老魚 OK |
| ② 步驟 1 grilling | ✅ 做了 | 10 題，決策存 `docs/sr-drafts/line-ai-saas-notes.md`（11 項含 UI/UX 定案） |
| ③ UI/UX 定稿 | ✅ 做了 | 四份 demo HTML（docs/demo/）老魚看過定稿；DESIGN.md 用 opcosv2 版、SVG 圖示禁 emoji |
| ④ 步驟 2 兩份檔案 | ✅ 做了 | CONTEXT.md 詞彙表＋前後端 Gherkin（e2e/features/）老魚已確認 |
| ⑤ 步驟 3 Spectra SR | ✅ 做了 | proposal/design/3 specs/tasks 完成；老魚要求 analyze 全綠 → 補需求對照、任務掛需求名、14 場景補 Example；analyze 0 findings、validate 通過（2026-10-31 深夜複查） |
| ⑥ 步驟 4 派工實作 | ✅ 做了 | 前置已備齊：.env 已有 OpenAI/Cloudflare/mirasim key＋LINE 雙 channel 金鑰＋LIFF_ID＋APP_DOMAIN=app.aiver.me（2026-10-31，詳見 notes.md「環境與帳號設定」）。注意：測試 channel 2011708742 現掛舊 voice-agent webhook，串接前需老魚確認切換。 |
| ⑦ 步驟 5 四關驗收 | 🔶 部分 | 關 1 本功能 e2e：92 pass/0 fail 全綠 ✅；關 2 舊功能回歸：本專案無舊功能 N/A ✅；關 3 三身分 ego-browser 走查：需已部署環境＋真實 LIFF 登入，受 webhook 切換授權阻塞 🔶；關 4 Fish 白話驗收：待老魚 🔶 |
| ⑧ 步驟 6 收尾 | 🔶 部分 | 阻塞：專案目錄不在任何 git 版控（根 repo .gitignore `/*` 白名單排除，老魚 2026-10-18 定案），且無 remote。需老魚決定版控歸屬（加白名單進根 repo / 獨立 repo＋建 GitHub remote）才能 commit+PR。retro 待 PR 後。 |
| ⑨ 復盤 retro | ⬜ 沒做 | 待 commit/PR 解鎖後 |
| ⑩ 封存 archive | ⬜ 沒做 | 待 PR 合併＋retro 完成 |

## 已確認決策摘要（詳見 notes.md）

多租戶 SaaS／專用 webhook 路徑／半自助貼金鑰開通（B）／後台第一版 A（綁定＋FAQ＋對話）／模型平台統一可插拔／AI 只答 FAQ＋轉真人＋未命中收集／兩身分 LINE Login／UX 三預設／雙煞車（3 次/分＋5000/月）／Pages 靜態＋Worker 動態／三裝置 1024+768 雙斷點／SVG 圖示禁 emoji／opcosv2 DESIGN.md。
