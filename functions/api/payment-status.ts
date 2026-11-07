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

 
function readTidepoolExplorer(value: unknown): Array<{ label: string; url: string; hash: string | null }> {
  if (!Array.isArray(value)) return [];
  const items: Array<{ label: string; url: string; hash: string | null }> = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === "string" ? item.label.slice(0, 100) : "";
    const url = typeof item.url === "string" ? item.url.slice(0, 500) : "";
    let hash: string | null = null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:") {
        const segments = parsed.pathname.split("/").filter(Boolean);
        const last = segments[segments.length - 1] ?? "";
        if (/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(last)) hash = last;
      }
    } catch { /* Ignore malformed provider explorer URLs. */ }
    if (label || url) items.push({ label, url, hash });
  }
  return items.slice(0, 12);
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
  const internalCredential = request.headers.get("x-pelargo-reconciliation-secret");
  const isInternalReconciliation = internalCredential !== null;
  if (isInternalReconciliation) {
    if (!env.RECONCILIATION_SECRET ||
        internalCredential.length > 512 ||
        internalCredential !== env.RECONCILIATION_SECRET) {
      return json({ error: "Internal reconciliation authentication failed" }, 401);
    }
    const internalOrderId = url.searchParams.get("internalOrderId") ?? "";
    if (!internalOrderId || internalOrderId.length > 128) {
      return json({ error: "A valid internal order ID is required" }, 400);
    }
    const internalOrder = await env.DB.prepare(
      "SELECT merchant_id, external_order_id FROM checkout_orders WHERE id = ?"
    ).bind(internalOrderId).first<{ merchant_id: string; external_order_id: string }>();
    if (!internalOrder) return json({ error: "Order not found" }, 404);
    merchantId = internalOrder.merchant_id;
    orderId = internalOrder.external_order_id;
  }

  if (isInternalReconciliation) {
    // The scheduled Worker is trusted only after the private secret check above.
    // It still enters the same provider polling, chain verifier and D1 guards.
  } else if (suppliedKey) {
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
            p.status, p.quote_id, p.deposit_address, p.deposit_memo, p.provider_status, p.provider_updated_at, p.destination_tx_candidate, p.last_polled_at
       FROM checkout_orders o
       JOIN payment_lifecycle p ON p.order_id = o.id
      WHERE o.merchant_id = ? AND o.external_order_id = ?`
  ).bind(merchantId, orderId).first<{
    id: string; external_order_id: string; order_status: string;
    destination_network: string; destination_asset: string; recipient: string; amount_atomic: string;
    status: PaymentStatus; quote_id: string | null; deposit_address: string | null; deposit_memo: string | null; provider_status: string | null; provider_updated_at: string | null; destination_tx_candidate: string | null; last_polled_at: string | null;
  }>();

  if (!payment) return json({ error: "Order not found" }, 404);
  // Settlement evidence is immutable. Once settled, do not poll the provider
  // or update destination_tx_candidate: later provider responses can contain
  // intermediate hashes that must never overwrite the verified transaction.
  if (payment.status === "settled") {
    const evidence = await env.DB.prepare(
      "SELECT transaction_hash, block_number FROM payment_settlement_evidence WHERE order_id = ?"
    ).bind(payment.id).first<{ transaction_hash: string; block_number: string }>();
    if (!evidence) {
      return json({ error: "Settled payment is missing immutable settlement evidence", code: "SETTLEMENT_EVIDENCE_MISSING" }, 503);
    }
    return json({
      orderId,
      paymentStatus: "settled",
      providerStatus: payment.provider_status,
      settlement: "verified",
      destinationTransactionHash: evidence.transaction_hash,
      verifiedBlockHeight: evidence.block_number,
    });
  }
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
    tidepool?: { explorer?: unknown };
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
    tidepoolExplorer: readTidepoolExplorer(provider.tidepool?.explorer),
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
  const tidepoolExplorer = readTidepoolExplorer(provider.tidepool?.explorer);
  const labelledExecuteIntentsHashes = tidepoolExplorer
    .filter((item) => /execute[_ -]?intents/i.test(item.label))
    .map((item) => item.hash)
    .filter((hash): hash is string => Boolean(hash));
  const candidateHashes = [
    ...labelledExecuteIntentsHashes,
    ...readProviderHashes(destinationHashes),
    ...readProviderHashes(provider.swapDetails?.nearTxHashes),
    // Explicitly configured recovery hash is scoped to Preview configuration;
    // its signer hint is accepted only for this exact hash by the verifier.
    ...(env.NEAR_TX_HASH && env.NEAR_TX_ORDER_ID === payment.external_order_id
      ? [env.NEAR_TX_HASH.trim()]
      : []),
  ].filter((hash) => /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash));
  const candidateHash = candidateHashes[0] ?? null;
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
    const candidateDiagnostics: Array<{ hash: string; stage: string; detail?: string }> = [];
    try {
      // Polling can skip intermediate provider states. SUCCESS confirms the
      // provider completed its swap; record the missing internal progression
      // before independently verifying the destination transfer.
      verificationStatus = await advanceToProcessing(env.DB, payment.id, payment.status);

      if (verificationStatus === "processing" &&
          payment.destination_network.trim().toUpperCase() === "NEAR") {
        let evidence = null;
        const candidateErrors: string[] = [];
        // Provider responses can contain multiple NEAR transactions for one
        // intent. Verify each hash independently; never assume the first is
        // the destination transfer. A bad indexer response for one candidate
        // must not prevent a later candidate from being checked.
        const hashesToVerify = [...new Set([
          ...candidateHashes,
          ...(effectiveCandidateHash ? [effectiveCandidateHash] : []),
        ])];
        for (const hash of hashesToVerify) {
          try {
            evidence = await verifyNearNep141Settlement(env, {
              destinationNetwork: payment.destination_network,
              destinationAsset: payment.destination_asset,
              recipient: payment.recipient,
              amountAtomic: payment.amount_atomic,
            }, hash, (stage) => candidateDiagnostics.push({ hash, stage }), provider.updatedAt ?? payment.provider_updated_at ?? undefined);
            if (evidence) break;
          } catch (error) {
            const detail = error instanceof Error ? error.message.slice(0, 240) : "Unknown verifier failure";
            candidateDiagnostics.push({ hash, stage: "verifier_exception", detail });
            candidateErrors.push(`${hash}: ${detail}`);
          }
          // A bounded RPC block scan is deliberately limited to one candidate
          // per poll. Repeating a multi-block scan for every intermediate NEAR
          // hash can multiply public-RPC load without improving safety.
          if (candidateDiagnostics.some((item) =>
            item.hash === hash && (
              item.stage === "testnet_indexer_unavailable_rpc_block_scan" ||
              item.stage === "testnet_rpc_block_scan_started" ||
              item.stage === "signer_resolved_from_canonical_rpc_block_scan"
            ))) break;
        }
        // Keep every candidate failure visible. A later candidate may still
        // verify successfully; if none does, return the complete bounded
        // diagnostic set instead of throwing only the last candidate's error.
        if (!evidence && candidateErrors.length > 0) {
          console.error("[pelargo] near_candidate_verification_errors", {
            orderId, candidateErrors: candidateErrors.slice(0, 8),
          });
          return json({
            orderId,
            paymentStatus: verificationStatus,
            providerStatus: provider.status,
            settlement: "verification_unavailable_or_mismatched",
            code: "NEAR_SETTLEMENT_CANDIDATES_FAILED",
            verificationDiagnostics: candidateDiagnostics.slice(0, 24),
            providerEvidence,
            candidateHash: effectiveCandidateHash,
            depositInstructions,
          }, 503);
        }

        if (evidence) {
          const verifiedAt = new Date().toISOString();
          // The candidate that passed canonical verification may not be the
          // first hash returned by the provider. Persist that exact hash before
          // inserting immutable evidence so the database guard validates the
          // verified transaction, not a stale candidate. D1 batch is atomic:
          // any failed guard or state transition rolls back all three writes.
          const results = await env.DB.batch([
            env.DB.prepare(
              `UPDATE payment_lifecycle
                  SET destination_tx_candidate = ?, updated_at = ?
                WHERE order_id = ? AND status = 'processing'`
            ).bind(evidence.transactionHash, verifiedAt, payment.id),
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
            ).bind(verifiedAt, payment.id, evidence.transactionHash),
          ]) as Array<{ success: boolean; meta?: { changes?: number } }>;
          if (results.length !== 3 || results.some((result) => !result?.success) ||
              (results[0]?.meta?.changes ?? 0) !== 1 || (results[2]?.meta?.changes ?? 0) !== 1) {
            return json({ error: "Verified transfer could not be committed to the payment ledger; reconciliation is required" }, 502);
          }
          return json({
            orderId, paymentStatus: "settled", providerStatus: provider.status,
            settlement: "verified", destinationTransactionHash: evidence.transactionHash,
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
        verificationDiagnostics: candidateDiagnostics,
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
        settlement: "verification_unavailable_or_mismatched",
        code: "NEAR_SETTLEMENT_VERIFICATION_FAILED",
        diagnostic: {
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message.slice(0, 240) : "Unknown verifier failure",
        },
        providerEvidence,
        candidateHash: effectiveCandidateHash,
        depositInstructions,
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
