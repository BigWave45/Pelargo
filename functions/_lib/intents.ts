export interface Env {
  ONECLICK_JWT?: string;
  PELARGO_MERCHANT_API_KEY?: string;
  ORDER_SESSION_SECRET?: string;
  DB?: import('./database').D1Database;
  MERCHANT_PROVISIONING_SECRET?: string;
  ALLOW_MAINNET_DEPOSITS?: string;
}

const API_BASE = "https://1click.chaindefuser.com";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Accept",
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
  if (env.ONECLICK_JWT) {
    headers.set("authorization", `Bearer ${env.ONECLICK_JWT}`);
  }

  // The upstream API may redirect. Follow redirects for this fixed,
  // trusted host instead of turning a redirect into a fetch exception.
  return fetch(`${API_BASE}/v0/${path}`, {
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
