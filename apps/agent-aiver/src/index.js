import { handleWebhook } from "./webhook.js";
import { corsHeaders } from "./lib/cors.js";

// 舊後台 API 已下線，後台改由共用底座提供
const RETIRED_BODY = { error: "舊後台已下線，請改用新後台" };

async function route(request, env, ctx) {
  const path = new URL(request.url).pathname;
  const m = path.match(/^\/webhook\/([^/]+)$/);
  if (request.method === "POST" && m) {
    return handleWebhook(request, env, decodeURIComponent(m[1]), ctx);
  }
  if (path.startsWith("/api/")) {
    return Response.json(RETIRED_BODY, { status: 410 });
  }
  return new Response("agent-aiver ok", { status: 200 });
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const res = await route(request, env, ctx);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
