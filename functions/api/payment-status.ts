import { Env, intentsRequest, json } from "../_lib/intents";
import { sha256Hex } from "../_lib/database";
import { PaymentStatus, transitionPayment, PaymentTransitionError } from "../_lib/payment-lifecycle";
import { verifyNearNep141Settlement } from "../_lib/near-settlement-verifier";

type ProviderStatus =
  | "PENDING_DEPOSIT"
  | "KNOWN_DEPOSIT_TX"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

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
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.DB) return json({ error: "Checkout storage is not configured" }, 503);

  const suppliedKey = request.headers.get("x-pelargo-merchant-key") ?? "";
  if (!suppliedKey || suppliedKey.length > 512) return json({ error: "Merchant authentication failed" }, 401);

  const keyHash = await sha256Hex(suppliedKey);
  const merchant = await env.DB.prepare(
    "SELECT id FROM merchants WHERE api_key_hash = ? AND active = 1"
  ).bind(keyHash).first<{ id: string }>();
  if (!merchant) return json({ error: "Merchant authentication failed" }, 401);

  const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
  if (!orderId || orderId.length > 256) return json({ error: "A valid orderId query parameter is required" }, 400);

  const payment = await env.DB.prepare(
    `SELECT o.id, o.external_order_id, o.status AS order_status,
            o.destination_network, o.destination_asset, o.recipient, o.amount_atomic,
            p.status, p.deposit_address, p.deposit_memo, p.provider_status
       FROM checkout_orders o
       JOIN payment_lifecycle p ON p.order_id = o.id
      WHERE o.merchant_id = ? AND o.external_order_id = ?`
  ).bind(merchant.id, orderId).first<{
    id: string; external_order_id: string; order_status: string;
    destination_network: string; destination_asset: string; recipient: string; amount_atomic: string;
    status: PaymentStatus; deposit_address: string | null; deposit_memo: string | null; provider_status: string | null;
  }>();

  if (!payment) return json({ error: "Order not found" }, 404);
  if (!payment.deposit_address) {
    return json({ error: "No committed deposit address exists for this order", code: "DEPOSIT_NOT_CREATED" }, 409);
  }

  const params = new URLSearchParams({ depositAddress: payment.deposit_address });
  if (payment.deposit_memo) params.set("depositMemo", payment.deposit_memo);

  let provider: {
    status?: ProviderStatus;
    swapDetails?: { destinationChainTxHashes?: Array<{ hash?: string }> };
    updatedAt?: string;
  };
  try {
    const response = await intentsRequest(`status?${params.toString()}`, { method: "GET" }, env);
    if (!response.ok) return json({ error: "NEAR Intents status service rejected the lookup", upstreamStatus: response.status }, 502);
    provider = await response.json() as typeof provider;
  } catch {
    return json({ error: "Unable to retrieve payment status from NEAR Intents" }, 502);
  }

  const validStatuses: ProviderStatus[] = [
    "PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS",
    "INCOMPLETE_DEPOSIT", "REFUNDED", "FAILED",
  ];
  if (!provider.status || !validStatuses.includes(provider.status)) {
    return json({ error: "NEAR Intents returned an unrecognized payment status" }, 502);
  }

  const now = new Date().toISOString();
  const candidateHash = provider.swapDetails?.destinationChainTxHashes?.find((tx) => typeof tx.hash === "string" && tx.hash.length <= 256)?.hash ?? null;
  await env.DB.prepare(
    `UPDATE payment_lifecycle
        SET provider_status = ?, provider_updated_at = ?, destination_tx_candidate = COALESCE(?, destination_tx_candidate),
            last_polled_at = ?, updated_at = ?
      WHERE order_id = ?`
  ).bind(provider.status, provider.updatedAt ?? null, candidateHash, now, now, payment.id).run();

  // SUCCESS is only a provider assertion. Preserve it as evidence for a later
  // independent destination-chain verification; do not mark the order settled.
  if (provider.status === "SUCCESS") {
    if (payment.status === "settled") {
      return json({ orderId, paymentStatus: "settled", providerStatus: provider.status, settlement: "verified" });
    }
    if (!candidateHash) {
      return json({
        orderId, paymentStatus: payment.status, providerStatus: provider.status,
        settlement: "provider_success_missing_destination_tx",
      });
    }

    if (payment.status === "processing" && payment.destination_network.trim().toUpperCase() === "NEAR") {
      try {
        const evidence = await verifyNearNep141Settlement(env, {
          destinationNetwork: payment.destination_network,
          destinationAsset: payment.destination_asset,
          recipient: payment.recipient,
          amountAtomic: payment.amount_atomic,
        }, candidateHash);

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
            ).bind(verifiedAt, payment.id, candidateHash),
          ]);
          if (!results[0]?.success || !results[1]?.success || (results[1]?.meta?.changes ?? 0) !== 1) {
            return json({ error: "Verified transfer could not be committed to the payment ledger; reconciliation is required" }, 502);
          }
          return json({
            orderId, paymentStatus: "settled", providerStatus: provider.status,
            settlement: "verified", destinationTransactionHash: candidateHash,
            verifiedBlockHeight: evidence.blockNumber,
          });
        }
      } catch (error) {
        console.error("[pelargo] near_settlement_verification_failed", {
          orderId, message: error instanceof Error ? error.message : "unknown",
        });
        return json({
          orderId, paymentStatus: payment.status, providerStatus: provider.status,
          settlement: "verification_unavailable_or_mismatched",
        }, 503);
      }
    }

    return json({
      orderId,
      paymentStatus: payment.status,
      providerStatus: provider.status,
      settlement: payment.destination_network.trim().toUpperCase() === "NEAR"
        ? "awaiting_destination_chain_verification"
        : "destination_network_verifier_not_supported",
    });
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
      return json({ error: "Payment changed during status polling; retry the lookup" }, 409);
    }
  }

  return json({
    orderId,
    paymentStatus: transition?.from.includes(payment.status) ? transition.to : payment.status,
    providerStatus: provider.status,
    settlement: "not_settled",
  });
}
