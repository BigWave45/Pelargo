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
  /** Bounded testnet signer-recovery scan width in blocks (8-600; default 120). */
  NEAR_TX_RECOVERY_WINDOW_BLOCKS?: string;
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
export type IntentsProviderId = "near-1click" | "tidepool";

/** Adapter contract for explicitly registered NEAR Intents API providers. */
export interface IntentsProviderAdapter {
  id: IntentsProviderId;
  displayName: string;
  baseUrl: string;
  network: IntentsNetwork;
  apiPrefix: "/v0";
  applyAuthentication(headers: Headers, env: Env): void;
}

const PROVIDER_ADAPTERS: readonly IntentsProviderAdapter[] = [
  {
    id: "near-1click",
    displayName: "NEAR 1Click",
    baseUrl: MAINNET_API_BASE,
    network: "mainnet",
    apiPrefix: "/v0",
    applyAuthentication(headers, env) {
      if (env.ONECLICK_JWT) headers.set("authorization", `Bearer ${env.ONECLICK_JWT}`);
    },
  },
  {
    id: "tidepool",
    displayName: "Tidepool",
    baseUrl: TESTNET_API_BASE,
    network: "testnet",
    apiPrefix: "/v0",
    // Never forward the official 1Click partner JWT to the Tidepool sandbox.
    applyAuthentication() {},
  },
];

/** Resolve one explicitly configured adapter for this environment. */
export function intentsProviderAdapter(env: Env): IntentsProviderAdapter {
  const configured = env.INTENTS_API_BASE_URL || MAINNET_API_BASE;
  let parsed: URL;
  try { parsed = new URL(configured); }
  catch { throw new Error("INTENTS_API_BASE_URL must be a valid HTTPS origin"); }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("INTENTS_API_BASE_URL must be an HTTPS origin without a path, query or fragment");
  }
  const adapter = PROVIDER_ADAPTERS.find((candidate) => candidate.baseUrl === parsed.origin);
  if (!adapter) throw new Error("Unsupported NEAR Intents provider origin");
  return adapter;
}

/** Backwards-compatible network metadata for existing quote/deposit gates. */
export function intentsProvider(env: Env): { baseUrl: string; network: IntentsNetwork } {
  const adapter = intentsProviderAdapter(env);
  return { baseUrl: adapter.baseUrl, network: adapter.network };
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
  const provider = intentsProviderAdapter(env);
  provider.applyAuthentication(headers, env);

  // The upstream API may redirect. Only explicitly registered provider
  // origins are eligible for requests.
  return fetch(`${provider.baseUrl}${provider.apiPrefix}/${path}`, {
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
