import { handleWebhook } from "./webhook.js";
import { handleUsage } from "./api/usage.js";
import { handleBind } from "./api/bind.js";
import { handleLiff, handleMe } from "./api/auth.js";
import { handleCreateTenant } from "./api/tenants.js";
import { handleFaqs } from "./api/faqs.js";
import { handleConversations } from "./api/conversations.js";
import { handleModelSettings } from "./api/model-settings.js";
import { handleLineSettings, handleApplyWebhook } from "./api/line-settings.js";
import { handleConsole } from "./api/console.js";
import { handleConfig } from "./api/config.js";


// CORS：允許 Pages 前端（agent-aiver.pages.dev 與 app.aiver.me）呼叫 /api/*
const ALLOWED_ORIGINS = ["https://agent-aiver.pages.dev", "https://app.aiver.me", "http://localhost:8787", "http://localhost:3000"];
function withCors(response, origin) {
  if (origin && ALLOWED_ORIGINS.some(o => origin === o || origin.endsWith(".agent-aiver.pages.dev"))) {
    const h = new Headers(response.headers);
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    h.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    return new Response(response.body, { status: response.status, headers: h });
  }
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("Origin");
    // CORS preflight
    if (request.method === "OPTIONS" && path.startsWith("/api/")) {
      return withCors(new Response(null, { status: 204 }), origin);
    }
    const wrap = (p) => Promise.resolve(p).then(r => withCors(r, origin));
    const m = path.match(/^\/webhook\/([^/]+)$/);
    if (request.method === "POST" && m) {
      return handleWebhook(request, env, decodeURIComponent(m[1]));
    }
    if (path === "/api/auth/liff" && request.method === "POST") {
      return wrap(handleLiff(request, env));
    }
    if (path === "/api/auth/me" && request.method === "GET") {
      return wrap(handleMe(request, env));
    }
    if (path === "/api/tenants" && request.method === "POST") {
      return wrap(handleCreateTenant(request, env));
    }
    if (path === "/api/config" && request.method === "GET") {
      return wrap(handleConfig(request, env));
    }
    const usageMatch = path.match(/^\/api\/usage\/([^/]+)$/);
    if (request.method === "GET" && usageMatch) {
      return wrap(handleUsage(request, env, decodeURIComponent(usageMatch[1])));
    }
    const faqsMatch = path.match(/^\/api\/faqs\/([^/]+)(?:\/([^/]+))?$/);
    if (["GET", "POST", "PUT", "DELETE"].includes(request.method) && faqsMatch) {
      return wrap(handleFaqs(request, env, decodeURIComponent(faqsMatch[1]), faqsMatch[2] ? decodeURIComponent(faqsMatch[2]) : null));
    }
    const convMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
    if (request.method === "GET" && convMatch) {
      return wrap(handleConversations(request, env, decodeURIComponent(convMatch[1]), url));
    }
    const modelMatch = path.match(/^\/api\/model-settings\/([^/]+)$/);
    if (["GET", "PUT"].includes(request.method) && modelMatch) {
      return wrap(handleModelSettings(request, env, decodeURIComponent(modelMatch[1])));
    }
    const bindMatch = path.match(/^\/api\/bind\/([^/]+)$/);
    if (request.method === "POST" && bindMatch) {
      return wrap(handleBind(request, env, decodeURIComponent(bindMatch[1])));
    }
    const lineSettingsMatch = path.match(/^\/api\/line-settings\/([^/]+)$/);
    if (request.method === "GET" && lineSettingsMatch) {
      return wrap(handleLineSettings(request, env, decodeURIComponent(lineSettingsMatch[1])));
    }
    const applyWebhookMatch = path.match(/^\/api\/line-settings\/([^/]+)\/apply-webhook$/);
    if (request.method === "POST" && applyWebhookMatch) {
      return wrap(handleApplyWebhook(request, env, decodeURIComponent(applyWebhookMatch[1])));
    }
    if (path.startsWith("/api/console/")) {
      return wrap(handleConsole(request, env));
    }
    return new Response("line-ai-saas ok", { status: 200 });
  },
};
