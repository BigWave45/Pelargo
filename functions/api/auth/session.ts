import { Env, json } from "../../_lib/intents";
import { authenticateMerchantSession } from "../../_lib/merchant-auth";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const merchant = await authenticateMerchantSession(context.request, context.env);
  if (!merchant) return json({ error: "Not signed in" }, 401);
  return json({ merchant });
}
