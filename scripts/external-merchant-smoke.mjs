/**
 * External merchant API smoke test.
 *
 * Runs only non-payment operations: creates an uncommitted checkout session,
 * validates the buyer bearer session, reads the merchant-scoped order, and
 * checks authentication/idempotency boundaries. It never requests a quote,
 * deposit instructions, or transfers.
 *
 * Required environment:
 *   PELARGO_API_URL=https://reliability-background-recon.pelargo.pages.dev
 *   PELARGO_MERCHANT_API_KEY=<server-side merchant API key>
 *
 * Optional:
 *   PELARGO_OTHER_MERCHANT_API_KEY=<different merchant key for isolation test>
 *   PELARGO_TEST_RECIPIENT=agentg.testnet
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const baseUrl = (process.env.PELARGO_API_URL ??
  "https://reliability-background-recon.pelargo.pages.dev").replace(/\/$/, "");
const merchantKey = process.env.PELARGO_MERCHANT_API_KEY;
const otherMerchantKey = process.env.PELARGO_OTHER_MERCHANT_API_KEY;
const recipient = process.env.PELARGO_TEST_RECIPIENT ?? "agentg.testnet";

assert.ok(merchantKey, "Set PELARGO_MERCHANT_API_KEY in the server environment.");
assert.ok(!/\s/.test(merchantKey), "Merchant API key contains whitespace.");

const orderId = `EXT-MERCHANT-${Date.now()}-${randomUUID().slice(0, 8)}`;
const headers = {
  "content-type": "application/json",
  "x-pelargo-merchant-key": merchantKey,
};

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { ...(init.headers ?? {}) },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Expected JSON from ${path}; received HTTP ${response.status}`); }
  return { response, body };
}

function pass(label) {
  process.stdout.write(`PASS  ${label}\n`);
}

// 1. Invalid merchant credentials must be rejected.
{
  const { response } = await request("/api/order?orderId=not-a-real-order", {
    headers: { "x-pelargo-merchant-key": "plg_invalid_external_test_key" },
  });
  assert.equal(response.status, 401, "Invalid merchant key should return HTTP 401.");
  pass("invalid merchant key rejected");
}

// 2. Create one merchant-owned order and signed buyer session.
const createPayload = {
  orderId,
  amount: "1",
  amountAtomic: "1000000",
  destinationAsset: "nep141:usdc.tidepool-sandbox.testnet",
  destinationSymbol: "USDC",
  destinationNetwork: "NEAR",
  recipient,
  expiresInSeconds: 900,
};

const created = await request("/api/checkout-session", {
  method: "POST",
  headers,
  body: JSON.stringify(createPayload),
});
assert.equal(created.response.status, 201, `Checkout creation failed: ${created.body.error ?? created.response.status}`);
assert.equal(created.body.session?.orderId, orderId);
assert.equal(created.body.session?.amountAtomic, "1000000");
assert.equal(created.body.session?.destinationAsset, createPayload.destinationAsset);
assert.equal(created.body.session?.recipient, recipient);
assert.equal(typeof created.body.token, "string");
assert.ok(created.body.token.length > 20);
const buyerToken = created.body.token;
pass("merchant creates checkout session");

// 3. Buyer bearer token can retrieve only its own signed session.
const buyerSession = await request("/api/checkout-session", {
  headers: { authorization: `Bearer ${buyerToken}` },
});
assert.equal(buyerSession.response.status, 200);
assert.equal(buyerSession.body.session?.orderId, orderId);
assert.equal(buyerSession.body.session?.recipient, recipient);
pass("buyer bearer session validates");

// 4. Merchant API key can retrieve its own order without exposing buyer token.
const order = await request(`/api/order?orderId=${encodeURIComponent(orderId)}`, {
  headers: { "x-pelargo-merchant-key": merchantKey },
});
assert.equal(order.response.status, 200);
assert.equal(order.body.order?.orderId, orderId);
assert.equal(order.body.order?.status, "pending");
assert.equal("token" in order.body, false);
pass("merchant retrieves own pending order");

// 5. Duplicate merchant order reference must not create a second order.
const duplicate = await request("/api/checkout-session", {
  method: "POST",
  headers,
  body: JSON.stringify(createPayload),
});
assert.equal(duplicate.response.status, 409);
pass("duplicate order reference rejected");

// 6. An unrelated merchant key must not see this merchant's order.
if (otherMerchantKey) {
  const isolated = await request(`/api/order?orderId=${encodeURIComponent(orderId)}`, {
    headers: { "x-pelargo-merchant-key": otherMerchantKey },
  });
  assert.equal(isolated.response.status, 404);
  pass("cross-merchant order lookup isolated");
} else {
  process.stdout.write("SKIP  cross-merchant isolation (set PELARGO_OTHER_MERCHANT_API_KEY)\n");
}

// 7. Pending order must not be mistaken for a committed payment.
const payment = await request(`/api/payment-status?orderId=${encodeURIComponent(orderId)}`, {
  headers: { "x-pelargo-merchant-key": merchantKey },
});
assert.equal(payment.response.status, 409);
assert.equal(payment.body.code, "DEPOSIT_NOT_CREATED");
pass("uncommitted order has no payment/deposit status");

process.stdout.write(`\nExternal merchant smoke test passed for ${orderId}.\n`);
process.stdout.write("No quote was committed and no payment or transfer was initiated.\n");
