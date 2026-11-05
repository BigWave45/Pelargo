import { Env } from "../../_lib/intents";
import { clearSessionCookie, revokeMerchantSession, sameOriginMutation } from "../../_lib/merchant-auth";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!sameOriginMutation(context.request)) return new Response("Cross-origin request rejected", { status: 403 });
  await revokeMerchantSession(context.request, context.env);
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "set-cookie": clearSessionCookie(),
    },
  });
}
