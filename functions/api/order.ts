import { Env, json } from "../_lib/intents";
import { sha256Hex } from "../_lib/database";
import { authenticateMerchantSession } from "../_lib/merchant-auth";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.DB) return json({ error: "Checkout storage is not configured" }, 503);

  let merchant: { id: string } | null = null;
  const suppliedKey = request.headers.get("x-pelargo-merchant-key") ?? "";
  if (suppliedKey) {
    if (suppliedKey.length > 512) return json({ error: "Merchant authentication failed" }, 401);
    const keyHash = await sha256Hex(suppliedKey);
    merchant = await env.DB.prepare(
      "SELECT id FROM merchants WHERE api_key_hash = ? AND active = 1"
    ).bind(keyHash).first<{ id: string }>();
  } else {
    const account = await authenticateMerchantSession(request, env);
    if (account) merchant = { id: account.id };
  }
  if (!merchant) return json({ error: "Merchant authentication failed" }, 401);

  const url = new URL(request.url);
  const externalOrderId = url.searchParams.get("orderId") ?? "";
  if (!externalOrderId || externalOrderId.length > 256) {
    return json({ error: "A valid orderId query parameter is required" }, 400);
  }

  const order = await env.DB.prepare(
    `SELECT
       external_order_id AS orderId,
       amount_atomic AS amountAtomic,
       destination_asset AS destinationAsset,
       recipient,
       COALESCE(payment_lifecycle.status, checkout_orders.status) AS status,
       checkout_orders.created_at AS createdAt,
       checkout_orders.expires_at AS expiresAt
     FROM checkout_orders
     LEFT JOIN payment_lifecycle ON payment_lifecycle.order_id = checkout_orders.id
     WHERE merchant_id = ? AND external_order_id = ?`
  ).bind(merchant.id, externalOrderId).first<{
    orderId: string;
    amountAtomic: string;
    destinationAsset: string;
    recipient: string;
    status: string;
    createdAt: string;
    expiresAt: string;
  }>();

  if (!order) return json({ error: "Order not found" }, 404);
  return json({ order });
}
