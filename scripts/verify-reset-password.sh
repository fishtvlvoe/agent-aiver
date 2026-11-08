#!/usr/bin/env bash
# 用 AgentEmail 測試信箱走完重設密碼:請求→收信→改密碼→新密碼登入 200、舊密碼 401。
# 需要 /Users/fishtv/Development/.env 的 AGENTMAIL_API_KEY、AGENTMAIL_INBOX。不印出金鑰與密碼。
set -euo pipefail
set -a; . /Users/fishtv/Development/.env; set +a
BASE="${BASE:-https://admin.aiver.me}"
H='content-type: application/json'; O="origin: $BASE"
API="https://api.agentmail.to/v0/inboxes/$AGENTMAIL_INBOX/messages"
NEW="Reset-$(date +%s)-Zq7!"
enc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$1"; }
curl -s -X POST "$BASE/api/auth/request-password-reset" -H "$H" -H "$O" \
  -d "{\"email\":\"$AGENTMAIL_INBOX\",\"redirectTo\":\"$BASE/reset-password\"}" >/dev/null
for i in 1 2 3 4 5 6; do
  sleep 5
  MID=$(curl -s -H "Authorization: Bearer $AGENTMAIL_API_KEY" "$API?limit=1" | python3 -c "
import sys,json;m=json.load(sys.stdin)['messages'][0];print(m['message_id'] if '重設' in m['subject'] else '')")
  [ -n "$MID" ] && break
done
[ -n "$MID" ] || { echo "FAIL: 沒收到重設信"; exit 1; }
LINK=$(curl -s -H "Authorization: Bearer $AGENTMAIL_API_KEY" "$API/$(enc "$MID")" | python3 -c "
import sys,json,re,html;d=json.load(sys.stdin);t=html.unescape((d.get('text') or '')+(d.get('html') or ''))
print(re.findall(r'https://[^\s\"<>]+reset-password/[^\s\"<>]+',t)[0])")
echo "連結開頭: ${LINK:0:48}"
case "$LINK" in "$BASE"/*) echo "PASS: 連結網址正確";; *) echo "FAIL: 連結網址不是 $BASE"; exit 1;; esac
TOK=$(echo "$LINK" | sed -E 's#.*reset-password/([A-Za-z0-9]+).*#\1#')
RES=$(curl -s -X POST "$BASE/api/auth/reset-password" -H "$H" -H "$O" -d "{\"token\":\"$TOK\",\"newPassword\":\"$NEW\"}")
case "$RES" in *'"status":true'*) echo "PASS: 改密碼";; *) echo "FAIL: 改密碼 $RES"; exit 1;; esac
NEWC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/sign-in/email" -H "$H" -H "$O" -d "{\"email\":\"$AGENTMAIL_INBOX\",\"password\":\"$NEW\"}")
OLDC=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/sign-in/email" -H "$H" -H "$O" -d "{\"email\":\"$AGENTMAIL_INBOX\",\"password\":\"Tmp-wrong-aX9!\"}")
echo "新密碼登入: $NEWC / 舊密碼登入: $OLDC"
[ "$NEWC" = 200 ] && [ "$OLDC" = 401 ] && echo "PASS: 重設後登入" || { echo "FAIL"; exit 1; }
