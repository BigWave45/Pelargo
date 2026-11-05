import { Env, json } from "../_lib/intents";
import { CheckoutSessionClaims, signCheckoutSession, verifyCheckoutSession } from "../_lib/checkout-session";
import { sha256Hex } from "../_lib/database";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  // This endpoint is server-to-server. Do not grant browser CORS access to merchant credentials.
  if (request.method === "OPTIONS") return json({ error: "Method not allowed" }, 405);

  if (request.method === "GET") {
    if (!env.DB) return json({ error: "Checkout storage is not configured" }, 503);
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!token || token.length > 4096) return json({ error: "A valid checkout session token is required" }, 400);
    const claims = await verifyCheckoutSession(token, env);
    if (!claims) return json({ error: "Checkout session is invalid or expired" }, 401);
    const tokenHash = await sha256Hex(token);
    const stored = await env.DB.prepare(
      "SELECT status, expires_at FROM checkout_sessions WHERE jti = ? AND token_hash = ?"
    ).bind(claims.jti, tokenHash).first<{status:string;expires_at:string}>();
    if (!stored || stored.status !== "active" || Date.parse(stored.expires_at) <= Date.now()) {
      return json({ error: "Checkout session is no longer active" }, 410);
    }
    return json({ session: publicClaims(claims) });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.DB || !env.ORDER_SESSION_SECRET) {
    return json({ error: "Merchant checkout storage is not configured" }, 503);
  }

  const suppliedKey = request.headers.get("x-pelargo-merchant-key") ?? "";
  if (!suppliedKey || suppliedKey.length > 512) return json({ error: "Merchant authentication failed" }, 401);
  const keyHash = await sha256Hex(suppliedKey);
  const merchant = await env.DB.prepare(
    "SELECT id, name FROM merchants WHERE api_key_hash = ? AND active = 1"
  ).bind(keyHash).first<{id:string;name:string}>();
  if (!merchant) return json({ error: "Merchant authentication failed" }, 401);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8000) return json({ error: "Request body too large" }, 413);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const required = ["orderId", "amount", "amountAtomic", "destinationAsset", "destinationSymbol", "destinationNetwork", "recipient"];
  for (const field of required) {
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) {
      return json({ error: `Missing or invalid ${field}` }, 400);
    }
  }
  for (const field of required) {
    if ((body[field] as string).length > 256) return json({ error: `${field} is too long` }, 400);
  }
  if (!/^\d+$/.test(body.amountAtomic as string) || BigInt(body.amountAtomic as string) <= 0n || (body.amountAtomic as string).length > 100) {
    return json({ error: "amountAtomic must be a positive integer string" }, 400);
  }
  if (!/^\d+(\.\d+)?$/.test(body.amount as string) || Number(body.amount) <= 0) {
    return json({ error: "amount must be a positive decimal string" }, 400);
  }
  const ttl = body.expiresInSeconds === undefined ? 900 : Number(body.expiresInSeconds);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 1800) {
    return json({ error: "expiresInSeconds must be between 60 and 1800" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: CheckoutSessionClaims = {
    v: 1,
    merchantId: merchant.id,
    merchantName: merchant.name,
    orderId: body.orderId as string,
    amount: body.amount as string,
    amountAtomic: body.amountAtomic as string,
    destinationAsset: body.destinationAsset as string,
    destinationSymbol: body.destinationSymbol as string,
    destinationNetwork: body.destinationNetwork as string,
    recipient: body.recipient as string,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttl,
  };
  const token = await signCheckoutSession(claims, env);
  const tokenHash = await sha256Hex(token);
  const issuedAt = new Date(now * 1000).toISOString();
  const expiresAt = new Date(claims.exp * 1000).toISOString();

  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO checkout_orders (id, merchant_id, external_order_id, amount_atomic, destination_asset, recipient, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)"
      ).bind(crypto.randomUUID(), merchant.id, claims.orderId, claims.amountAtomic, claims.destinationAsset, claims.recipient, issuedAt, expiresAt),
      env.DB.prepare(
        "INSERT INTO checkout_sessions (jti, order_id, merchant_id, token_hash, status, issued_at, expires_at) VALUES (?, (SELECT id FROM checkout_orders WHERE merchant_id = ? AND external_order_id = ?), ?, ?, 'active', ?, ?)"
      ).bind(claims.jti, merchant.id, claims.orderId, merchant.id, tokenHash, issuedAt, expiresAt),
    ]);
  } catch {
    return json({ error: "Order already exists or checkout storage rejected the session" }, 409);
  }
  return json({ token, session: publicClaims(claims) }, 201);
}

function publicClaims(claims: CheckoutSessionClaims) {
  return {
    merchantId: claims.merchantId,
    merchantName: claims.merchantName,
    orderId: claims.orderId,
    amount: claims.amount,
    amountAtomic: claims.amountAtomic,
    destinationAsset: claims.destinationAsset,
    destinationSymbol: claims.destinationSymbol,
    destinationNetwork: claims.destinationNetwork,
    recipient: claims.recipient,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}
