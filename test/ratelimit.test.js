import { test } from "node:test";
import assert from "node:assert/strict";
import { pruneAndCheck, checkRateLimit, RATE_WINDOW_MS } from "../src/lib/ratelimit.js";

const NOW = 1_800_000_000_000;

// 假 KV：記憶體 Map
function makeFakeKv() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const v = store.get(key);
      return type === "json" && v !== undefined ? JSON.parse(v) : v;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

test("純函式：0/1/3 次在窗口內都允許", () => {
  assert.equal(pruneAndCheck([], NOW).allowed, true);
  assert.equal(pruneAndCheck([NOW - 1000], NOW).allowed, true);
  assert.equal(pruneAndCheck([NOW - 3000, NOW - 2000, NOW - 1000], NOW).allowed, false); // 已有 3 次 → 第 4 次擋
});

test("純函式：跨窗口後舊時間戳被清除，重設計數", () => {
  const old = [NOW - RATE_WINDOW_MS - 1, NOW - RATE_WINDOW_MS - 5000];
  const { allowed, timestamps } = pruneAndCheck(old, NOW);
  assert.equal(allowed, true);
  assert.deepEqual(timestamps, []); // 舊窗口全清掉
});

test("KV 實作：mock 時間序列 0→1→2 允許，第 4 次擋下", async () => {
  const kv = makeFakeKv();
  for (let i = 0; i < 3; i++) {
    const r = await checkRateLimit(kv, "t1", "U1", NOW + i * 1000);
    assert.equal(r.allowed, true);
  }
  const blocked = await checkRateLimit(kv, "t1", "U1", NOW + 3000);
  assert.equal(blocked.allowed, false);
});

test("KV 實作：第 5 次仍擋；超過 60 秒窗口後重設允許", async () => {
  const kv = makeFakeKv();
  for (let i = 0; i < 5; i++) {
    await checkRateLimit(kv, "t1", "U1", NOW + i * 1000);
  }
  assert.equal((await checkRateLimit(kv, "t1", "U1", NOW + 4000)).allowed, false); // 第 5 次（窗口內第 5 個請求）
  assert.equal((await checkRateLimit(kv, "t1", "U1", NOW + RATE_WINDOW_MS + 1)).allowed, true); // 跨窗口重設
});

test("KV 實作：不同 tenant/user 互不影響", async () => {
  const kv = makeFakeKv();
  for (let i = 0; i < 3; i++) await checkRateLimit(kv, "t1", "U1", NOW);
  assert.equal((await checkRateLimit(kv, "t1", "U1", NOW)).allowed, false);
  assert.equal((await checkRateLimit(kv, "t1", "U2", NOW)).allowed, true);
  assert.equal((await checkRateLimit(kv, "t2", "U1", NOW)).allowed, true);
});

// 6.1 整合：接進 reply.js，第 4 次起不呼叫模型、回固定話術、寫 audit rate_limited
import { handleLineEvents, RATE_LIMITED_REPLY } from "../src/reply.js";

test("整合：同一 user 60 秒內第 4 次被限速", async () => {
  const rows = { audit_events: [], conversations: [] };
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() { return null; },
            async all() { return { results: [] }; },
            async run() {
              if (sql.includes("audit_events")) rows.audit_events.push(args);
              if (sql.includes("conversations")) rows.conversations.push(args);
            },
          };
        },
      };
    },
  };
  const kvStore = new Map();
  const kv = {
    async get(k, t) { const v = kvStore.get(k); return t === "json" && v ? JSON.parse(v) : v; },
    async put(k, v) { kvStore.set(k, v); },
  };
  const calls = [];
  const mockFetch = async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    return { status: 200, ok: true, json: async () => ({ choices: [{ message: { content: "答案" } }], usage: {} }) };
  };
  const env = { DB: db, FORM_STATE: kv, OPENAI_API_KEY: "k", LINE_CHANNEL_ACCESS_TOKEN: "t" };
  const tenant = { id: "t1", slug: "demo", name: "Demo" };
  const mkEvent = () => ({ type: "message", replyToken: "rt", source: { userId: "U1" }, message: { type: "text", text: "hi" } });
  const NOW = 1_800_000_000_000;

  for (let i = 0; i < 3; i++) {
    await handleLineEvents(env, tenant, [mkEvent()], { fetchImpl: mockFetch, now: NOW + i * 1000 });
  }
  calls.length = 0;
  const res = await handleLineEvents(env, tenant, [mkEvent()], { fetchImpl: mockFetch, now: NOW + 3000 });
  assert.equal(res.handled, 1);
  assert.ok(!calls.some((c) => c.url.includes("chat/completions")), "第 4 次不應呼叫模型");
  const lineCall = calls.find((c) => c.url.includes("api.line.me"));
  assert.ok(lineCall, "仍應回 LINE 話術");
  assert.equal(lineCall.body.messages[0].text, RATE_LIMITED_REPLY);
  assert.equal(rows.audit_events.filter((a) => a[2] === "rate_limited").length, 1);
  assert.equal(rows.conversations.at(-1)[5], "rate_limited");
});
