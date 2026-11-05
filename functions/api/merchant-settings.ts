import { Env, json } from "../../_lib/intents";
import { authenticateMerchantSession, sameOriginMutation } from "../../_lib/merchant-auth";

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (!env.DB) return json({ error: "Merchant storage is unavailable" }, 503);
  const merchant = await authenticateMerchantSession(request, env);
  if (!merchant) return json({ error: "Sign in required" }, 401);

  if (request.method === "GET") {
    const settings = await env.DB.prepare(
      "SELECT name, destination_asset AS destinationAsset, destination_symbol AS destinationSymbol, destination_network AS destinationNetwork, recipient, destination_decimals AS destinationDecimals FROM merchants WHERE id = ?"
    ).bind(merchant.id).first<{
      name: string; destinationAsset: string | null; destinationSymbol: string | null;
      destinationNetwork: string | null; recipient: string | null; destinationDecimals: number;
    }>();
    return json({ settings });
  }

  if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
  if (!sameOriginMutation(request)) return json({ error: "Cross-origin request rejected" }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const asset = typeof body.destinationAsset === "string" ? body.destinationAsset.trim() : "";
  const symbol = typeof body.destinationSymbol === "string" ? body.destinationSymbol.trim() : "";
  const network = typeof body.destinationNetwork === "string" ? body.destinationNetwork.trim() : "";
  const recipient = typeof body.recipient === "string" ? body.recipient.trim() : "";
  const decimals = Number(body.destinationDecimals);
  if (!name || name.length > 120 || !asset || asset.length > 256 ||
      !symbol || symbol.length > 32 || !network || network.length > 64 ||
      !recipient || recipient.length > 256 || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    return json({ error: "Provide a business name, supported destination asset, network and public recipient address" }, 400);
  }
  await env.DB.prepare(
    "UPDATE merchants SET name = ?, destination_asset = ?, destination_symbol = ?, destination_network = ?, recipient = ?, destination_decimals = ? WHERE id = ?"
  ).bind(name, asset, symbol, network, recipient, decimals, merchant.id).run();
  return json({ saved: true });
}
