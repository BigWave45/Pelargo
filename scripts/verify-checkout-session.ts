import { strict as assert } from "node:assert";
import { signCheckoutSession, verifyCheckoutSession, type CheckoutSessionClaims } from "../functions/_lib/checkout-session";
import type { Env } from "../functions/_lib/intents";

const env: Env = {
  ORDER_SESSION_SECRET: "test-only-secret-with-at-least-32-characters",
};
const now = Math.floor(Date.now() / 1000);
const claims: CheckoutSessionClaims = {
  v: 1,
  merchantId: "merchant_test",
  merchantName: "Test Merchant",
  orderId: "order_001",
  amount: "1.00",
  amountAtomic: "1000000",
  destinationAsset: "nep141:test-token.omft.near",
  destinationSymbol: "USDC",
  destinationNetwork: "Base",
  recipient: "0x1111111111111111111111111111111111111111",
  jti: "test-session-001",
  iat: now,
  exp: now + 900,
};

const token = await signCheckoutSession(claims, env);
const verified = await verifyCheckoutSession(token, env);
assert.equal(verified?.merchantId, claims.merchantId, "valid session should verify");
assert.equal(verified?.amountAtomic, claims.amountAtomic, "signed amount should be preserved");

const tampered = token.replace(/.$/, token.endsWith("A") ? "B" : "A");
assert.equal(await verifyCheckoutSession(tampered, env), null, "tampered token must be rejected");

const expired = await signCheckoutSession({ ...claims, jti: "expired", exp: now - 1 }, env);
assert.equal(await verifyCheckoutSession(expired, env), null, "expired token must be rejected");

assert.equal(await verifyCheckoutSession(token, { ORDER_SESSION_SECRET: "wrong-secret-with-at-least-32-characters" }), null, "wrong signing secret must be rejected");
assert.equal(await verifyCheckoutSession(token, {}), null, "missing signing secret must be rejected");

console.log("Checkout session security checks passed: valid signature, tampering, expiry, wrong secret and missing secret.");
