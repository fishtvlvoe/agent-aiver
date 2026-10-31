// GET /api/config —— 前端開機設定，只回可公開的 liffId，不回任何 secret
export async function handleConfig(request, env) {
  return Response.json({ liffId: env.LINE_LIFF_ID ?? null });
}
