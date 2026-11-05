import { Env, json } from "../../_lib/intents";
import { createMerchantSession, hashPassword, sameOriginMutation } from "../../_lib/merchant-auth";
import { sha256Hex } from "../../_lib/database";

function randomHex(bytes = 32): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOriginMutation(request)) return json({ error: "Cross-origin request rejected" }, 403);
  if (!env.DB) return json({ error: "Merchant registration is temporarily unavailable" }, 503);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 4000) return json({ error: "Request body too large" }, 413);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || name.length > 120) return json({ error: "Business name must be between 1 and 120 characters" }, 400);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
  if (password.length < 12 || password.length > 128) return json({ error: "Password must be between 12 and 128 characters" }, 400);

  const merchantId = crypto.randomUUID();
  const internalApiKey = `plg_live_${randomHex()}`;
  const passwordHash = await hashPassword(password);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO merchants (id, name, api_key_hash, active) VALUES (?, ?, ?, 1)")
        .bind(merchantId, name, await sha256Hex(internalApiKey)),
      env.DB.prepare("INSERT INTO merchant_accounts (merchant_id, email, password_hash) VALUES (?, ?, ?)")
        .bind(merchantId, email, passwordHash),
    ]);
  } catch {
    return json({ error: "An account with this email may already exist" }, 409);
  }

  const session = await createMerchantSession(merchantId, env);
  return new Response(JSON.stringify({ merchant: { id: merchantId, name, email } }), {
    status: 201,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": session.cookie,
    },
  });
}
