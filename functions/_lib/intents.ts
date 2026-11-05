export interface Env {
  ONECLICK_JWT?: string;
  ORDER_SESSION_SECRET?: string;
  DB?: import('./database').D1Database;
  MERCHANT_PROVISIONING_SECRET?: string;
  ALLOW_MAINNET_DEPOSITS?: string;
  ALLOW_TESTNET_DEPOSITS?: string;
  INTENTS_API_BASE_URL?: string;
  NEAR_RPC_URL?: string;
  NEAR_TX_INDEXER_URL?: string;
  NEAR_TX_INDEXER_API_KEY?: string;
  /** Preview-only known transaction signer; canonical RPC still verifies the hash and execution. */
  NEAR_TX_SIGNER_ID?: string;
  /** Exact transaction hash to which NEAR_TX_SIGNER_ID applies. */
  NEAR_TX_HASH?: string;
  /** Exact external order ID allowed to use the configured recovery hash. */
  NEAR_TX_ORDER_ID?: string;
  NEARSCANNER_TX_API_URL?: string;
  NEARSCANNER_API_KEY?: string;
  BASE_SEPOLIA_RPC_URL?: string;
  /** Private Worker-to-verifier credential; never expose to browser clients. */
  RECONCILIATION_SECRET?: string;
}

const MAINNET_API_BASE = "https://1click.chaindefuser.com";
const TESTNET_API_BASE = "https://www.usetidepool.tech";

export type IntentsNetwork = "mainnet" | "testnet";

/** Restrict provider selection to official 1Click or the community Tidepool sandbox. */
export function intentsProvider(env: Env): { baseUrl: string; network: IntentsNetwork } {
  const configured = env.INTENTS_API_BASE_URL || MAINNET_API_BASE;
  let parsed: URL;
  try { parsed = new URL(configured); }
  catch { throw new Error("INTENTS_API_BASE_URL must be a valid HTTPS origin"); }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("INTENTS_API_BASE_URL must be an HTTPS origin without a path, query or fragment");
  }
  if (parsed.origin === MAINNET_API_BASE) return { baseUrl: parsed.origin, network: "mainnet" };
  if (parsed.origin === TESTNET_API_BASE) return { baseUrl: parsed.origin, network: "testnet" };
  throw new Error("Unsupported NEAR Intents provider origin");
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Accept, Authorization",
    },
  });
}

export async function intentsRequest(
  path: string,
  init: RequestInit = {},
  env: Env,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  const provider = intentsProvider(env);
  // Never forward a mainnet partner JWT to the testnet sandbox.
  if (provider.network === "mainnet" && env.ONECLICK_JWT) {
    headers.set("authorization", `Bearer ${env.ONECLICK_JWT}`);
  }

  // The upstream API may redirect. Both possible origins are allowlisted.
  return fetch(`${provider.baseUrl}/v0/${path}`, {
    ...init,
    headers,
    redirect: "follow",
  });
}

export async function forwardJson(response: Response): Promise<Response> {
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Accept",
    },
  });
}
