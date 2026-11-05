import { Env } from "./intents";
import { sha256Hex } from "./database";

export async function consumeAuthAttempt(
  request: Request,
  env: Env,
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!env.DB) return false;
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const keyHash = await sha256Hex(`${scope}:${identity.toLowerCase()}: ${ip}`);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  await env.DB.prepare(
    `INSERT INTO auth_rate_limits (key_hash, window_started_at, attempts)
     VALUES (?, ?, 1)
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts = CASE WHEN auth_rate_limits.window_started_at <= ? THEN 1 ELSE auth_rate_limits.attempts + 1 END,
       window_started_at = CASE WHEN auth_rate_limits.window_started_at <= ? THEN excluded.window_started_at ELSE auth_rate_limits.window_started_at END`
  ).bind(keyHash, now, windowStart, windowStart).run();
  const row = await env.DB.prepare("SELECT attempts FROM auth_rate_limits WHERE key_hash = ?")
    .bind(keyHash).first<{ attempts: number }>();
  return (row?.attempts ?? limit + 1) <= limit;
}
