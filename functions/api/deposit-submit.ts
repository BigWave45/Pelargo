import { Env, intentsRequest, json } from "../_lib/intents";
import { authenticateMerchantSession } from "../_lib/merchant-auth";
import { sha256Hex } from "../_lib/database";
import { verifyBaseSepoliaErc20Deposit } from "../_lib/base-deposit-verifier";

type ProviderStatus =
  | "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS"
  | "INCOMPLETE_DEPOSIT" | "REFUNDED" | "FAILED";

type ProviderStatusResponse = {
  correlationId?: unknown;
  status?: unknown;
  quoteResponse?: {
    correlationId?: unknown;
    quoteRequest?: { originAsset?: unknown; destinationAsset?: unknown; recipient?: unknown };
    quote?: {
      amountIn?: unknown;
      amountOut?: unknown;
      depositAddress?: unknown;
    };
  };
  swapDetails?: {
    originChainTxHashes?: Array<{ hash?: unknown }>;
    nearTxHashes?: string[];
    destinationChainTxHashes?: Array<{ hash?: unknown }>;
  };
};

const statuses: ProviderStatus[] = [
  "PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS",
  "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED",
];

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.DB) return json({ error: "Checkout storage is not configured" }, 503);

  const suppliedKey = request.headers.get("x-pelargo-merchant-key") ?? "";
  let merchantId = "";
  if (suppliedKey) {
    if (suppliedKey.length > 512) return json({ error: "Merchant authentication failed" }, 401);
    const keyHash = await sha256Hex(suppliedKey);
    const merchant = await env.DB.prepare(
      "SELECT id FROM merchants WHERE api_key_hash = ? AND active = 1"
    ).bind(keyHash).first<{ id: string }>();
    if (!merchant) return json({ error: "Merchant authentication failed" }, 401);
    merchantId = merchant.id;
  } else {
    const merchant = await authenticateMerchantSession(request, env);
    if (!merchant) return json({ error: "Merchant authentication failed" }, 401);
    merchantId = merchant.id;
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4000) return json({ error: "Request body too large" }, 413);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const transactionHash = typeof body.transactionHash === "string" ? body.transactionHash.trim() : "";
  if (!orderId || orderId.length > 256 || !/^0x[a-fA-F0-9]{64}$/.test(transactionHash)) {
    return json({ error: "A valid orderId and Base transactionHash are required" }, 400);
  }

  const payment = await env.DB.prepare(
    `SELECT o.id, o.external_order_id, o.amount_atomic, o.destination_asset,
            o.recipient, o.destination_network, p.status, p.quote_id, p.deposit_address
       FROM checkout_orders o
       JOIN payment_lifecycle p ON p.order_id = o.id
      WHERE o.merchant_id = ? AND o.external_order_id = ?`
  ).bind(merchantId, orderId).first<{
    id: string; external_order_id: string; amount_atomic: string; destination_asset: string;
    recipient: string; destination_network: string; status: string; quote_id: string | null;
    deposit_address: string | null;
  }>();
  if (!payment) return json({ error: "Order not found" }, 404);
  if (!payment.quote_id || !payment.deposit_address ||
      !["quote_committed", "awaiting_deposit", "deposit_detected", "processing"].includes(payment.status)) {
    return json({ error: "Order has no recoverable committed deposit instructions", code: "ORDER_NOT_COMMITTED" }, 409);
  }
  if (payment.destination_network.trim().toUpperCase() !== "NEAR") {
    return json({ error: "Origin deposit recovery is not enabled for this destination network" }, 409);
  }

  let providerBefore: ProviderStatusResponse;
  try {
    const response = await intentsRequest(
      `status?depositAddress=${encodeURIComponent(payment.deposit_address)}`,
      { method: "GET" }, env,
    );
    if (!response.ok) return json({ error: "Provider status lookup failed before deposit submission", upstreamStatus: response.status }, 502);
    providerBefore = await response.json() as ProviderStatusResponse;
  } catch {
    return json({ error: "Unable to retrieve the provider quote before deposit verification" }, 502);
  }

  const quote = providerBefore.quoteResponse;
  if (providerBefore.correlationId !== payment.quote_id) {
    return json({
      error: "Provider status does not match the committed Pelargo quote",
      code: "PROVIDER_QUOTE_CORRELATION_MISMATCH",
    }, 409);
  }
  const originAsset = quote?.quoteRequest?.originAsset;
  const amountIn = quote?.quote?.amountIn;
  const amountOut = quote?.quote?.amountOut;
  const providerDepositAddress = quote?.quote?.depositAddress;
  const sourceAssetMatch = typeof originAsset === "string"
    ? /^nep141:base-(0x[a-fA-F0-9]{40})\.tp-omft\.testnet$/i.exec(originAsset)
    : null;
  if (!sourceAssetMatch || typeof amountIn !== "string" || !/^[1-9]\d*$/.test(amountIn) ||
      amountOut !== payment.amount_atomic ||
      quote?.quoteRequest?.destinationAsset !== payment.destination_asset ||
      quote?.quoteRequest?.recipient !== payment.recipient ||
      providerDepositAddress !== payment.deposit_address) {
    return json({
      error: "Provider quote does not match the expected Base Sepolia source asset, amount, destination amount and deposit address",
      code: "PROVIDER_QUOTE_DETAILS_MISMATCH",
    }, 409);
  }
  if (typeof providerBefore.status !== "string" || !statuses.includes(providerBefore.status as ProviderStatus)) {
    return json({ error: "Provider returned an unrecognized status" }, 502);
  }
  if (providerBefore.status === "SUCCESS") {
    return json({
      error: "Provider already reports success; do not resubmit the source transaction. Destination reconciliation is required.",
      code: "PROVIDER_ALREADY_SUCCESS",
      providerStatus: providerBefore.status,
      nearTxHashes: providerBefore.swapDetails?.nearTxHashes ?? [],
      destinationChainTxHashes: providerBefore.swapDetails?.destinationChainTxHashes ?? [],
    }, 409);
  }
  if (!["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING"].includes(providerBefore.status)) {
    return json({
      error: "Provider reports a terminal non-success state; source deposit submission is not permitted",
      code: "PROVIDER_TERMINAL_STATUS",
      providerStatus: providerBefore.status,
    }, 409);
  }

  const evidence = await verifyBaseSepoliaErc20Deposit(env, {
    tokenContract: sourceAssetMatch[1],
    transactionHash,
    depositAddress: payment.deposit_address,
    amountAtomic: String(amountIn),
  }).catch((error) => {
    console.error("[pelargo] origin_deposit_verification_failed", {
      orderId, message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  });
  if (!evidence) {
    return json({
      error: "Base Sepolia transaction does not prove the exact quoted USDC deposit to this quote address",
      code: "ORIGIN_DEPOSIT_NOT_VERIFIED",
    }, 422);
  }

  const alreadyKnown = Array.isArray(providerBefore.swapDetails?.originChainTxHashes) &&
    providerBefore.swapDetails.originChainTxHashes.some((entry) =>
      entry !== null && typeof entry === "object" && entry.hash === transactionHash
    );
  let submitted: ProviderStatusResponse = providerBefore;
  if (!alreadyKnown) {
    try {
      const response = await intentsRequest("deposit/submit", {
        method: "POST",
        body: JSON.stringify({
          txHash: transactionHash,
          depositAddress: payment.deposit_address,
        }),
      }, env);
      if (!response.ok) {
        return json({
          error: "The source deposit was verified on Base, but the provider did not accept its transaction notification",
          code: "PROVIDER_DEPOSIT_SUBMISSION_FAILED",
          upstreamStatus: response.status,
        }, 502);
      }
    } catch {
      return json({
        error: "The source deposit was verified on Base, but the provider notification could not be completed",
        code: "PROVIDER_DEPOSIT_SUBMISSION_UNAVAILABLE",
      }, 502);
    }
  }

  // The deposit/submit endpoint is documented as a notification endpoint;
  // its response body is not specified. Confirm the provider's persisted state
  // with the documented status endpoint rather than assuming a response schema.
  let confirmedStatus: ProviderStatus | "SUBMITTED_UNCONFIRMED" = "SUBMITTED_UNCONFIRMED";
  if (alreadyKnown) {
    confirmedStatus = providerBefore.status as ProviderStatus;
  } else {
    try {
      const statusResponse = await intentsRequest(
        `status?depositAddress=${encodeURIComponent(payment.deposit_address)}`,
        { method: "GET" }, env,
      );
      if (statusResponse.ok) {
        const refreshed = await statusResponse.json() as ProviderStatusResponse;
        if (refreshed.correlationId === payment.quote_id &&
            typeof refreshed.status === "string" && statuses.includes(refreshed.status as ProviderStatus)) {
          confirmedStatus = refreshed.status as ProviderStatus;
          submitted = refreshed;
        }
      }
    } catch {
      // The provider notification was accepted; a later status poll can confirm it.
    }
  }

  const verifiedAt = new Date().toISOString();
  const saved = await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_origin_deposit_evidence
      (order_id, origin_chain, token_contract, transaction_hash, deposit_address,
       amount_atomic, block_number, block_hash, confirmations, verification_source,
       provider_submit_status, verified_at, submitted_at)
     VALUES (?, 'BASE_SEPOLIA', ?, ?, ?, ?, ?, ?, ?, 'chain_rpc', ?, ?, ?)`
  ).bind(
    payment.id, evidence.tokenContract, evidence.transactionHash, evidence.depositAddress,
    evidence.amountAtomic, evidence.blockNumber, evidence.blockHash, evidence.confirmations, confirmedStatus,
    verifiedAt, verifiedAt,
  ).run();
  const stored = await env.DB.prepare(
    "SELECT transaction_hash, token_contract, deposit_address, amount_atomic, block_number, block_hash FROM payment_origin_deposit_evidence WHERE order_id = ?"
  ).bind(payment.id).first<{
    transaction_hash: string; token_contract: string; deposit_address: string;
    amount_atomic: string; block_number: string; block_hash: string;
  }>();
  if (!stored || stored.transaction_hash !== evidence.transactionHash ||
      stored.token_contract !== evidence.tokenContract ||
      stored.deposit_address !== evidence.depositAddress ||
      stored.amount_atomic !== evidence.amountAtomic ||
      stored.block_number !== evidence.blockNumber || stored.block_hash !== evidence.blockHash) {
    return json({ error: "Verified source deposit conflicts with existing immutable order evidence; operator reconciliation is required" }, 409);
  }

  return json({
    orderId,
    originDeposit: "verified",
    providerNotification: alreadyKnown ? "already_known" : "accepted",
    providerStatus: confirmedStatus,
    sourceTransactionHash: transactionHash,
    originChainTxHashes: submitted.swapDetails?.originChainTxHashes ?? [],
    nearTxHashes: submitted.swapDetails?.nearTxHashes ?? [],
    destinationChainTxHashes: submitted.swapDetails?.destinationChainTxHashes ?? [],
  });
}
