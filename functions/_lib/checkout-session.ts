import type { Env } from "./intents";

export type CheckoutSessionClaims = {
  v: 1;
  merchantId: string;
  merchantName: string;
  orderId: string;
  amount: string;
  amountAtomic: string;
  destinationAsset: string;
  destinationSymbol: string;
  destinationNetwork: string;
  recipient: string;
  jti: string;
  iat: number;
  exp: number;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  // Allocate an ArrayBuffer-backed view explicitly for Web Crypto's BufferSource type.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function signingKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

export async function signCheckoutSession(
  claims: CheckoutSessionClaims,
  env: Env,
): Promise<string> {
  if (!env.ORDER_SESSION_SECRET || env.ORDER_SESSION_SECRET.length < 32) {
    throw new Error("ORDER_SESSION_SECRET must contain at least 32 characters");
  }
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await signingKey(env.ORDER_SESSION_SECRET, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded),
  ));
  return `${encoded}.${toBase64Url(signature)}`;
}

export async function verifyCheckoutSession(
  token: string,
  env: Env,
): Promise<CheckoutSessionClaims | null> {
  if (!env.ORDER_SESSION_SECRET || env.ORDER_SESSION_SECRET.length < 32) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some((part) => !part)) return null;

  try {
    const key = await signingKey(env.ORDER_SESSION_SECRET, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(parts[1]),
      new TextEncoder().encode(parts[0]),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0]))) as CheckoutSessionClaims;
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.v !== 1 ||
      typeof claims.merchantId !== "string" ||
      typeof claims.orderId !== "string" ||
      typeof claims.amount !== "string" ||
      typeof claims.amountAtomic !== "string" ||
      !/^\d+$/.test(claims.amountAtomic) ||
      BigInt(claims.amountAtomic) <= 0n ||
      typeof claims.destinationAsset !== "string" ||
      typeof claims.recipient !== "string" ||
      typeof claims.exp !== "number" ||
      claims.exp <= now ||
      claims.iat > now + 60 ||
      claims.exp - claims.iat > 1800
    ) return null;
    return claims;
  } catch {
    return null;
  }
}
