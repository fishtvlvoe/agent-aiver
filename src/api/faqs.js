import { requireStore } from "../lib/guard.js";

// /api/faqs/:tenantSlug[/:faqId] —— 店家知識庫 CRUD（隔離：store 限本戶）
export async function handleFaqs(request, env, slug, id = null) {
  const { response } = await requireStore(env, request, slug);
  if (response) return response;

  const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE slug = ?").bind(slug).first();
  if (!tenant) return Response.json({ error: "tenant not found" }, { status: 404 });

  // 9.1 列表
  if (request.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT id, question, answer, updated_at FROM faqs WHERE tenant_id = ? ORDER BY updated_at DESC",
    )
      .bind(tenant.id)
      .all();
    return Response.json({ faqs: results ?? [] });
  }

  // 9.1 新增
  if (request.method === "POST") {
    const { question, answer } = await request.json().catch(() => ({}));
    if (!question || !answer) return Response.json({ error: "invalid body" }, { status: 400 });
    const newId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO faqs (id, tenant_id, question, answer, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(newId, tenant.id, question, answer, new Date().toISOString())
      .run();
    return Response.json({ ok: true, id: newId }, { status: 201 });
  }

  // 9.1 更新（含 updated_at=現在時間）
  if (request.method === "PUT" && id) {
    const { question, answer } = await request.json().catch(() => ({}));
    if (!question || !answer) return Response.json({ error: "invalid body" }, { status: 400 });
    await env.DB.prepare("UPDATE faqs SET question = ?, answer = ?, updated_at = ? WHERE id = ? AND tenant_id = ?")
      .bind(question, answer, new Date().toISOString(), id, tenant.id)
      .run();
    return Response.json({ ok: true });
  }

  // 9.1 刪除
  if (request.method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM faqs WHERE id = ? AND tenant_id = ?").bind(id, tenant.id).run();
    return Response.json({ ok: true });
  }

  return Response.json({ error: "method not allowed" }, { status: 405 });
}
