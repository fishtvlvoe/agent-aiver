## 1. 內容(等老魚提供)

- [x] 1.1 知識庫換成通用範例店家資料(需求「知識庫使用通用範例店家資料」;測試階段,老魚 2026-11-09 授權代理決定內容)。行為:LINE 詢問營業時間得到範例答案。驗證:遠端 D1 `bot_faq` 內容。測到的:已清除舊假資料,寫入 5 則(營業時間、商品、運費、退換貨、聯絡),`select` 回讀成立。還沒驗的:實際 LINE 對話回覆(併入 4.1 老魚手機驗收)
- [x] 1.2 法律頁面換成正式版(需求「法律頁面為正式版」)。行為:首頁連結開啟正式文字,無佔位字。驗證:`rg "Lorem|範本|佔位|placeholder" apps/marketing/content/legal` 無命中。測到的(2026-11-09):文字改寫自 fishot.com 的隱私權政策與服務條款,加上 LINE 登入、對話紀錄、第三方供應商與測試階段說明;marketing 單元測試 32 過。還沒驗的:線上頁面實際顯示與頁尾連結可點(合併、建置後);法律效力未經律師審閱,屬測試階段版本

## 2. 授權與語系(代理自行做)

- [x] 2.1 在 `admin.aiver.me` 重跑「連接 Cloudflare」(需求「Cloudflare 授權可用」)。行為:授權後回到後台顯示已連接。驗證:Playwright 或實測輸出。測到的(2026-11-09):老魚本人在 admin.aiver.me 完成授權,遠端 D1 `bot_audit_event` 最新一筆為 `cf_oauth_linked`(接在 `cf_oauth_disconnected` 之後 14 秒,membershipCount 1)。還沒驗的:授權後頁面顯示「已連接」的畫面截圖,併入 4.1 手機驗收
- [x] 2.2 移除非繁中語系(需求「介面只提供繁體中文」)。行為:缺鍵時顯示繁中。驗證:`pnpm type-check` 與單元測試通過。測到的(2026-11-09,PR #8):type-check 19/19、單元測試 auth 52、marketing 32、saas 26 全過;cookie 為 en 時 resolveLocale 回 zh-TW(locale-cookie.test.ts 4 例);zh-TW 四個 json 鍵數不少於原英文版(缺鍵 0)。還沒驗的:next build 與 Cloudflare 建置(合併後確認)

## 3. 重設密碼

- [x] 3.1 完整流程驗證(需求「重設密碼完整流程」)。行為:收信、點連結、改密碼、新密碼可登入。驗證:`scripts/verify-reset-password.sh`。測到的(2026-11-09,對 `admin.aiver.me`):連結開頭 `https://admin.aiver.me/api/auth/reset-password/`、改密碼回 `status:true`、新密碼登入 200、舊密碼登入 401。還沒驗的:瀏覽器內 `/reset-password` 頁面的操作與外觀(併入 4.1 真人驗收)

## 4. 真人驗收

- [ ] 4.1 老魚手機整套驗收(登入、設定 LINE、知識庫、對話紀錄、用量)。驗證:老魚回覆;意見記入 `acceptance-backlog.md`;狀態 [等老魚]
