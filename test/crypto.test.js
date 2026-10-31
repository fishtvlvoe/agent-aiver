import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapSecret, unwrapSecret, maskSecret } from "../src/lib/crypto.js";

const PASSWORD = "master-password-for-test";

test("crypto：AES-GCM 加密/解密往返一致", async () => {
  const wrapped = await wrapSecret(PASSWORD, "my-line-channel-secret-abc123");
  assert.notEqual(wrapped, "my-line-channel-secret-abc123");
  assert.equal(await unwrapSecret(PASSWORD, wrapped), "my-line-channel-secret-abc123");
});

test("crypto：每次 wrap 產生不同 iv（同明文不同密文）", async () => {
  const a = await wrapSecret(PASSWORD, "same-secret");
  const b = await wrapSecret(PASSWORD, "same-secret");
  assert.notEqual(a, b);
});

test("crypto：錯誤密碼解不開", async () => {
  const wrapped = await wrapSecret(PASSWORD, "secret-data");
  await assert.rejects(() => unwrapSecret("wrong-password", wrapped));
});

test("crypto：遮罩為 ••••+末四碼", () => {
  assert.equal(maskSecret("abcdef123456"), "••••3456");
  assert.equal(maskSecret("short"), "••••hort");
});
