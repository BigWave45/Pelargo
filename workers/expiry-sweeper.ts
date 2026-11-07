import type { D1Database } from "../functions/_lib/database";
import type { Env } from "../functions/_lib/intents";
import { onRequest as reconcilePaymentStatus } from "../functions/api/payment-status";

interface ScheduledEventLike {
  cron?: string;
  scheduledTime?: number;
}

interface WorkerExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ExpiryWorkerEnv extends Env {
  DB: D1Database;
  RECONCILIATION_SECRET?: string;
}

type DueJob = { order_id: string };
type OrderRow = { external_order_id: string; status: string };

const ELIGIBLE_STATES = [
  "quote_committed", "awaiting_deposit", "deposit_detected", "processing", "incomplete_deposit",
] as const;

/**
 * Expire only uncommitted orders whose active checkout session has elapsed.
 * Committed quotes and commit_attempted sessions are deliberately excluded.
 */
export async function expireAbandonedCheckouts(
  db: D1Database,
  now = new Date().toISOString(),
): Promise<number> {
  const result = await db.prepare(
    `UPDATE payment_lifecycle
        SET status = 'expired', updated_at = ?
      WHERE status = 'pending'
        AND order_id IN (
          SELECT o.id
            FROM checkout_orders o
            JOIN checkout_sessions s ON s.order_id = o.id
           WHERE o.status = 'pending'
             AND o.expires_at <= ?
             AND s.status = 'active'
             AND s.expires_at <= ?
        )`
  ).bind(now, now, now).run();
  return result.meta?.changes ?? 0;
}

/** Record ambiguous quote-commit outcomes without retrying provider execution. */
export async function recordUncertainQuoteCommits(
  db: D1Database,
  now = new Date(),
  staleAfterMs = 10 * 60_000,
): Promise<number> {
  const cutoff = new Date(now.getTime() - staleAfterMs).toISOString();
  const result = await db.prepare(
    `INSERT INTO payment_recovery_cases
       (id, order_id, merchant_id, session_jti, reason, status, created_at)
     SELECT lower(hex(randomblob(16))), o.id, o.merchant_id, s.jti,
            'upstream_commit_outcome_unknown', 'open', ?
       FROM checkout_sessions s
       JOIN checkout_orders o ON o.id = s.order_id
       JOIN payment_lifecycle p ON p.order_id = o.id
      WHERE s.status = 'commit_attempted'
        AND s.consumed_at IS NOT NULL
        AND s.consumed_at <= ?
        AND o.status = 'pending'
        AND p.status = 'pending'
        AND p.quote_id IS NULL
        AND p.deposit_address IS NULL
     ON CONFLICT(order_id) DO NOTHING`
  ).bind(now.toISOString(), cutoff).run();
  return result.meta?.changes ?? 0;
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(60 * 60_000, 60_000 * (2 ** Math.min(Math.max(attemptCount - 1, 0), 6)));
}

async function claimNextJob(
  db: D1Database,
  now: string,
  leaseMs: number,
): Promise<{ orderId: string; leaseToken: string; attemptCount: number } | null> {
  // Another Worker can win the compare-and-set after this invocation selects
  // a due row. Retry selection a few times so contention on one row does not
  // make this invocation abandon other due jobs in the queue.
  for (let contentionAttempt = 0; contentionAttempt < 5; contentionAttempt++) {
    const due = await db.prepare(
      `SELECT j.order_id
         FROM payment_reconciliation_jobs j
         JOIN payment_lifecycle p ON p.order_id = j.order_id
        WHERE j.next_attempt_at <= ?
          AND (j.lease_until IS NULL OR j.lease_until <= ?)
          AND p.status IN ('quote_committed', 'awaiting_deposit', 'deposit_detected', 'processing', 'incomplete_deposit')
        ORDER BY j.next_attempt_at, j.created_at
        LIMIT 1`
    ).bind(now, now).first<DueJob>();
    if (!due) return null;

    const leaseToken = crypto.randomUUID();
    const leaseUntil = new Date(Date.parse(now) + leaseMs).toISOString();
    const claimed = await db.prepare(
      `UPDATE payment_reconciliation_jobs
          SET lease_token = ?, lease_until = ?, attempt_count = attempt_count + 1,
              last_attempt_at = ?, updated_at = ?
        WHERE order_id = ? AND next_attempt_at <= ?
          AND (lease_until IS NULL OR lease_until <= ?)`
    ).bind(leaseToken, leaseUntil, now, now, due.order_id, now, now).run();
    if ((claimed.meta?.changes ?? 0) !== 1) continue;

    const row = await db.prepare(
      "SELECT attempt_count FROM payment_reconciliation_jobs WHERE order_id = ? AND lease_token = ?"
    ).bind(due.order_id, leaseToken).first<{ attempt_count: number }>();
    if (!row) continue;
    return { orderId: due.order_id, leaseToken, attemptCount: row.attempt_count };
  }
  return null;
}

