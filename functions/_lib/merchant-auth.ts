import type { Env } from "./intents";
import { sha256Hex } from "./database";

const SESSION_COOKIE = "__Host-pelargo_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_SCHEME = "pbkdf2-sha256-hmac";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).split("+").join("-").split("/").join("_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function derivePasswordHash(password: string, salt: Uint8Array, pepper: string): Promise<Uint8Array> {
  if (pepper.length < 32) throw new Error("Password pepper is not configured securely");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations: PASSWORD_ITERATIONS },
    key,
    256,
  ));
  const pepperKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", pepperKey, toArrayBuffer(derived)));
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, pepper);
  return `${PASSWORD_SCHEME}$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encoded: string, pepper: string): Promise<boolean> {
  const [scheme, iterationsText, saltText, expectedText] = encoded.split("$");
  const iterations = Number(iterationsText);
  if (scheme !== PASSWORD_SCHEME || iterations !== PASSWORD_ITERATIONS || !saltText || !expectedText) return false;
  try {
    const salt = fromBase64Url(saltText);
    const expected = fromBase64Url(expectedText);
    if (salt.length !== 16 || expected.length !== 32) return false;
    const actual = await derivePasswordHash(password, salt, pepper);
    let difference = 0;
    for (let i = 0; i < actual.length; i += 1) difference |= actual[i] ^ expected[i];
    return difference === 0;
  } catch {
    return false;
  }
}

export function sessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

function cookieValue(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return rest.join("=");
  }
  return "";
}

export function sameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}

export async function createMerchantSession(
  merchantId: string,
  env: Env,
): Promise<{ token: string; cookie: string }> {
  if (!env.DB) throw new Error("Merchant storage is not configured");
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await env.DB.prepare(
    "INSERT INTO merchant_sessions (token_hash, merchant_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(await sha256Hex(token), merchantId, now.toISOString(), expires.toISOString()).run();
  return { token, cookie: sessionCookie(token) };
}

export async function authenticateMerchantSession(
  request: Request,
  env: Env,
): Promise<{ id: string; name: string; email: string } | null> {
  if (!env.DB) return null;
  const token = cookieValue(request);
  if (!token || token.length > 256) return null;
  const row = await env.DB.prepare(
    `SELECT m.id, m.name, a.email
       FROM merchant_sessions s
       JOIN merchants m ON m.id = s.merchant_id
       JOIN merchant_accounts a ON a.merchant_id = m.id
      WHERE s.token_hash = ? AND s.expires_at > ? AND m.active = 1`
  ).bind(await sha256Hex(token), new Date().toISOString()).first<{ id: string; name: string; email: string }>();
  return row ?? null;
}

export async function revokeMerchantSession(request: Request, env: Env): Promise<void> {
  if (!env.DB) return;
  const token = cookieValue(request);
  if (!token || token.length > 256) return;
  await env.DB.prepare("DELETE FROM merchant_sessions WHERE token_hash = ?")
    .bind(await sha256Hex(token)).run();
}
