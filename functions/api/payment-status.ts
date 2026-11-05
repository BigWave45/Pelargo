import { Env, intentsRequest, json } from "../_lib/intents";
import { sha256Hex } from "../_lib/database";
import { PaymentStatus, transitionPayment, PaymentTransitionError } from "../_lib/payment-lifecycle";
import { verifyNearNep141Settlement } from "../_lib/near-settlement-verifier";
import { verifyCheckoutSession } from "../_lib/checkout-session";
import { authenticateMerchantSession } from "../_lib/merchant-auth";

type ProviderStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

type ProviderQuoteResponse = {
  correlationId?: unknown;
  quoteRequest?: { originAsset?: unknown };
  quote?: Record<string, unknown>;
};

function readProviderHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const hashes: string[] = [];
  for (const item of value) {
    const candidate = typeof item === "string"
      ? item
      : item !== null && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>).hash
        : null;
    if (typeof candidate === "string" && candidate.trim().length > 0 &&
        candidate.length <= 256 && !hashes.includes(candidate)) {
      hashes.push(candidate);
    }
  }
  return hashes;
}

function readQuoteInstructions(value: unknown): {
  originAssetId: string;
  amountInAtomic: string;
  amountInFormatted?: string;
  amountOutAtomic?: string;
  amountOutFormatted?: string;
  deadline?: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const response = value as ProviderQuoteResponse;
  const quote = response.quote;
  const originAssetId = response.quoteRequest?.originAsset;
  const amountIn = quote?.amountIn;
  if (typeof originAssetId !== "string" || !originAssetId.trim() || originAssetId.length > 256 ||
      typeof amountIn !== "string" || !/^\d+$/.test(amountIn) || BigInt(amountIn) <= 0n) return null;

  const result: {
    originAssetId: string;
    amountInAtomic: string;
    amountInFormatted?: string;
    amountOutAtomic?: string;
    amountOutFormatted?: string;
    deadline?: string;
  } = { originAssetId, amountInAtomic: amountIn };

  if (typeof quote?.amountInFormatted === "string" && quote.amountInFormatted.length <= 80) {
    result.amountInFormatted = quote.amountInFormatted;
  }
  if (typeof quote?.amountOut === "string" && /^\d+$/.test(quote.amountOut)) {
    result.amountOutAtomic = quote.amountOut;
  }
  if (typeof quote?.amountOutFormatted === "string" && quote.amountOutFormatted.length <= 80) {
    result.amountOutFormatted = quote.amountOutFormatted;
  }
  if (typeof quote?.deadline === "string" && Number.isFinite(Date.parse(quote.deadline))) {
    result.deadline = quote.deadline;
  }
  return result;
}

async function advanceToProcessing(
  db: NonNullable<Env["DB"]>,
  orderId: string,
  currentStatus: PaymentStatus,
): Promise<PaymentStatus> {
  const remaining: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
    quote_committed: ["awaiting_deposit", "deposit_detected", "processing"],
    awaiting_deposit: ["deposit_detected", "processing"],
    deposit_detected: ["processing"],
  };
  let status = currentStatus;
  for (const nextStatus of remaining[status] ?? []) {
    await transitionPayment(db, { orderId, expectedStatus: status, nextStatus });
    status = nextStatus;
  }
  return status;
}

