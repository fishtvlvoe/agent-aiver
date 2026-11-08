import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtMoney, fmtDate, fmtTime } from "../src/lib/format.js";

test("fmtMoney：NT$ 千分位無小數", () => {
  assert.equal(fmtMoney(0), "NT$0");
  assert.equal(fmtMoney(260), "NT$260");
  assert.equal(fmtMoney(38204), "NT$38,204");
  assert.equal(fmtMoney(1234567), "NT$1,234,567");
  assert.equal(fmtMoney(260.4), "NT$260"); // 無小數：四捨五入到整數
  assert.equal(fmtMoney("999"), "NT$999");
  assert.equal(fmtMoney(undefined), "NT$0");
});

test("fmtDate：2026/10/31（補零）", () => {
  assert.equal(fmtDate("2026-10-31T14:20:00"), "2026/10/31");
  assert.equal(fmtDate("2026-01-05T09:00:00"), "2026/01/05");
  assert.equal(fmtDate(new Date(2026, 11, 1)), "2026/12/01");
  assert.equal(fmtDate("not-a-date"), "");
});

test("fmtTime：24h", () => {
  assert.equal(fmtTime("2026-10-31T14:20:00"), "14:20");
  assert.equal(fmtTime("2026-10-31T09:05:00"), "09:05");
  assert.equal(fmtTime("2026-10-31T00:00:00"), "00:00");
  assert.equal(fmtTime("2026-10-31T23:59:00"), "23:59");
  assert.equal(fmtTime("bogus"), "");
});
