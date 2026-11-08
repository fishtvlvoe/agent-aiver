## Why

知識庫目前只能一則一則新增。店家有幾十則問答時,逐筆輸入太慢,會讓測試客戶放棄使用。

## What Changes

- 後台「知識庫」頁新增「批次貼上」:貼上多則問答文字,預覽後一次匯入。
- 格式為每則兩行,「問:」開頭是問題,「答:」開頭是回答,則與則之間空一行。
- 匯入前顯示解析出的筆數與錯誤行,確認後才寫入。

## Non-Goals

- 不做 CSV 或 Excel 上傳。
- 不覆蓋或刪除既有問答,只新增。

## Capabilities

### New Capabilities

- `kb-bulk-import`: 知識庫批次貼上匯入。

### Modified Capabilities

## Impact

`packages/api/modules/bot`(新增批次建立程序)、`apps/saas` 知識庫頁(批次貼上介面)、zh-TW 文案。
