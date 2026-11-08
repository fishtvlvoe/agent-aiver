import { test } from "node:test";
import assert from "node:assert/strict";

test("smoke: placeholder response", () => {
  assert.strictEqual(typeof Response, "function");
});
