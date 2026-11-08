import { test } from "node:test";
import assert from "node:assert/strict";
import { corsHeaders } from "../src/lib/cors.js";

test("白名單來源會回 Allow-Origin", () => {
  const req = new Request("https://x.test/", { headers: { Origin: "https://app.aiver.me" } });
  const h = corsHeaders(req);
  assert.equal(h["Access-Control-Allow-Origin"], "https://app.aiver.me");
  assert.equal(h.Vary, "Origin");
});

test("pages.dev 白名單來源也允許", () => {
  const req = new Request("https://x.test/", { headers: { Origin: "https://agent-aiver.pages.dev" } });
  assert.equal(corsHeaders(req)["Access-Control-Allow-Origin"], "https://agent-aiver.pages.dev");
});

test("非白名單來源不回任何 CORS 標頭", () => {
  const req = new Request("https://x.test/", { headers: { Origin: "https://evil.example" } });
  assert.deepEqual(corsHeaders(req), {});
});

test("沒有 Origin 標頭時不回 CORS 標頭", () => {
  assert.deepEqual(corsHeaders(new Request("https://x.test/")), {});
});
