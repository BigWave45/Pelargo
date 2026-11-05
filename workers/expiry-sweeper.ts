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

export default {
  async scheduled(
    _event: ScheduledEventLike,
    env: ExpiryWorkerEnv,
    ctx: WorkerExecutionContextLike,
  ): Promise<void> {
    ctx.waitUntil(
      expireAbandonedCheckouts(env.DB).then((expired) => {
        console.log("[pelargo] abandoned_checkouts_expired", { count: expired });
      }).catch((error) => {
        console.error("[pelargo] checkout_expiry_sweep_failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
        throw error;
      }),
    );
  },
};