const transitions: Partial<Record<ProviderStatus, { from: PaymentStatus[]; to: PaymentStatus }>> = {
  PENDING_DEPOSIT: { from: ["quote_committed"], to: "awaiting_deposit" },
  KNOWN_DEPOSIT_TX: { from: ["awaiting_deposit"], to: "deposit_detected" },
  PROCESSING: { from: ["deposit_detected"], to: "processing" },
  INCOMPLETE_DEPOSIT: { from: ["awaiting_deposit", "deposit_detected", "processing"], to: "incomplete_deposit" },
  FAILED: { from: ["quote_committed", "awaiting_deposit", "deposit_detected", "processing"], to: "failed" },
  REFUNDED: { from: ["processing", "incomplete_deposit"], to: "refunded" },
};

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type, Accept, Authorization",
    "access-control-max-age": "86400",
  }});
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.DB) return json({ error: "Checkout storage is not configured" }, 503);

  const url = new URL(request.url);
  const suppliedKey = request.headers.get("x-pelargo-merchant-key") ?? "";
  let merchantId = "";
  let orderId = url.searchParams.get("orderId") ?? "";
  let buyerSessionExpired = false;

  if (suppliedKey) {
    if (suppliedKey.length > 512) return json({ error: "Merchant authentication failed" }, 401);
    const keyHash = await sha256Hex(suppliedKey);
    const merchant = await env.DB.prepare(
      "SELECT id FROM merchants WHERE api_key_hash = ? AND active = 1"
    ).bind(keyHash).first<{ id: string }>();
    if (!merchant) return json({ error: "Merchant authentication failed" }, 401);
    merchantId = merchant.id;
    if (!orderId || orderId.length > 256) return json({ error: "A valid orderId query parameter is required" }, 400);
  } else {
    const dashboardMerchant = await authenticateMerchantSession(request, env);
    if (dashboardMerchant) {
      if (!orderId || orderId.length > 256) return json({ error: "A valid orderId query parameter is required" }, 400);
      merchantId = dashboardMerchant.id;
    } else {
      // Buyers may poll only the order bound to their signed, committed checkout session.
      // The token is accepted in Authorization, never in the URL or response body.
      const authorization = request.headers.get("authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_.-]{1,4096})$/.exec(authorization);
    if (!match) return json({ error: "Merchant or checkout-session authentication is required" }, 401);
    // Expired signed sessions may only recover an already-committed order.
    // The persisted session status and order binding below remain authoritative.
    const claims = await verifyCheckoutSession(match[1], env, { allowExpired: true });
    if (!claims) return json({ error: "Checkout session is invalid" }, 401);
    buyerSessionExpired = claims.exp <= Math.floor(Date.now() / 1000);
    const tokenHash = await sha256Hex(match[1]);
    const stored = await env.DB.prepare(
      "SELECT status FROM checkout_sessions WHERE jti = ? AND order_id = (SELECT id FROM checkout_orders WHERE merchant_id = ? AND external_order_id = ?) AND merchant_id = ? AND token_hash = ?"
    ).bind(claims.jti, claims.merchantId, claims.orderId, claims.merchantId, tokenHash).first<{ status: string }>();
    if (!stored || stored.status !== "committed") {
      return json({ error: "Checkout session has no committed payment instructions", code: "CHECKOUT_NOT_COMMITTED" }, 403);
    }
    if (orderId && orderId !== claims.orderId) return json({ error: "Checkout session does not authorize this order" }, 403);
    orderId = claims.orderId;
      merchantId = claims.merchantId;
    }
  }


  const payment = await env.DB.prepare(
    `SELECT o.id, o.external_order_id, o.status AS order_status,
            o.destination_network, o.destination_asset, o.recipient, o.amount_atomic,
            p.status, p.quote_id, p.deposit_address, p.deposit_memo, p.provider_status, p.destination_tx_candidate, p.last_polled_at
       FROM checkout_orders o
       JOIN payment_lifecycle p ON p.order_id = o.id
      WHERE o.merchant_id = ? AND o.external_order_id = ?`
  ).bind(merchantId, orderId).first<{
    id: string; external_order_id: string; order_status: string;
    destination_network: string; destination_asset: string; recipient: string; amount_atomic: string;
    status: PaymentStatus; quote_id: string | null; deposit_address: string | null; deposit_memo: string | null; provider_status: string | null; destination_tx_candidate: string | null; last_polled_at: string | null;
  }>();

  if (!payment) return json({ error: "Order not found" }, 404);
  if (buyerSessionExpired && payment.status === "expired") {
    return json({ error: "Checkout session expired before payment instructions were committed" }, 401);
  }
  if (!payment.deposit_address) {
    return json({ error: "No committed deposit address exists for this order", code: "DEPOSIT_NOT_CREATED" }, 409);
  }

  const params = new URLSearchParams({ depositAddress: payment.deposit_address });
  if (payment.deposit_memo) params.set("depositMemo", payment.deposit_memo);

  let provider: {
    correlationId?: unknown;
    status?: ProviderStatus;
    swapDetails?: {
      originChainTxHashes?: unknown;
      nearTxHashes?: unknown;
      destinationChainTxHashes?: unknown;
    };
    updatedAt?: string;
    quoteResponse?: unknown;
  };
  try {
    const response = await intentsRequest(`status?${params.toString()}`, {
      method: "GET",
      signal: AbortSignal.timeout(12_000),
    }, env);
    if (!response.ok) return json({ error: "NEAR Intents status service rejected the lookup", upstreamStatus: response.status }, 502);
    provider = await response.json() as typeof provider;
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return json({
        error: "NEAR Intents status request timed out",
        code: "PROVIDER_STATUS_TIMEOUT",
        retryable: true,
      }, 504);
    }
    return json({ error: "Unable to retrieve payment status from NEAR Intents", code: "PROVIDER_STATUS_UNAVAILABLE", retryable: true }, 502);
  }

  const validStatuses: ProviderStatus[] = [
    "PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS",
    "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED",
  ];
  if (!provider.status || !validStatuses.includes(provider.status)) {
    return json({ error: "NEAR Intents returned an unrecognized payment status" }, 502);
  }

  if (provider.updatedAt !== undefined &&
      (typeof provider.updatedAt !== "string" || !Number.isFinite(Date.parse(provider.updatedAt)))) {
    return json({ error: "NEAR Intents returned an invalid provider update timestamp" }, 502);
  }

  const quoteInstructions = readQuoteInstructions(provider.quoteResponse);
  const providerCorrelationId = typeof provider.correlationId === "string"
    ? provider.correlationId : null;
  const quoteResponse = provider.quoteResponse !== null && typeof provider.quoteResponse === "object"
    ? provider.quoteResponse as Record<string, unknown> : null;
  const quoteCorrelationId = typeof quoteResponse?.correlationId === "string"
    ? quoteResponse.correlationId : null;
  const providerDepositAddress = typeof (quoteResponse?.quote as Record<string, unknown> | undefined)?.depositAddress === "string"
    ? (quoteResponse?.quote as Record<string, unknown>).depositAddress as string : null;
  if ((providerCorrelationId && providerCorrelationId !== payment.quote_id) ||
      (quoteCorrelationId && quoteCorrelationId !== payment.quote_id) ||
      (providerDepositAddress && providerDepositAddress !== payment.deposit_address)) {
    return json({
      error: "Provider status does not match the committed Pelargo quote",
      code: "PROVIDER_QUOTE_CORRELATION_MISMATCH",
    }, 502);
  }
  const quoteCorrelationMatches = payment.quote_id && (providerCorrelationId || quoteCorrelationId)
    ? providerCorrelationId === payment.quote_id || quoteCorrelationId === payment.quote_id
    : null;
  const providerEvidence = {
    providerCorrelationId,
    savedQuoteId: payment.quote_id,
    quoteCorrelationId,
    quoteCorrelationMatches,
    originChainTxHashes: readProviderHashes(provider.swapDetails?.originChainTxHashes),
    nearTxHashes: readProviderHashes(provider.swapDetails?.nearTxHashes),
    destinationChainTxHashes: readProviderHashes(provider.swapDetails?.destinationChainTxHashes),
  };
  const depositInstructions = quoteInstructions ? {
    ...quoteInstructions,
    depositAddress: payment.deposit_address,
    depositMemo: payment.deposit_memo,
  } : undefined;

  const now = new Date().toISOString();
  // Provider JSON is untrusted. A malformed/null array entry must not crash
  // the status endpoint or prevent a valid later transaction candidate being read.
  const destinationHashes = Array.isArray(provider.swapDetails?.destinationChainTxHashes)
    ? provider.swapDetails.destinationChainTxHashes
    : [];
  // The 1Click API represents transaction hashes as either strings or
  // { hash } objects. Normalize both forms before selecting a candidate.
  const candidateHash =
    readProviderHashes(destinationHashes)[0] ??
    readProviderHashes(provider.swapDetails?.nearTxHashes)[0] ??
    null;
  // A later provider response may omit hashes already observed on an earlier
  // poll. Preserve and reuse the persisted candidate for SUCCESS verification.
  const effectiveCandidateHash = candidateHash ?? payment.destination_tx_candidate;
  // Compare-and-set against the lifecycle snapshot read before the upstream
  // request. Two concurrent polls may return different candidate hashes; only
  // the first response based on this snapshot may update provider state.
  const pollWrite = await env.DB.prepare(
    `UPDATE payment_lifecycle
        SET provider_status = ?, provider_updated_at = ?, destination_tx_candidate = COALESCE(?, destination_tx_candidate),
            last_polled_at = ?, updated_at = ?
      WHERE order_id = ? AND status = ? AND destination_tx_candidate IS ? AND last_polled_at IS ?`
  ).bind(
    provider.status, provider.updatedAt ?? null, candidateHash, now, now,
    payment.id, payment.status, payment.destination_tx_candidate, payment.last_polled_at,
  ).run();
  if ((pollWrite.meta?.changes ?? 0) !== 1) {
    // Another poll or lifecycle transition won the compare-and-set while this
    // provider request was in flight. Do not retry the provider request and do
    // not report the stale snapshot as current; return the latest persisted
    // state so concurrent browser polling is safe and idempotent.
    const latest = await env.DB.prepare(
      `SELECT status, provider_status, destination_tx_candidate
         FROM payment_lifecycle
        WHERE order_id = ?`
    ).bind(payment.id).first<{
      status: PaymentStatus;
      provider_status: ProviderStatus | null;
      destination_tx_candidate: string | null;
    }>();

    if (!latest) return json({ error: "Payment state could not be reloaded after a concurrent update" }, 503);

    return json({
      orderId,
      paymentStatus: latest.status,
      providerStatus: latest.provider_status,
      settlement: latest.status === "settled" ? "verified" : "not_settled",
      concurrentPoll: true,
    });
  }

  // A destination transaction may appear while the provider still says PROCESSING.
  // Finalized chain evidence can settle the order independently of that lagging status.
  if (provider.status === "SUCCESS" || Boolean(effectiveCandidateHash)) {
    if (payment.status === "settled") {
      return json({ orderId, paymentStatus: "settled", providerStatus: provider.status, settlement: "verified", depositInstructions });
    }
    if (!effectiveCandidateHash) {
      return json({
        orderId, paymentStatus: payment.status, providerStatus: provider.status,
        settlement: "provider_success_missing_destination_tx",
        depositInstructions,
      });
    }

    let verificationStatus = payment.status;
    try {
      // Polling can skip intermediate provider states. SUCCESS confirms the
      // provider completed its swap; record the missing internal progression
      // before independently verifying the destination transfer.
      verificationStatus = await advanceToProcessing(env.DB, payment.id, payment.status);

      if (verificationStatus === "processing" &&
          payment.destination_network.trim().toUpperCase() === "NEAR") {
        const evidence = await verifyNearNep141Settlement(env, {
          destinationNetwork: payment.destination_network,
          destinationAsset: payment.destination_asset,
          recipient: payment.recipient,
          amountAtomic: payment.amount_atomic,
        }, effectiveCandidateHash);

        if (evidence) {
          const verifiedAt = new Date().toISOString();
          const results = await env.DB.batch([
            env.DB.prepare(
              `INSERT INTO payment_settlement_evidence
                (order_id, destination_chain, destination_asset, token_contract, transaction_hash,
                 recipient, amount_atomic, block_number, block_hash, confirmations, verification_source, verified_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chain_rpc', ?)`
            ).bind(
              payment.id, evidence.destinationChain, evidence.destinationAsset, evidence.tokenContract,
              evidence.transactionHash, evidence.recipient, evidence.amountAtomic, evidence.blockNumber,
              evidence.blockHash, evidence.confirmations, verifiedAt,
            ),
            env.DB.prepare(
              `UPDATE payment_lifecycle
                  SET status = 'settled', updated_at = ?
                WHERE order_id = ? AND status = 'processing' AND destination_tx_candidate = ?`
            ).bind(verifiedAt, payment.id, effectiveCandidateHash),
          ]) as Array<{ success: boolean; meta?: { changes?: number } }>;
          if (!results[0]?.success || !results[1]?.success || (results[1]?.meta?.changes ?? 0) !== 1) {
            return json({ error: "Verified transfer could not be committed to the payment ledger; reconciliation is required" }, 502);
          }
          return json({
            orderId, paymentStatus: "settled", providerStatus: provider.status,
            settlement: "verified", destinationTransactionHash: effectiveCandidateHash,
            verifiedBlockHeight: evidence.blockNumber, depositInstructions,
          });
        }
      }
      return json({
        orderId,
        paymentStatus: verificationStatus,
        providerStatus: provider.status,
        settlement: payment.destination_network.trim().toUpperCase() === "NEAR"
          ? "awaiting_destination_chain_verification"
          : "destination_network_verifier_not_supported",
        depositInstructions,
      });
    } catch (error) {
      if (error instanceof PaymentTransitionError && error.code === "conflict") {
        return json({ error: "Payment changed during settlement verification; retry the lookup" }, 409);
      }
      console.error("[pelargo] near_settlement_verification_failed", {
        orderId, message: error instanceof Error ? error.message : "unknown",
      });
      return json({
        orderId, paymentStatus: verificationStatus, providerStatus: provider.status,
        settlement: "verification_unavailable_or_mismatched", depositInstructions,
      }, 503);
    }
  }

  const transition = transitions[provider.status];
  if (transition && transition.from.includes(payment.status)) {
    try {
      await transitionPayment(env.DB, {
        orderId: payment.id,
        expectedStatus: payment.status,
        nextStatus: transition.to,
      });
    } catch (error) {
      if (!(error instanceof PaymentTransitionError) || error.code !== "conflict") throw error;
      const latest = await env.DB.prepare(
        `SELECT status, provider_status FROM payment_lifecycle WHERE order_id = ?`
      ).bind(payment.id).first<{ status: PaymentStatus; provider_status: ProviderStatus | null }>();
      if (!latest) return json({ error: "Payment state could not be reloaded after a concurrent transition" }, 503);
      return json({
        orderId,
        paymentStatus: latest.status,
        providerStatus: latest.provider_status,
        settlement: latest.status === "settled" ? "verified" : "not_settled",
        concurrentPoll: true,
      });
    }
  }

  return json({
    orderId,
    paymentStatus: transition?.from.includes(payment.status) ? transition.to : payment.status,
    providerStatus: provider.status,
    settlement: "not_settled",
    depositInstructions,
    providerEvidence,
  });
}
