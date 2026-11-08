#!/usr/bin/env bash
# 部署後的冒煙測試。任一步非預期狀態碼就 exit 1。
#
# 用法：
#   scripts/cf-smoke.sh <BASE_URL>             完整模式：首頁登入頁、註冊、登入、建立組織（會寫入測試帳號，只用於 preview）
#   scripts/cf-smoke.sh --readonly <BASE_URL>  唯讀模式：登入頁 + session API，不註冊、不登入、不寫資料（正式站用）
#
# 前提：preview 需設 AUTH_REQUIRE_EMAIL_VERIFICATION=false（已在 wrangler.jsonc 設定），
#       否則完整模式的登入會回 403 EMAIL_NOT_VERIFIED。本腳本不直接改資料庫。
set -euo pipefail

READONLY=0
if [ "${1:-}" = "--readonly" ]; then
	READONLY=1
	shift
fi

BASE_URL="${1:?用法：scripts/cf-smoke.sh [--readonly] <BASE_URL>}"
BASE_URL="${BASE_URL%/}"

COOKIE_JAR="$(mktemp)"
BODY_FILE="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$BODY_FILE"' EXIT

STAMP="$(date +%s)-$RANDOM"
EMAIL="smoke-${STAMP}@example.com"
PASSWORD="Smoke-${STAMP}-pw"
ORG_SLUG="smoke-org-${STAMP}"

# request <步驟名稱> <期望狀態碼> <curl 參數...>
request() {
	local name="$1" expected="$2"
	shift 2
	local status
	status="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
		-c "$COOKIE_JAR" -b "$COOKIE_JAR" \
		-H "origin: ${BASE_URL}" "$@")"
	echo "[${name}] HTTP ${status}（期望 ${expected}）"
	if [ "$status" != "$expected" ]; then
		echo "[${name}] 失敗，回應前 200 字元：" >&2
		head -c 200 "$BODY_FILE" >&2
		echo >&2
		exit 1
	fi
}

# 首頁輪詢：Worker 剛部署後，workers.dev 路由可能幾秒後才生效（會先回 404／error 1042），所以有上限地重試
for attempt in $(seq 1 12); do
	status="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/login" || true)"
	if [ "$status" = "200" ]; then
		break
	fi
	echo "[login-page] 第 ${attempt} 次嘗試 HTTP ${status}，5 秒後重試"
	sleep 5
done

request "login-page" 200 "${BASE_URL}/login"

if [ "$READONLY" = "1" ]; then
	# session API 偶爾回 503 error 1102（Worker 資源上限，實測約 1/5 次），最多重試 3 次；其他狀態碼直接失敗
	for attempt in 1 2 3; do
		status="$(curl -s -o "$BODY_FILE" -w '%{http_code}' \
			-H "origin: ${BASE_URL}" "${BASE_URL}/api/auth/get-session" || true)"
		echo "[get-session] 第 ${attempt} 次 HTTP ${status}（期望 200）"
		if [ "$status" = "200" ]; then
			break
		fi
		if [ "$status" != "503" ] || [ "$attempt" = "3" ]; then
			echo "[get-session] 失敗，回應前 200 字元：" >&2
			head -c 200 "$BODY_FILE" >&2
			echo >&2
			exit 1
		fi
		sleep 3
	done
	echo "唯讀冒煙測試全部通過：${BASE_URL}"
	exit 0
fi

request "sign-up" 200 \
	-X POST "${BASE_URL}/api/auth/sign-up/email" \
	-H "content-type: application/json" \
	-d "{\"name\":\"Smoke Test\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"

request "sign-in" 200 \
	-X POST "${BASE_URL}/api/auth/sign-in/email" \
	-H "content-type: application/json" \
	-d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"

request "create-organization" 200 \
	-X POST "${BASE_URL}/api/auth/organization/create" \
	-H "content-type: application/json" \
	-d "{\"name\":\"Smoke Org ${STAMP}\",\"slug\":\"${ORG_SLUG}\"}"

echo "冒煙測試全部通過：${BASE_URL}"
