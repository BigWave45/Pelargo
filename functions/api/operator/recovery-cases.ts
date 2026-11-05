import { Env, json } from "../../_lib/intents";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.DB || !env.MERCHANT_PROVISIONING_SECRET) {
    return json({ error: "Operator recovery access is not configured" }, 503);
  }
  const supplied = request.headers.get("x-pelargo-provisioning-key") ?? "";
  if (!supplied || supplied !== env.MERCHANT_PROVISIONING_SECRET) {
    return json({ error: "Operator authentication failed" }, 401);
  }
  const result = await env.DB.prepare(
    `SELECT c.id, o.external_order_id AS orderId, c.merchant_id AS merchantId,
            c.session_jti AS sessionId, c.reason, c.status, c.created_at AS createdAt
       FROM payment_recovery_cases c
       JOIN checkout_orders o ON o.id = c.order_id
      WHERE c.status = 'open'
      ORDER BY c.created_at ASC
      LIMIT 100`
  ).all<{
    id: string; orderId: string; merchantId: string; sessionId: string;
    reason: string; status: string; createdAt: string;
  }>();
  return json({ cases: result.results });
}
