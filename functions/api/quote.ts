import { Env, forwardJson, intentsRequest, json } from "../_lib/intents";
import { verifyCheckoutSession } from "../_lib/checkout-session";
import { sha256Hex } from "../_lib/database";

const MAX_BODY_BYTES = 12_000;

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Accept",
      "access-control-max-age": "86400",
    }});
  }
  if (context.request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const contentLength = Number(context.request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request body too large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const requiredStrings = ["swapType", "originAsset", "destinationAsset", "amount", "recipient", "refundTo", "sessionToken"];
  for (const field of requiredStrings) {
    if (typeof body[field] !== "string" || !(body[field] as string).trim()) {
      return json({ error: `Missing or invalid ${field}` }, 400);
    }
  }

  if (!/^\d+$/.test(body.amount as string) || BigInt(body.amount as string) <= 0n) {
    return json({ error: "amount must be a positive integer string in the relevant asset's smallest unit" }, 400);
  }
  if (!["EXACT_INPUT", "EXACT_OUTPUT"].includes(body.swapType as string)) {
    return json({ error: "Only EXACT_INPUT and EXACT_OUTPUT are enabled" }, 400);
  }
  if (typeof body.originAsset !== "string" || body.originAsset.length > 256 ||
      typeof body.destinationAsset !== "string" || body.destinationAsset.length > 256 ||
      typeof body.recipient !== "string" || body.recipient.length > 256 ||
      typeof body.refundTo !== "string" || body.refundTo.length > 256) {
    return json({ error: "One or more quote fields exceed allowed length" }, 400);
  }

  if (typeof body.sessionToken !== "string" || body.sessionToken.length > 4096) {
    return json({ error: "A valid checkout session token is required" }, 400);
  }
  const session = await verifyCheckoutSession(body.sessionToken, context.env);
  if (!session) return json({ error: "Checkout session is invalid or expired" }, 401);
  if (!context.env.DB) return json({ error: "Durable checkout storage is not configured" }, 503);
  const sessionHash = await sha256Hex(body.sessionToken);
  const storedSession = await context.env.DB.prepare(
    "SELECT status, expires_at FROM checkout_sessions WHERE jti = ? AND token_hash = ?"
  ).bind(session.jti, sessionHash).first<{status:string;expires_at:string}>();
  if (!storedSession || storedSession.status !== "active" || Date.parse(storedSession.expires_at) <= Date.now()) {
    return json({ error: "Checkout session is expired, consumed or revoked" }, 410);
  }
  if (
    body.swapType !== "EXACT_OUTPUT" ||
    body.amount !== session.amountAtomic ||
    body.destinationAsset !== session.destinationAsset ||
    body.recipient !== session.recipient
  ) {
    return json({ error: "Quote parameters do not match the signed merchant order" }, 409);
  }
  if (body.dry !== true && body.dry !== false) {
    return json({ error: "dry must be a boolean" }, 400);
  }

  // 1Click is mainnet. A committed quote creates a real deposit address.
  // Keep this disabled until the operator deliberately enables mainnet deposits.
  if (body.dry === false && context.env.ALLOW_MAINNET_DEPOSITS !== "true") {
    return json({
      error: "Mainnet deposit quotes are disabled. Only dry-run quotes are currently permitted.",
      code: "MAINNET_DEPOSITS_DISABLED",
    }, 403);
  }

  // Atomically consume the session before a committed quote is forwarded.
  // If the upstream outcome is uncertain, the session remains consumed rather
  // than allowing a second commit attempt that could create duplicate deposits.
  if (body.dry === false) {
    const claimed = await context.env.DB.prepare(
      "UPDATE checkout_sessions SET status = 'commit_attempted', consumed_at = ? WHERE jti = ? AND token_hash = ? AND status = 'active' AND expires_at > ?"
    ).bind(new Date().toISOString(), session.jti, sessionHash, new Date().toISOString()).run();
    if (!claimed.success || (claimed.meta?.changes ?? 0) !== 1) {
      return json({ error: "Checkout session has already been used or expired" }, 409);
    }
  }

  const enumFields: Record<string, string[]> = {
    depositType: ["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"],
    refundType: ["ORIGIN_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"],
    recipientType: ["DESTINATION_CHAIN", "INTENTS", "CONFIDENTIAL_INTENTS"],
  };
  for (const [field, allowed] of Object.entries(enumFields)) {
    if (body[field] !== undefined &&
        (typeof body[field] !== "string" || !allowed.includes(body[field] as string))) {
      return json({ error: `${field} must be one of: ${allowed.join(", ")}` }, 400);
    }
  }

  // The upstream currently rejects missing route types and deadline, so require
  // them at our boundary rather than forwarding a predictably invalid request.
  for (const field of ["depositType", "refundType", "recipientType"]) {
    if (typeof body[field] !== "string") {
      return json({ error: `${field} is required` }, 400);
    }
  }
  if (typeof body.deadline !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.deadline) ||
      !Number.isFinite(Date.parse(body.deadline)) ||
      Date.parse(body.deadline) <= Date.now()) {
    return json({ error: "deadline must be a future ISO 8601 timestamp" }, 400);
  }

  const slippage = body.slippageTolerance;
  if (slippage !== undefined &&
      (typeof slippage !== "number" || !Number.isFinite(slippage) || slippage < 1 || slippage > 1000)) {
    return json({ error: "slippageTolerance must be between 1 and 1000 basis points" }, 400);
  }

  const allowedKeys = new Set([
    "dry", "swapType", "originAsset", "destinationAsset", "amount",
    "recipient", "refundTo", "sessionToken", "depositType", "recipientType", "refundType",
    "slippageTolerance", "deadline", "quoteWaitingTimeMs",
    "referral", "sessionId",
  ]);
  const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    return json({ error: "Unsupported quote fields", fields: unknownKeys }, 400);
  }

  try {
    const { sessionToken: _sessionToken, ...quoteRequest } = body;
    const upstream = await intentsRequest("quote", {
      method: "POST",
      body: JSON.stringify(quoteRequest),
    }, context.env);
    return await forwardJson(upstream);
  } catch {
    return json({ error: "Unable to reach the NEAR Intents quote service" }, 502);
  }
}
