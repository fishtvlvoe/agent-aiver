# language: zh-TW
功能: 店家一鍵連結自己的 Cloudflare AI（授權入口的閘門）

  背景:
    假設 本機預覽站 http://localhost:3100 已啟動，並設定 CF_OAUTH_* 環境變數

  場景: C1 未登入呼叫授權入口被拒絕
    當 未登入者開啟 /api/bot/cf-oauth/start
    那麼 回應 401

  場景: C2 店家 owner 開始授權會被導向 Cloudflare 並帶 PKCE
    假設 店家 owner-a 已登入
    當 owner-a 開啟 /api/bot/cf-oauth/start?organizationId=org-store-a
    那麼 回應 302，目的地為 Cloudflare 授權頁且含 code_challenge 與 state
    而且 回應設定了一次性授權 cookie

  場景: C3 一般成員不能替店家開始授權
    假設 一般成員 member-a 已登入
    當 member-a 開啟 /api/bot/cf-oauth/start?organizationId=org-store-a
    那麼 回應 403

  場景: C4 沒有授權 cookie 就打回呼會被拒絕
    當 未帶 cookie 開啟 /api/bot/cf-oauth/callback?code=x&state=y
    那麼 回應 400
