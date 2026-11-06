import { Env, json } from "../../_lib/intents";
import { sha256Hex } from "../../_lib/database";
import { consumeAuthAttempt } from "../../_lib/auth-rate-limit";

const PROVIDER = "https://www.usetidepool.tech";
const PREVIEW_HOST = "reliability-background-recon.pelargo.pages.dev";
const MESSAGE = "If an account matches that email, a reset link has been generated. Check the Cloudflare Pages Preview logs for the one-time link.";

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
  if (length > 2000) return json({ error: "Request body too large" }, 413);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254) return json({ message: MESSAGE });
  if (!(await consumeAuthAttempt(request, env, "password-reset", email, 3, 900))) {
    return json({ error: "Too many recovery attempts. Try again in 15 minutes." }, 429);
  }

  const account = await env.DB.prepare(
    "SELECT merchant_id FROM merchant_accounts WHERE email = ? COLLATE NOCASE"
  ).bind(email).first<{ merchant_id: string }>();

  if (account) {
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      byte => byte.toString(16).padStart(2, "0"),
    ).join("");
    const tokenHash = await sha256Hex(token);
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    await env.DB.batch([
      env.DB.prepare("DELETE FROM password_reset_tokens WHERE merchant_id = ? AND used_at IS NULL")
        .bind(account.merchant_id),
      env.DB.prepare(
        "INSERT INTO password_reset_tokens (token_hash, merchant_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
      ).bind(tokenHash, account.merchant_id, createdAt, expiresAt),
    ]);

    const resetUrl = new URL("/", request.url);
    resetUrl.searchParams.set("password-reset", token);
    // This is a bearer link. Keep Pages Preview logs access restricted and never copy it into public issue/PR text.
    console.warn("[preview-password-reset] one-time link; expires in 30 minutes", resetUrl.toString());
  }

  return json({ message: MESSAGE });
}
