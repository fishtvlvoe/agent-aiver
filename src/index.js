import { handleWebhook } from "./webhook.js";
import { handleUsage } from "./api/usage.js";
import { handleBind } from "./api/bind.js";
import { handleLiff, handleMe } from "./api/auth.js";
import { handleCreateTenant } from "./api/tenants.js";
import { handleFaqs } from "./api/faqs.js";
import { handleConversations } from "./api/conversations.js";
import { handleModelSettings } from "./api/model-settings.js";
import { handleConsole } from "./api/console.js";
import { handleConfig } from "./api/config.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const m = path.match(/^\/webhook\/([^/]+)$/);
    if (request.method === "POST" && m) {
      return handleWebhook(request, env, decodeURIComponent(m[1]));
    }
    if (path === "/api/auth/liff" && request.method === "POST") {
      return handleLiff(request, env);
    }
    if (path === "/api/auth/me" && request.method === "GET") {
      return handleMe(request, env);
    }
    if (path === "/api/tenants" && request.method === "POST") {
      return handleCreateTenant(request, env);
    }
    if (path === "/api/config" && request.method === "GET") {
      return handleConfig(request, env);
    }
    const usageMatch = path.match(/^\/api\/usage\/([^/]+)$/);
    if (request.method === "GET" && usageMatch) {
      return handleUsage(request, env, decodeURIComponent(usageMatch[1]));
    }
    const faqsMatch = path.match(/^\/api\/faqs\/([^/]+)(?:\/([^/]+))?$/);
    if (["GET", "POST", "PUT", "DELETE"].includes(request.method) && faqsMatch) {
      return handleFaqs(request, env, decodeURIComponent(faqsMatch[1]), faqsMatch[2] ? decodeURIComponent(faqsMatch[2]) : null);
    }
    const convMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
    if (request.method === "GET" && convMatch) {
      return handleConversations(request, env, decodeURIComponent(convMatch[1]), url);
    }
    const modelMatch = path.match(/^\/api\/model-settings\/([^/]+)$/);
    if (["GET", "PUT"].includes(request.method) && modelMatch) {
      return handleModelSettings(request, env, decodeURIComponent(modelMatch[1]));
    }
    const bindMatch = path.match(/^\/api\/bind\/([^/]+)$/);
    if (request.method === "POST" && bindMatch) {
      return handleBind(request, env, decodeURIComponent(bindMatch[1]));
    }
    if (path.startsWith("/api/console/")) {
      return handleConsole(request, env);
    }
    return new Response("line-ai-saas ok", { status: 200 });
  },
};
