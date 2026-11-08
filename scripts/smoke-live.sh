#!/usr/bin/env bash
# 部署後冒煙檢查:列出的線上網址必須是 200(或登入轉址 307),否則失敗。
# 新增任何訪客可見的頁面時,把網址加進下面清單。
set -u
URLS=(
  https://app.aiver.me/
  https://app.aiver.me/legal/privacy-policy
  https://app.aiver.me/legal/terms
  https://admin.aiver.me/login
  https://bot.aiver.me/
)
fail=0
for u in "${URLS[@]}"; do
  c=$(curl -s -o /dev/null -w "%{http_code}" "$u")
  case "$c" in 200|307) echo "PASS $c $u";; *) echo "FAIL $c $u"; fail=1;; esac
done
exit $fail
