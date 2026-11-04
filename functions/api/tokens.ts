import { Env, forwardJson, intentsRequest, json } from "../_lib/intents";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const upstream = await intentsRequest("tokens", { method: "GET" }, context.env);
    return await forwardJson(upstream);
  } catch (error) {
    const diagnostic = {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    };

    // Keep the underlying failure in Cloudflare Function logs, not in the
    // public response. Never log request headers, JWTs or payment data.
    console.error("[pelargo] intents_tokens_fetch_failed", diagnostic);

    return json(
      {
        error: "Unable to reach the NEAR Intents token service",
        code: "UPSTREAM_FETCH_FAILED",
        requestId: context.request.headers.get("cf-ray"),
      },
      502,
    );
  }
}
