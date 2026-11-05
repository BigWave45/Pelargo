import { Env, json } from "../_lib/intents";
import { sha256Hex } from "../_lib/database";

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, X-Pelargo-Provisioning-Key",
  }});
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.DB || !env.MERCHANT_PROVISIONING_SECRET) return json({ error: "Merchant provisioning is not configured" }, 503);

  const supplied = request.headers.get("x-pelargo-provisioning-key") ?? "";
  if (!supplied || supplied !== env.MERCHANT_PROVISIONING_SECRET) return json({ error: "Provisioning authentication failed" }, 401);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 2000) return json({ error: "Request body too large" }, 413);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) {
    return json({ error: "name is required and must be at most 120 characters" }, 400);
  }
  const id = typeof body.id === "string" && /^[a-zA-Z0-9_-]{3,64}$/.test(body.id)
    ? body.id : crypto.randomUUID();
  const apiKey = "plg_live_" + randomKey();
  const keyHash = await sha256Hex(apiKey);
  try {
    await env.DB.prepare(
      "INSERT INTO merchants (id, name, api_key_hash, active) VALUES (?, ?, ?, 1)"
    ).bind(id, body.name.trim(), keyHash).run();
  } catch {
    return json({ error: "Merchant ID already exists or storage rejected provisioning" }, 409);
  }
  return json({
    merchant: { id, name: body.name.trim() },
    apiKey,
    warning: "Store this key securely. It is shown once and must only be used by your server.",
  }, 201);
}
