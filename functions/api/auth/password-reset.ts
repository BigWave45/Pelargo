import { Env, json } from "../../_lib/intents";
import { sha256Hex } from "../../_lib/database";
import { hashPassword } from "../../_lib/merchant-auth";

const PROVIDER = "https://www.usetidepool.tech";
const PREVIEW_HOST = "reliability-background-recon.pelargo.pages.dev";

function enabled(request: Request, env: Env): boolean {
  try {
    const url = new URL(request.url);
    return env.INTENTS_API_BASE_URL === PROVIDER
      && env.ALLOW_TESTNET_DEPOSITS === "true"
      && url.protocol === "https:"
      && url.hostname === PREVIEW_HOST;
  } catch {
    return false;
  }
}

function sameOrigin(request: Request): boolean {
  try {
    return request.headers.get("origin") === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(request)) return json({ error: "Cross-origin request rejected" }, 403);
  if (!enabled(request, env)) return json({ error: "Preview-only password recovery is disabled" }, 404);
  if (!env.DB) return json({ error: "Password recovery unavailable" }, 503);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 3000) return json({ error: "Request body too large" }, 413);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "This reset link is invalid or has expired. Request a new one." }, 400);
  if (password.length < 12 || password.length > 128) {
    return json({ error: "Password must be between 12 and 128 characters." }, 400);
  }

    let passwordHash: string;
  const pepper = env.ORDER_SESSION_SECRET ?? "";
  try {
    passwordHash = await hashPassword(password, pepper);
  } catch {
    console.warn("[preview-password-reset] password pepper diagnostic", {
      present: pepper.length > 0,
      characterCount: pepper.length,
      meetsMinimum: pepper.length >= 32,
    });
    return json({ error: "Password recovery is not configured securely. Contact the operator." }, 503);
  }

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const usedMarker = `${now}:${crypto.randomUUID()}`;

  // D1 batch is transactional. The token is consumed conditionally first; all later
  // statements are scoped to that unique consumption marker, preventing replay.
  const results = await env.DB.batch([
    env.DB.prepare(
      "UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?"
    ).bind(usedMarker, tokenHash, now),
    env.DB.prepare(
      `UPDATE merchant_accounts
          SET password_hash = ?
        WHERE merchant_id = (
          SELECT merchant_id FROM password_reset_tokens
           WHERE token_hash = ? AND used_at = ?
        )`
    ).bind(passwordHash, tokenHash, usedMarker),
    env.DB.prepare(
      `DELETE FROM merchant_sessions
        WHERE merchant_id = (
          SELECT merchant_id FROM password_reset_tokens
           WHERE token_hash = ? AND used_at = ?
        )`
    ).bind(tokenHash, usedMarker),
    env.DB.prepare(
      `DELETE FROM password_reset_tokens
        WHERE merchant_id = (
          SELECT merchant_id FROM password_reset_tokens
           WHERE token_hash = ? AND used_at = ?
        ) AND token_hash <> ?`
    ).bind(tokenHash, usedMarker, tokenHash),
  ]);

  const consumed = (results[0] as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0;
  const updated = (results[1] as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0;
  if (consumed !== 1 || updated !== 1) {
    return json({ error: "This reset link is invalid, expired, or has already been used. Request a new one." }, 400);
  }

  return json({ message: "Password updated. All previous sessions have been signed out. You can now sign in." });
}
