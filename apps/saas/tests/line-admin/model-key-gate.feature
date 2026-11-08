# language: zh-TW
功能: 店家模型金鑰與平台模型開關的權限閘門

  背景:
    假設 本機預覽站 http://localhost:3100 已啟動
    而且 店家A（store-a）尚未開通平台模型、也未填入自己的 AI 金鑰

  場景: M1 店家 owner 在模型設定頁看不到平台模型開關，也不能修改
    假設 店家 owner-a 已登入
    當 開啟 /store-a/model-settings
    那麼 頁面顯示「目前尚未開通平台模型」的狀態說明
    而且 頁面沒有任何平台模型切換開關
    當 owner-a 呼叫修改 usePlatformModel 的 API
    那麼 回應 403，且店家A 的 usePlatformModel 仍為 false

  場景: M2 一般成員呼叫修改 usePlatformModel 的 API 被拒絕
    假設 一般成員 member-a 已登入
    當 member-a 呼叫修改 usePlatformModel 的 API（店家A）
    那麼 回應 403，且店家A 的 usePlatformModel 仍為 false

  場景: M3 平台管理員可在後台切換平台模型，切換後狀態改變
    假設 平台管理員 platform-admin 已登入
    當 開啟 /admin/bot-stores 並在「店家B」那一列切換「平台模型」開關
    那麼 出現「已更新平台模型設定」
    而且 管理員 API 讀回店家B 的 usePlatformModel 已改變
    當 測試結束
    那麼 店家B 的 usePlatformModel 切回原值

  場景: M4 未填金鑰的店家模型設定頁顯示未設定狀態，不外露金鑰
    假設 店家 owner-a 已登入
    當 開啟 /store-a/model-settings
    那麼 頁面顯示「請先填入你自己的 AI 金鑰，機器人才會回覆客人」
    而且 API 回傳的 apiKeyMask 為 null
    而且 API 金鑰輸入欄為空白
    而且 頁面不含任何遮罩金鑰字樣（連續四個星號）
