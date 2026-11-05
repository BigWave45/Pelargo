import { Env, json } from "../_lib/intents";
import { CheckoutSessionClaims, signCheckoutSession, verifyCheckoutSession } from "../_lib/checkout-session";

function corsPreflight() {
  return new Response(null, { status: 204, headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept, X-Pelargo-Merchant-Key",
    "access-control-max-age": "86400",
  }});
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method === "OPTIONS") return corsPreflight();

  if (request.method === "GET") {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!token || token.length > 4096) return json({ error: "A valid checkout session token is required" }, 400);
    const claims = await verifyCheckoutSession(token, env);
    if (!claims) return json({ error: "Checkout session is invalid or expired" }, 401);
    return json({ session: publicClaims(claims) });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!env.PELARGO_MERCHANT_API_KEY || !env.ORDER_SESSION_SECRET) {
    return json({ error: "Merchant session issuance is not configured" }, 503);
  }
  const suppliedKey = request.headers.get("x-pelargo-merchant-key") ?? "";
  if (!suppliedKey || suppliedKey !== env.PELARGO_MERCHANT_API_KEY) {
    return json({ error: "Merchant authentication failed" }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8000) return json({ error: "Request body too large" }, 413);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const required = ["merchantId", "merchantName", "orderId", "amount", "amountAtomic", "destinationAsset", "destinationSymbol", "destinationNetwork", "recipient"];
  for (const field of required) {
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) {
      return json({ error: `Missing or invalid ${field}` }, 400);
    }
  }
  for (const field of ["merchantId", "merchantName", "orderId", "amount", "destinationAsset", "destinationSymbol", "destinationNetwork", "recipient"]) {
    if ((body[field] as string).length > 256) return json({ error: `${field} is too long` }, 400);
  }
  if (!/^\d+$/.test(body.amountAtomic as string) || BigInt(body.amountAtomic as string) <= 0n || (body.amountAtomic as string).length > 100) {
    return json({ error: "amountAtomic must be a positive integer string" }, 400);
  }
  if (!/^\d+(\.\d+)?$/.test(body.amount as string)) {
    return json({ error: "amount must be a positive decimal string" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const requestedTtl = body.expiresInSeconds === undefined ? 900 : Number(body.expiresInSeconds);
  if (!Number.isInteger(requestedTtl) || requestedTtl < 60 || requestedTtl > 1800) {
    return json({ error: "expiresInSeconds must be between 60 and 1800" }, 400);
  }

  const claims: CheckoutSessionClaims = {
    v: 1,
    merchantId: body.merchantId as string,
    merchantName: body.merchantName as string,
    orderId: body.orderId as string,
    amount: body.amount as string,
    amountAtomic: body.amountAtomic as string,
    destinationAsset: body.destinationAsset as string,
    destinationSymbol: body.destinationSymbol as string,
    destinationNetwork: body.destinationNetwork as string,
    recipient: body.recipient as string,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + requestedTtl,
  };

  try {
    const token = await signCheckoutSession(claims, env);
    return json({ token, session: publicClaims(claims) }, 201);
  } catch {
    return json({ error: "Checkout session signing is unavailable" }, 503);
  }
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
