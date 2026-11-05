import type { D1Database } from "../functions/_lib/database";

interface ScheduledEventLike {
  cron?: string;
  scheduledTime?: number;
}

interface WorkerExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

export interface ExpiryWorkerEnv {
  DB: D1Database;
}

/**
 * Expire only uncommitted orders whose active checkout session has elapsed.
 * Committed quotes and commit_attempted sessions are deliberately excluded:
 * either may already have a live provider deposit address or an uncertain
 * upstream commit outcome and must be reconciled instead of timed out here.
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

/**
 * Surface ambiguous upstream commit outcomes for operator reconciliation.
 * Never retry or expire these commits automatically: the provider may already
 * have created a live deposit address even when Pelargo lost the response.
 */
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
    ]).catch((error) => {
      console.error("[pelargo] scheduled_reconciliation_sweep_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }));
  },
};
