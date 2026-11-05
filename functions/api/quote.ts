import { Env, forwardJson, intentsProvider, intentsRequest, json } from "../_lib/intents";
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

  let provider: ReturnType<typeof intentsProvider>;
  try { provider = intentsProvider(context.env); }
  catch { return json({ error: "NEAR Intents provider configuration is invalid" }, 503); }

  // Each network has an independent committed-quote gate.
  if (body.dry === false) {
    const enabled = provider.network === "testnet"
      ? context.env.ALLOW_TESTNET_DEPOSITS === "true"
      : context.env.ALLOW_MAINNET_DEPOSITS === "true";
    if (!enabled) {
      return json({
        error: provider.network === "testnet"
          ? "Testnet deposits are disabled until the operator enables Tidepool."
          : "Mainnet deposit quotes are disabled. Only dry-run quotes are currently permitted.",
        code: provider.network === "testnet" ? "TESTNET_DEPOSITS_DISABLED" : "MAINNET_DEPOSITS_DISABLED",
      }, 403);
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

  try {
    const { sessionToken: _sessionToken, ...quoteRequest } = body;
    // Use the server-issued checkout JTI as the provider tracking session.
    // This gives support a stable cross-system reference if the quote response
    // is lost after the provider has accepted the commit.
    quoteRequest.sessionId = session.jti;
    const upstream = await intentsRequest("quote", {
      method: "POST",
      body: JSON.stringify(quoteRequest),
    }, context.env);

    if (body.dry === false && upstream.ok) {
      const payload = await upstream.clone().json() as {
        correlationId?: unknown;
        quote?: { depositAddress?: unknown; depositMemo?: unknown };
      };
      const quoteId = payload?.correlationId;
      const depositAddress = payload?.quote?.depositAddress;
      const depositMemo = payload?.quote?.depositMemo;
      if (typeof quoteId !== "string" || !quoteId.trim() || quoteId.length > 256) {
        return json({
          error: "The payment provider committed a quote without a valid correlation ID. Contact support before retrying.",
          code: "COMMITTED_QUOTE_MISSING_ID",
        }, 502);
      }
      if (typeof depositAddress !== "string" || !depositAddress.trim() || depositAddress.length > 256 ||
          (depositMemo !== undefined && (typeof depositMemo !== "string" || depositMemo.length > 256))) {
        // The provider may have committed a quote, but without its deposit
        // locator Pelargo cannot safely monitor or reconcile it. Keep the
        // session consumed and do not represent the order as payable.
        return json({
          error: "The payment provider returned an incomplete committed quote. Contact support before retrying.",
          code: "COMMITTED_QUOTE_MISSING_DEPOSIT_DETAILS",
        }, 502);
      }

      const now = new Date().toISOString();
      // One compare-and-set is the commit point. Migration 0004's trigger
      // synchronizes the order and session rows in the same SQLite statement
      // and aborts the whole write if either dependent row is stale or missing.
      const persisted = await context.env.DB!.prepare(
        `UPDATE payment_lifecycle
            SET status = 'quote_committed', quote_id = ?, deposit_address = ?, deposit_memo = ?, updated_at = ?
          WHERE order_id = (
            SELECT o.id FROM checkout_orders o
             WHERE o.merchant_id = ? AND o.external_order_id = ? AND o.status = 'pending'
          )
            AND status = 'pending'
            AND EXISTS (
              SELECT 1 FROM checkout_sessions s
               WHERE s.jti = ? AND s.order_id = payment_lifecycle.order_id
                 AND s.status = 'commit_attempted'
            )`
      ).bind(quoteId, depositAddress, depositMemo ?? null, now, session.merchantId, session.orderId, session.jti).run();
      if (!persisted.success || (persisted.meta?.changes ?? 0) !== 1) {
        return json({ error: "Quote committed upstream but local payment state could not be saved. Do not submit another payment; contact support." }, 502);
      }
    }
    return await forwardJson(upstream);

  } catch {
    return json({ error: "Unable to reach the NEAR Intents quote service" }, 502);
  }
}
