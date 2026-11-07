import { Env, json } from "../../_lib/intents";
import { createMerchantSession, sameOriginMutation, verifyPassword } from "../../_lib/merchant-auth";
import { consumeAuthAttempt } from "../../_lib/auth-rate-limit";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOriginMutation(request)) return json({ error: "Cross-origin request rejected" }, 403);
  if (!env.DB) return json({ error: "Merchant authentication is unavailable" }, 503);

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (email.length > 254 || password.length > 128 || !email || !password) {
    return json({ error: "Email or password is incorrect" }, 401);
  }
  if (!(await consumeAuthAttempt(request, env, "login", email, 10, 900))) return json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, 429);

  const account = await env.DB.prepare(
    `SELECT a.merchant_id, a.password_hash
       FROM merchant_accounts a JOIN merchants m ON m.id = a.merchant_id
      WHERE a.email = ? COLLATE NOCASE AND m.active = 1`
  ).bind(email).first<{ merchant_id: string; password_hash: string }>();
  if (!account || !(await verifyPassword(password, account.password_hash, env.ORDER_SESSION_SECRET ?? ""))) {
    return json({ error: "Email or password is incorrect" }, 401);
  }

  const session = await createMerchantSession(account.merchant_id, env);
  const merchant = await env.DB.prepare(
    "SELECT m.id, m.name, a.email FROM merchants m JOIN merchant_accounts a ON a.merchant_id = m.id WHERE m.id = ?"
  ).bind(account.merchant_id).first<{ id: string; name: string; email: string }>();
  return new Response(JSON.stringify({ merchant }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": session.cookie,
    },
  });
}
