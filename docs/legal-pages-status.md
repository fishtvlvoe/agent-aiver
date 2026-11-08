# 法律頁狀態（隱私權政策／服務條款）

> 對應 SR aiver-finish 的 1.2。截至本次檢查，兩頁仍是框架內建的範本文字，尚未放入正式條款，上線前必須換掉。

## 1. 每頁路徑與狀態

| 頁面 | 檔案路徑 | 網址 | 佔位字 | 狀態 |
|---|---|---|---|---|
| 隱私權政策（中文／預設） | `apps/marketing/content/legal/privacy-policy.md` | `/legal/privacy-policy` | 第 5 行 | 範本文字 |
| 服務條款（中文／預設） | `apps/marketing/content/legal/terms.md` | `/legal/terms` | 第 5 行 | 範本文字 |

佔位字原文（四檔第 5 行同樣格式）：

- `apps/marketing/content/legal/privacy-policy.md:5`：`This is the placeholder page for your privacy policy. Edit the ...`
- `apps/marketing/content/legal/terms.md:5`：`This is the placeholder page for your terms and conditions. Edit the ...`

搜尋範圍：`apps/marketing/content/legal` 內以 `Lorem`、`placeholder`、`範本`、`example`、`TODO` 搜尋，命中的只有上面四行。`apps/saas` 內沒有任何法律頁檔案。

## 2. 要貼正式文字的檔案

&- 中文服務條款：`apps/marketing/content/legal/terms.md`（同上，frontmatter 標題為 `Terms and conditions`）

注意：這四份文字屬於法律內容，需要老闆或法務確認，代理不應自行撰寫正式條款。

## 3. 連結狀態

| 位置 | 連到隱私權政策 | 連到服務條款 | 檔案 |
|---|---|---|---|
| 首頁（行銷站，所有 `[locale]` 頁面共用頁尾） | 有 | 有 | `apps/marketing/modules/shared/components/Footer.tsx:19-28`，於 `apps/marketing/app/[locale]/layout.tsx:73` 渲染 |
| 註冊頁（SaaS，`/signup`） | 原本缺少，本次已補 | 原本缺少，本次已補 | `apps/saas/modules/shared/components/Footer.tsx`，由 `AuthWrapper` 於未登入頁渲染 |

本次補上的內容：

- `apps/saas/modules/shared/components/Footer.tsx`：原為回傳 `null` 的空殼，改為兩個連結，指向 `${NEXT_PUBLIC_MARKETING_URL}/legal/privacy-policy` 與 `/legal/terms`。
- `packages/i18n/translations/zh-TW/saas.json`：在 `common` 下新增 `footer.privacyPolicy`、`footer.termsAndConditions`。英文鍵是為了讓 `SaasMessages` 型別可以通過，與 `en/saas.json` 為型別來源的設定一致。

風險：saas 端的連結是以 `NEXT_PUBLIC_MARKETING_URL` 組成。若部署環境沒有設定此變數，連結會變成站內相對路徑 `/legal/...`，會 404。上線前需確認該環境變數已設定。

## 4. 缺少的連結

- 無（首頁與註冊頁均已連到兩頁，註冊頁為本次補上）。
- 其他未登入頁（登入頁、忘記密碼、重設密碼等）同樣經由 `AuthWrapper` 會顯示這個 Footer，因此也會出現法律連結。
