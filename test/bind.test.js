import { test } from "node:test";
import assert from "node:assert/strict";
import { handleBind } from "../src/api/bind.js";
import { wrapSecret, unwrapSecret } from "../src/lib/crypto.js";
import { handleWebhook } from "../src/webhook.js";
import { signLineBody } from "../src/lib/line-signature.js";

const PASSWORD = "dev-master-key";

// 假 D1：tenant 查詢 + UPDATE 追蹤
function makeFakeDb() {
  const updates = [];
  const tenantRow = { id: "t1", slug: "demo", status: "unbound" };
  return {
    updates,
    tenantRow,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes("FROM tenants")) return tenantRow;
              return null;
            },
            async run() {
              updates.push({ sql, args });
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function bindRequest(secret, token) {
  return new Request("http://localhost/api/bind/demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channelSecret: secret, accessToken: token }),
  });
}

const okLineFetch = async (url, opts) => {
  assert.equal(url, "https://api.line.me/v2/bot/info");
  return { status: 200, ok: true, json: async () => ({ userId: "Ubot" }) };
};
const failLineFetch = async () => ({ status: 401, ok: false, json: async () => ({}) });

test("7.1 綁定：LINE 驗證通過 → 寫 enc+mask，回 webhookUrl 與遮罩", async () => {
  const db = makeFakeDb();
  const env = { DB: db, LINE_CHANNEL_SECRET: PASSWORD };
  const res = await handleBind(bindRequest("secret-aaaa-1111", "token-bbbb-2222"), env, "demo", okLineFetch);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.webhookUrl, "/webhook/demo");
  assert.equal(json.maskedSecret, "••••1111");
  assert.equal(json.maskedToken, "••••2222");
  // D1 只寫 enc 與 mask，沒有明文
  assert.equal(db.updates.length, 1);
  const [, , maskS, maskT] = db.updates[0].args;
  assert.equal(maskS, "••••1111");
  assert.equal(maskT, "••••2222");
  const encS = db.updates[0].args[0];
  assert.notEqual(encS, "secret-aaaa-1111");
  // enc 可用 master key 解回明文（服務內部使用）
  assert.equal(await unwrapSecret(PASSWORD, encS), "secret-aaaa-1111");
});

test("7.1 綁定：LINE 驗證失敗 → 401 且狀態不變", async () => {
  const db = makeFakeDb();
  const env = { DB: db, LINE_CHANNEL_SECRET: PASSWORD };
  const res = await handleBind(bindRequest("bad-secret", "bad-token"), env, "demo", failLineFetch);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.equal(json.error, "金鑰無效，請確認後重試");
  assert.equal(db.updates.length, 0); // 零副作用
});

test("7.1/7.2 保密：綁定回應序列化後不含明文 secret/token", async () => {
  const db = makeFakeDb();
  const env = { DB: db, LINE_CHANNEL_SECRET: PASSWORD };
  const res = await handleBind(bindRequest("leak-me-not-9999", "token-leak-no-8888"), env, "demo", okLineFetch);
  const text = JSON.stringify(await res.json());
  assert.ok(!text.includes("leak-me-not-9999"), "回應不可含明文 secret");
  assert.ok(!text.includes("token-leak-no-8888"), "回應不可含明文 token");
  // D1 寫入的 enc 欄位也不含明文
  const encArgs = JSON.stringify(db.updates[0].args);
  assert.ok(!encArgs.includes("leak-me-not-9999"));
  assert.ok(!encArgs.includes("token-leak-no-8888"));
});

test("7.1：webhook 用 D1 enc 金鑰驗簽通過", async () => {
  const db = makeFakeDb();
  db.tenantRow.line_secret_enc = await wrapSecret(PASSWORD, "enc-secret-7777");
  const env = { DB: db, LINE_CHANNEL_SECRET: PASSWORD };
  const payload = JSON.stringify({ destination: "U", events: [] });
  const sig = await signLineBody("enc-secret-7777", payload);
  const req = new Request("http://localhost/webhook/demo", {
    method: "POST",
    headers: { "content-type": "application/json", "x-line-signature": sig },
    body: payload,
  });
  const res = await handleWebhook(req, env, "demo");
  assert.equal(res.status, 200);
});

test("7.3 更新金鑰：重複綁定覆寫，舊金鑰驗簽失敗、新金鑰成功", async () => {
  const db = makeFakeDb();
  const env = { DB: db, LINE_CHANNEL_SECRET: PASSWORD };
  // 第一次綁定舊金鑰
  await handleBind(bindRequest("old-secret-0001", "old-token-0001"), env, "demo", okLineFetch);
  // 7.3 更新為新金鑰
  const res = await handleBind(bindRequest("new-secret-0002", "new-token-0002"), env, "demo", okLineFetch);
  const json = await res.json();
  assert.equal(json.maskedSecret, "••••0002");
  assert.equal(db.updates.length, 2); // 覆寫第二次
  db.tenantRow.line_secret_enc = db.updates[1].args[0];

  const payload = JSON.stringify({ destination: "U", events: [] });
  const mkReq = (sig) =>
    new Request("http://localhost/webhook/demo", {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": sig },
      body: payload,
    });
  // 舊金鑰簽名 → 401
  const oldSig = await signLineBody("old-secret-0001", payload);
  assert.equal((await handleWebhook(mkReq(oldSig), env, "demo")).status, 401);
  // 新金鑰簽名 → 200
  const newSig = await signLineBody("new-secret-0002", payload);
  assert.equal((await handleWebhook(mkReq(newSig), env, "demo")).status, 200);
});
