import { Env, json } from "../_lib/intents";
import { authenticateMerchantSession, sameOriginMutation } from "../_lib/merchant-auth";
import { sha256Hex } from "../_lib/database";

function createApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "plg_live_" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOriginMutation(request)) return json({ error: "Cross-origin request rejected" }, 403);
  if (!env.DB) return json({ error: "Merchant storage is not configured" }, 503);

  const merchant = await authenticateMerchantSession(request, env);
  if (!merchant) return json({ error: "Merchant authentication required" }, 401);

  const apiKey = createApiKey();
  const result = await env.DB.prepare(
    "UPDATE merchants SET api_key_hash = ? WHERE id = ? AND active = 1"
  ).bind(await sha256Hex(apiKey), merchant.id).run();

  if (!result.meta?.changes) return json({ error: "Merchant account is inactive or unavailable" }, 403);

  return new Response(JSON.stringify({
    apiKey,
    warning: "This key is shown once. Store it in your server-side secret manager. Rotating it immediately invalidates the previous key.",
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