async function retryOrReleaseJob(
  db: D1Database,
  job: { orderId: string; leaseToken: string; attemptCount: number },
  now: Date,
  error: string,
  delayOverrideMs?: number,
): Promise<void> {
  const delay = delayOverrideMs ?? retryDelayMs(job.attemptCount);
  const nextAttempt = new Date(now.getTime() + delay).toISOString();
  await db.prepare(
    `UPDATE payment_reconciliation_jobs
        SET next_attempt_at = ?, lease_token = NULL, lease_until = NULL,
            last_error = ?, updated_at = ?
      WHERE order_id = ? AND lease_token = ?`
  ).bind(nextAttempt, error.slice(0, 500), now.toISOString(), job.orderId, job.leaseToken).run();
}

export async function reconcileDuePayments(
  env: ExpiryWorkerEnv,
  now = new Date(),
  batchSize = 3,
): Promise<{ claimed: number; settled: number; deferred: number }> {
  if (!env.RECONCILIATION_SECRET || env.RECONCILIATION_SECRET.length < 32) {
    throw new Error("RECONCILIATION_SECRET must be configured with at least 32 characters");
  }
  const stats = { claimed: 0, settled: 0, deferred: 0 };

  for (let index = 0; index < batchSize; index++) {
    const job = await claimNextJob(env.DB, now.toISOString(), 10 * 60_000);
    if (!job) break;
    stats.claimed++;

    try {
      const order = await env.DB.prepare(
        `SELECT o.external_order_id, p.status
           FROM checkout_orders o
           JOIN payment_lifecycle p ON p.order_id = o.id
          WHERE o.id = ?`
      ).bind(job.orderId).first<OrderRow>();
      if (!order || !ELIGIBLE_STATES.includes(order.status as typeof ELIGIBLE_STATES[number])) {
        await env.DB.prepare(
          "DELETE FROM payment_reconciliation_jobs WHERE order_id = ? AND lease_token = ?"
        ).bind(job.orderId, job.leaseToken).run();
        continue;
      }

      // Invoke the exact same authenticated status/verifier implementation used
      // by browser polling. No quote or provider execution endpoint is called.
      const internalRequest = new Request(
        `https://pelargo.internal/api/payment-status?internalOrderId=${encodeURIComponent(job.orderId)}`,
        { method: "GET", headers: { "x-pelargo-reconciliation-secret": env.RECONCILIATION_SECRET } },
      );
      const response = await reconcilePaymentStatus({
        request: internalRequest,
        env,
      });
      const body = await response.text();
      const statusResult = (() => {
        try {
          return JSON.parse(body) as {
            paymentStatus?: string;
            settlement?: string;
            code?: string;
            verificationDiagnostics?: Array<{ stage?: string }>;
          };
        } catch { return {}; }
      })();

      const latest = await env.DB.prepare(
        "SELECT status FROM payment_lifecycle WHERE order_id = ?"
      ).bind(job.orderId).first<{ status: string }>();
      if (!latest || ["settled", "failed", "expired", "refunded"].includes(latest.status)) {
        stats.settled += latest?.status === "settled" ? 1 : 0;
        await env.DB.prepare(
          "DELETE FROM payment_reconciliation_jobs WHERE order_id = ? AND lease_token = ?"
        ).bind(job.orderId, job.leaseToken).run();
        continue;
      }

      const detail = `HTTP ${response.status}; ${statusResult.code ?? statusResult.settlement ?? "status_unavailable"}`;
      // A resumable RPC scan makes bounded progress on each invocation.
      // Schedule it before the next five-minute cron tick; a full five-minute delay can miss the next tick by a small amount and defer progress for another cycle.
      const scanProgress = statusResult.verificationDiagnostics?.some((item) =>
        item.stage === "testnet_rpc_block_scan_started" ||
        item.stage === "testnet_rpc_block_scan_progress" ||
        item.stage === "signer_resolved_from_canonical_rpc_block_scan" ||
        item.stage === "signer_reused_from_persisted_rpc_scan"
      ) ?? false;
      await retryOrReleaseJob(env.DB, job, now, detail, scanProgress ? 4 * 60_000 : undefined);
      stats.deferred++;
      console.log("[pelargo] payment_reconciliation_deferred", {
        orderId: order.external_order_id,
        attempt: job.attemptCount,
        status: response.status,
        code: statusResult.code ?? statusResult.settlement ?? "unknown",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown reconciliation error";
      await retryOrReleaseJob(env.DB, job, now, detail);
      stats.deferred++;
      console.error("[pelargo] payment_reconciliation_attempt_failed", {
        orderId: job.orderId,
        attempt: job.attemptCount,
        message: detail.slice(0, 240),
      });
    }
  }
  return stats;
}

export default {
  async scheduled(
    _event: ScheduledEventLike,
    env: ExpiryWorkerEnv,
    ctx: WorkerExecutionContextLike,
  ): Promise<void> {
    ctx.waitUntil(Promise.all([
      expireAbandonedCheckouts(env.DB).then((expired) => {
        console.log("[pelargo] abandoned_checkouts_expired", { count: expired });
      }),
      recordUncertainQuoteCommits(env.DB).then((recorded) => {
        console.log("[pelargo] uncertain_quote_commits_recorded", { count: recorded });
      }),
      reconcileDuePayments(env).then((stats) => {
        console.log("[pelargo] payment_reconciliation_sweep_completed", stats);
      }),
    ]).catch((error) => {
      console.error("[pelargo] scheduled_reconciliation_sweep_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }));
  },
};
