import { Env, forwardJson, intentsRequest, json } from "../_lib/intents";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const upstream = await intentsRequest("tokens", { method: "GET" }, context.env);
    return await forwardJson(upstream);
  } catch {
    return json({ error: "Unable to reach the NEAR Intents token service" }, 502);
  }
}
