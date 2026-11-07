import { D1Database } from "./database";

export const PAYMENT_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending: ["quote_committed", "expired", "failed"],
  quote_committed: ["awaiting_deposit", "expired", "failed"],
  awaiting_deposit: ["deposit_detected", "expired", "failed", "incomplete_deposit"],
  deposit_detected: ["processing", "failed", "incomplete_deposit"],
  // Settlement is intentionally excluded: only the dedicated verifier may settle.
  processing: ["failed", "incomplete_deposit", "refunded"],
  settled: ["refunded"],
  failed: [],
  expired: [],
  refunded: [],
  incomplete_deposit: ["refunded"],
};

export type PaymentStatus = keyof typeof PAYMENT_TRANSITIONS;

export class PaymentTransitionError extends Error {
  constructor(message: string, readonly code: "invalid_transition" | "not_found" | "conflict") {
    super(message);
    this.name = "PaymentTransitionError";
  }
}

/**
 * Applies a compare-and-set status transition. The database triggers written
 * by migration 0002 append the corresponding event in the same SQLite write.
 * This helper records lifecycle state only; it does not verify settlement.
 */
export async function transitionPayment(
  db: D1Database,
  input: { orderId: string; expectedStatus: PaymentStatus; nextStatus: PaymentStatus },
): Promise<void> {
  const allowed = PAYMENT_TRANSITIONS[input.expectedStatus] ?? [];
  if (!allowed.includes(input.nextStatus)) {
    throw new PaymentTransitionError(
      `Transition ${input.expectedStatus} -> ${input.nextStatus} is not allowed`,
      "invalid_transition",
    );
  }

  const result = await db.prepare(
    `UPDATE payment_lifecycle
       SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE order_id = ? AND status = ?`
  ).bind(input.nextStatus, input.orderId, input.expectedStatus).run();

  if ((result.meta?.changes ?? 0) !== 1) {
    const current = await db.prepare(
      "SELECT status FROM payment_lifecycle WHERE order_id = ?"
    ).bind(input.orderId).first<{ status: string }>();

    if (!current) throw new PaymentTransitionError("Payment lifecycle not found", "not_found");
    throw new PaymentTransitionError("Payment status changed; reload before retrying", "conflict");
  }
}
