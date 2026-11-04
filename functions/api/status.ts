import { Env, forwardJson, intentsRequest, json } from "../_lib/intents";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  if (context.request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const incoming = new URL(context.request.url);
  const depositAddress = incoming.searchParams.get("depositAddress");
  const depositMemo = incoming.searchParams.get("depositMemo");

  if (!depositAddress || depositAddress.length > 256) {
    return json({ error: "A valid depositAddress query parameter is required" }, 400);
  }

  const params = new URLSearchParams({ depositAddress });
  if (depositMemo) {
    if (depositMemo.length > 256) return json({ error: "depositMemo is too long" }, 400);
    params.set("depositMemo", depositMemo);
  }

  try {
    const upstream = await intentsRequest(`status?${params.toString()}`, {
      method: "GET",
    }, context.env);
    return await forwardJson(upstream);
  } catch {
    return json({ error: "Unable to reach the NEAR Intents status service" }, 502);
  }
}
