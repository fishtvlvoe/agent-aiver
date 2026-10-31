// POST /api/tenants —— 中台建立租戶（需 admin session；安全補丁：不再無驗證開放）
import { requireAdmin } from "../lib/guard.js";

export async function handleCreateTenant(request, env) {
  const { response } = await requireAdmin(env, request);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  const { slug, name } = body ?? {};
  if (!slug || !name || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return Response.json({ error: "invalid slug or name" }, { status: 400 });
  }
  const existing = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(slug).first();
  if (existing) return Response.json({ error: "slug_taken" }, { status: 409 });

  await env.DB.prepare("INSERT INTO tenants (id, slug, name, status, created_at) VALUES (?, ?, ?, 'unbound', ?)")
    .bind(crypto.randomUUID(), slug, name, new Date().toISOString())
    .run();
  return Response.json({ ok: true, slug }, { status: 201 });
}
