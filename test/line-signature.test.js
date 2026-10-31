import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyLineSignature, signLineBody } from "../src/lib/line-signature.js";

const SECRET = "test-channel-secret";
const BODY = JSON.stringify({ destination: "Uxxx", events: [{ type: "message" }] });

test("驗簽：正確簽名通過", async () => {
  const sig = await signLineBody(SECRET, BODY);
  assert.equal(await verifyLineSignature(SECRET, BODY, sig), true);
});

test("驗簽：錯誤簽名拒絕", async () => {
  const sig = await signLineBody("wrong-secret", BODY);
  assert.equal(await verifyLineSignature(SECRET, BODY, sig), false);
});

test("驗簽：缺 signature header 拒絕", async () => {
  assert.equal(await verifyLineSignature(SECRET, BODY, null), false);
  assert.equal(await verifyLineSignature(SECRET, BODY, ""), false);
});

test("驗簽：body 被竄改後原簽名失效", async () => {
  const sig = await signLineBody(SECRET, BODY);
  assert.equal(await verifyLineSignature(SECRET, BODY + " ", sig), false);
});
