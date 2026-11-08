#!/usr/bin/env bash
# 把 Worker 接到 Cloudflare 自己建置（push main 就自動部署）。可重複用在任何新專案。
# 用法: scripts/cf-builds-connect.sh <worker名> <GitHub擁有者/repo> "<build指令>" "<deploy指令>" ['{"VAR":{"value":"x","is_secret":false}}']
# 需要環境變數 CLOUDFLARE_API_TOKEN（Workers 權限）、CLOUDFLARE_ACCOUNT_ID。build token 取帳號下第一把。
set -euo pipefail
W=$1; REPO=$2; BUILD=$3; DEPLOY=$4; ENVJ=${5:-'{}'}
API=https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID
H=(-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")
j(){ python3 -c "import sys,json;d=json.load(sys.stdin);print($1)"; }
TAG=$(curl -s "$API/workers/scripts" "${H[@]}" | j "[x['tag'] for x in d['result'] if x['id']=='$W'][0]")
BT=$(curl -s "$API/builds/tokens" "${H[@]}" | j "d['result'][0]['build_token_uuid']")
OWNER=${REPO%%/*}; NAME=${REPO##*/}
OID=$(gh api "users/$OWNER" --jq .id); RID=$(gh api "repos/$REPO" --jq .id)
RC=$(curl -s -X PUT "$API/builds/repos/connections" "${H[@]}" -d "{\"provider_type\":\"github\",\"provider_account_id\":\"$OID\",\"provider_account_name\":\"$OWNER\",\"repo_id\":\"$RID\",\"repo_name\":\"$NAME\"}" | j "d['result']['repo_connection_uuid']")
python3 - "$TAG" "$RC" "$BT" "$BUILD" "$DEPLOY" "$ENVJ" <<'PY' | curl -s -X POST "$API/builds/triggers" "${H[@]}" -d @- | j "d['success'], d['errors']"
import sys,json
t,rc,bt,b,d,e=sys.argv[1:]
print(json.dumps({"external_script_id":t,"repo_connection_uuid":rc,"build_token_uuid":bt,"trigger_name":"Deploy default branch","build_command":b,"deploy_command":d,"root_directory":"/","branch_includes":["main"],"branch_excludes":[],"path_includes":["*"],"path_excludes":[],"build_caching_enabled":True,"environment_variables":json.loads(e)}))
PY
