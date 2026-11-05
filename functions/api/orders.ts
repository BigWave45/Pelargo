import { Env, json } from "../_lib/intents";
import { authenticateMerchantSession } from "../_lib/merchant-auth";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.DB) return json({ error: "Order storage is unavailable" }, 503);
  const merchant = await authenticateMerchantSession(request, env);
  if (!merchant) return json({ error: "Sign in required" }, 401);
  const rows = await env.DB.prepare(
    `SELECT o.external_order_id AS orderId, o.amount_atomic AS amountAtomic,
            o.destination_symbol AS destinationSymbol, o.destination_network AS destinationNetwork,
            COALESCE(p.status, o.status) AS status, o.created_at AS createdAt,
            o.expires_at AS expiresAt
       FROM checkout_orders o
       LEFT JOIN payment_lifecycle p ON p.order_id = o.id
      WHERE o.merchant_id = ?
      ORDER BY o.created_at DESC LIMIT 100`
  ).bind(merchant.id).all();
  return json({ orders: rows.results });
}
