## Purpose

定義 AIVER 對外上線前必須成立的內容、授權、語系與流程條件,讓真店家可直接使用。

## ADDED Requirements

### Requirement: 知識庫使用真實店家資料
系統 SHALL 在上線時使用店家提供的真實營業時間、商品與常見問答,SHALL NOT 保留測試資料。

#### Scenario: 詢問營業時間
- **WHEN** 顧客在 LINE 詢問營業時間
- **THEN** 機器人回覆的內容與店家提供的營業時間一致

### Requirement: 法律頁面為正式版
系統 SHALL 提供正式的隱私權政策與服務條款頁面,且首頁與註冊頁 SHALL 連到這兩頁。

#### Scenario: 開啟隱私權政策
- **WHEN** 訪客從首頁點選隱私權政策
- **THEN** 顯示正式版文字,不含範本佔位文字

### Requirement: Cloudflare 授權可用
管理後台「連接 Cloudflare」 SHALL 在 `admin.aiver.me` 完成授權並回到後台。

#### Scenario: 完成授權
- **WHEN** 管理者點選連接 Cloudflare 並同意授權
- **THEN** 回到 `admin.aiver.me` 並顯示已連接

### Requirement: 介面只提供繁體中文
系統 SHALL 只提供繁體中文介面;缺少翻譯鍵時 SHALL 退回繁體中文。

#### Scenario: 缺少翻譯鍵
- **WHEN** 某文字在目前語系沒有翻譯
- **THEN** 顯示繁體中文文字,不顯示鍵名

### Requirement: 重設密碼完整流程
系統 SHALL 寄出連到 `admin.aiver.me` 的重設信,且使用者 SHALL 能依信中連結改密碼並以新密碼登入。

#### Scenario: 重設後登入
- **WHEN** 使用者點信中連結、設定新密碼
- **THEN** 能以新密碼登入,舊密碼失效
