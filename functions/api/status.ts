import { json } from "../_lib/intents";

/**
 * Retired legacy endpoint. Status lookups must use the merchant-scoped
 * /api/payment-status route so a public deposit address cannot be used as
 * an unauthenticated provider-status oracle.
 */
export async function onRequest(context: { request: Request }): Promise<Response> {
  if (context.request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }
  return json({
    error: "This endpoint has been retired. Use the authenticated merchant order status endpoint.",
    code: "LEGACY_STATUS_ENDPOINT_RETIRED",
  }, 410);
}
