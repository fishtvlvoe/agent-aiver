# language: zh-TW
功能: LINE 後台本機驗收（任務 4.2）

  背景:
    假設 本機預覽站 http://localhost:3100 已啟動並套用種子資料
    而且 店家A 與店家B 都已綁定 LINE（尚未確認 Channel secret）

  場景: S1 店家只能看到自己的資料
    假設 店家A 的 owner 已登入
    當 開啟 /store-a/knowledge
    那麼 看得到 FAQ「營業時間」
    而且 看不到店家B 的 FAQ「停車資訊」
    當 owner 直接讀取店家B 的 FAQ API
    那麼 回應為 403

  場景: S2 一般成員不能進後台頁面也不能呼叫後台 API
    假設 店家A 的一般成員 member 已登入
    當 開啟 知識庫、對話、用量、LINE 設定、模型設定 等後台頁面
    那麼 每一頁回應為 404
    當 member 讀取 FAQ 與店家設定 API
    那麼 回應為 403
    當 member 寫入 LINE 綁定 API
    那麼 回應為 403

  場景: S3 未登入者不能綁定 LINE，既有金鑰不變
    假設 使用者未登入
    當 POST /api/bot/line-binding
    那麼 回應為 401
    而且 owner 讀取店家A 的設定時 lineSecretMask 仍為 ****a1b2

  場景: S4 登入與註冊頁社群登入只有 LINE
    假設 使用者未登入
    當 開啟 /login 與 /signup
    那麼 社群登入按鈕只有「使用 LINE 登入」
    而且 沒有 Google、GitHub 等其他社群登入
    而且 Email/密碼、登入連結、通行金鑰按先前決定保留

  場景: S5 平台管理員設定每月上限
    假設 平台管理員已登入
    當 在 /admin/bot-stores 將店家A 的每月上限設為 3 並儲存
    那麼 重新整理後每月上限仍為 3
    當 清空每月上限並儲存
    那麼 輸入框的預設提示為「預設 5000」

  場景: S6 後台頁面在各寬度下沒有整頁橫向溢出
    假設 owner 已登入
    當 在寬度 390、768、1024、1440 開啟每一個後台頁
    那麼 頁面 scrollWidth 不大於 clientWidth

  場景: S7 LINE 設定頁顯示 Channel secret 尚未確認
    假設 店家A 的 owner 已登入
    當 開啟 /store-a/line-settings
    那麼 看得到「Channel secret 尚未確認,請傳一則訊息測試」
