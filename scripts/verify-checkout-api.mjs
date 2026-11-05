import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { onRequest as provisionMerchant } from "../functions/api/merchant.ts";
import { onRequest as checkoutSession } from "../functions/api/checkout-session.ts";
import { onRequest as quote } from "../functions/api/quote.ts";
import { onRequest as getOrder } from "../functions/api/order.ts";
import { onRequest as paymentStatus } from "../functions/api/payment-status.ts";
import { transitionPayment, PaymentTransitionError } from "../functions/_lib/payment-lifecycle.ts";

class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  first() { return this.db.query(this.sql).get(...this.values) ?? null; }
  run() {
    const result = this.db.query(this.sql).run(...this.values);
    return { success: true, meta: { changes: result.changes } };
  }
}

class D1TestDatabase {
  constructor() { this.sqlite = new Database(":memory:"); this.sqlite.exec("PRAGMA foreign_keys = ON"); }
  prepare(sql) { return new Statement(this.sqlite, sql); }
  batch(statements) {
    const transaction = this.sqlite.transaction(() => statements.map((statement) => statement.run()));
    return Promise.resolve(transaction());
  }
}

const sqlite = new Database(":memory:");
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec(readFileSync(new URL("../migrations/0001_checkout_storage.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0002_payment_lifecycle.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0003_provider_status.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0004_commit_state_sync.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0005_verified_settlement.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0006_order_destination_metadata.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0007_match_settlement_network.sql", import.meta.url), "utf8"));
const db = {
  prepare(sql) { return new Statement(sqlite, sql); },
  batch(statements) {
    const transaction = sqlite.transaction(() => statements.map((statement) => statement.run()));
    return Promise.resolve(transaction());
  },
};

const env = {
  DB: db,
  MERCHANT_PROVISIONING_SECRET: "test-provisioning-secret",
  ORDER_SESSION_SECRET: "test-only-order-session-secret-with-32-plus-characters",
};
const responseJson = async (response) => ({ status: response.status, body: await response.json() });
const request = (url, method, body, headers = {}) => new Request(url, {
  method,
  headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const denied = await provisionMerchant({
  request: request("https://pelargo.test/api/merchant", "POST", { name: "Test Shop" }, {
    "x-pelargo-provisioning-key": "wrong",
  }),
  env,
});
assert.equal(denied.status, 401, "merchant provisioning must reject a wrong operator secret");

const created = await responseJson(await provisionMerchant({
  request: request("https://pelargo.test/api/merchant", "POST", { id: "shop_test", name: "Test Shop" }, {
    "x-pelargo-provisioning-key": env.MERCHANT_PROVISIONING_SECRET,
  }),
  env,
}));
assert.equal(created.status, 201, "merchant provisioning should create a merchant");
const secondMerchant = await responseJson(await provisionMerchant({
  request: request("https://pelargo.test/api/merchant", "POST", { id: "shop_other", name: "Other Shop" }, {
    "x-pelargo-provisioning-key": env.MERCHANT_PROVISIONING_SECRET,
  }),
  env,
}));
assert.equal(secondMerchant.status, 201, "second merchant should be provisioned for isolation tests");
assert.match(created.body.apiKey, /^plg_live_[a-f0-9]{64}$/, "merchant API key must be high entropy");
const storedMerchant = sqlite.query("SELECT api_key_hash FROM merchants WHERE id = ?").get("shop_test");
assert.notEqual(storedMerchant.api_key_hash, created.body.apiKey, "database must not store the plaintext API key");

const invalidMerchant = await checkoutSession({
  request: request("https://pelargo.test/api/checkout-session", "POST", {
    orderId: "order-001", amount: "2.00", amountAtomic: "2000000",
    destinationAsset: "nep141:usdc.omft.near", destinationSymbol: "USDC",
    destinationNetwork: "NEAR", recipient: "merchant.near",
  }, { "x-pelargo-merchant-key": "invalid" }),
  env,
});
assert.equal(invalidMerchant.status, 401, "checkout session must reject an invalid merchant key");

const order = {
  orderId: "order-001", amount: "2.00", amountAtomic: "2000000",
  destinationAsset: "nep141:usdc.omft.near", destinationSymbol: "USDC",
  destinationNetwork: "NEAR", recipient: "merchant.near", expiresInSeconds: 900,
};
const issued = await responseJson(await checkoutSession({
  request: request("https://pelargo.test/api/checkout-session", "POST", order, {
    "x-pelargo-merchant-key": created.body.apiKey,
  }),
  env,
}));
assert.equal(issued.status, 201, "authenticated merchant should receive a checkout session");
const unauthorizedOrderLookup = await getOrder({
  request: new Request("https://pelargo.test/api/order?orderId=order-001"),
  env,
});
assert.equal(unauthorizedOrderLookup.status, 401, "order lookup must require merchant authentication");

const ownOrder = await responseJson(await getOrder({
  request: new Request("https://pelargo.test/api/order?orderId=order-001", {
    headers: { "x-pelargo-merchant-key": created.body.apiKey },
  }),
  env,
}));
assert.equal(ownOrder.status, 200, "merchant should retrieve its own order");
assert.equal(ownOrder.body.order.status, "pending");
const lifecycle = sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001");
assert.equal(lifecycle.status, "pending", "new order must initialize payment lifecycle");
await transitionPayment(db, { orderId: sqlite.query("SELECT id FROM checkout_orders WHERE external_order_id = ?").get("order-001").id, expectedStatus: "pending", nextStatus: "quote_committed" });
await transitionPayment(db, { orderId: sqlite.query("SELECT id FROM checkout_orders WHERE external_order_id = ?").get("order-001").id, expectedStatus: "quote_committed", nextStatus: "awaiting_deposit" });
const eventRows = sqlite.query("SELECT previous_status, new_status FROM payment_events WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?) ORDER BY id").all("order-001");
assert.deepEqual(eventRows.map((event) => [event.previous_status, event.new_status]), [
  [null, "pending"], ["pending", "quote_committed"], ["quote_committed", "awaiting_deposit"],
], "lifecycle transitions must append ordered audit events");
await assert.rejects(
  transitionPayment(db, { orderId: sqlite.query("SELECT id FROM checkout_orders WHERE external_order_id = ?").get("order-001").id, expectedStatus: "awaiting_deposit", nextStatus: "settled" }),
  (error) => error instanceof PaymentTransitionError && error.code === "invalid_transition",
  "settlement must not be reachable directly from awaiting_deposit",
);
await assert.rejects(
  transitionPayment(db, { orderId: sqlite.query("SELECT id FROM checkout_orders WHERE external_order_id = ?").get("order-001").id, expectedStatus: "pending", nextStatus: "quote_committed" }),
  (error) => error instanceof PaymentTransitionError && error.code === "conflict",
  "stale expected state must not overwrite a newer state",
);
assert.equal(ownOrder.body.order.amountAtomic, "2000000");
assert.equal("token" in ownOrder.body.order, false, "order lookup must not expose checkout tokens");
const unauthorizedStatus = await paymentStatus({
  request: new Request("https://pelargo.test/api/payment-status?orderId=order-001"),
  env,
});
assert.equal(unauthorizedStatus.status, 401, "payment status polling must require merchant authentication");

sqlite.query("UPDATE payment_lifecycle SET deposit_address = ?, deposit_memo = ? WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").run("deposit-address-test", "memo-test", "order-001");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const statusUrl = new URL(String(url));
  assert.equal(statusUrl.pathname, "/v0/status");
  assert.equal(statusUrl.searchParams.get("depositAddress"), "deposit-address-test");
  assert.equal(statusUrl.searchParams.get("depositMemo"), "memo-test");
  return new Response(JSON.stringify({ status: "KNOWN_DEPOSIT_TX", updatedAt: "2026-11-05T00:00:00Z" }), {
    status: 200, headers: { "content-type": "application/json" },
  });
};
try {
  const polled = await responseJson(await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  }));
  assert.equal(polled.status, 200);
  assert.equal(polled.body.paymentStatus, "deposit_detected");
  assert.equal(sqlite.query("SELECT provider_status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").provider_status, "KNOWN_DEPOSIT_TX");
  await transitionPayment(db, { orderId: sqlite.query("SELECT id FROM checkout_orders WHERE external_order_id = ?").get("order-001").id, expectedStatus: "deposit_detected", nextStatus: "processing" });
  globalThis.fetch = async () => new Response(JSON.stringify({
    status: "SUCCESS",
    updatedAt: "2026-11-05T00:01:00Z",
    swapDetails: { destinationChainTxHashes: [{ hash: "destination-tx-candidate" }] },
  }), { status: 200, headers: { "content-type": "application/json" } });
  const providerSuccess = await responseJson(await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  }));
  assert.equal(providerSuccess.body.settlement, "awaiting_destination_chain_verification");
  assert.equal(sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").status, "processing", "provider SUCCESS must not independently settle an order");
  assert.throws(
    () => sqlite.query("UPDATE payment_lifecycle SET status = 'settled' WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").run("order-001"),
    /verified settlement evidence does not match order/,
    "database must reject settlement without independently verified evidence",
  );
  assert.equal(
    sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").status,
    "processing",
    "rejected settlement must leave payment in processing",
  );
} finally {
  globalThis.fetch = originalFetch;
}


const foreignOrder = await getOrder({
  request: new Request("https://pelargo.test/api/order?orderId=order-001", {
    headers: { "x-pelargo-merchant-key": secondMerchant.body.apiKey },
  }),
  env,
});
assert.equal(foreignOrder.status, 404, "merchant must not retrieve another merchant's order");

const missingOrderId = await getOrder({
  request: new Request("https://pelargo.test/api/order", {
    headers: { "x-pelargo-merchant-key": created.body.apiKey },
  }),
  env,
});
assert.equal(missingOrderId.status, 400, "order lookup must require an order ID");
assert.ok(issued.body.token, "checkout response must include a signed token");

const duplicate = await checkoutSession({
  request: request("https://pelargo.test/api/checkout-session", "POST", order, {
    "x-pelargo-merchant-key": created.body.apiKey,
  }),
  env,
});
assert.equal(duplicate.status, 409, "duplicate merchant order IDs must be rejected");

const inspected = await responseJson(await checkoutSession({
  request: new Request("https://pelargo.test/api/checkout-session?token=" + encodeURIComponent(issued.body.token)),
  env,
}));
assert.equal(inspected.status, 200, "active signed session should be retrievable");
assert.equal(inspected.body.session.orderId, "order-001");

const originalFetchForQuote = globalThis.fetch;
let upstreamCalls = 0;
globalThis.fetch = async () => {
  upstreamCalls += 1;
  return Response.json({ quote: { amountIn: "2100000", amountOut: "2000000" } });
};
const quoteBody = {
  dry: true, swapType: "EXACT_OUTPUT",
  originAsset: "nep141:usdt.omft.near",
  destinationAsset: order.destinationAsset,
  amount: order.amountAtomic,
  recipient: order.recipient,
  refundTo: "sender.near",
  sessionToken: issued.body.token,
  depositType: "ORIGIN_CHAIN",
  refundType: "ORIGIN_CHAIN",
  recipientType: "DESTINATION_CHAIN",
  deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
};
try {
  const mismatch = await quote({
    request: request("https://pelargo.test/api/quote", "POST", {
      ...quoteBody, amount: "1",
    }),
    env,
  });
  assert.equal(mismatch.status, 409, "quote must reject amount changes against signed order");
  assert.equal(upstreamCalls, 0, "invalid quote must not reach the upstream service");

  const preview = await quote({
    request: request("https://pelargo.test/api/quote", "POST", quoteBody),
    env,
  });
  assert.equal(preview.status, 200, "valid dry quote should be forwarded");
  assert.equal(upstreamCalls, 1, "valid dry quote should call upstream once");

  const sessionState = sqlite.query("SELECT status FROM checkout_sessions WHERE jti = ?").get(
    JSON.parse(atob(issued.body.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).jti,
  );
  assert.equal(sessionState.status, "active", "dry quote must not consume checkout session");

  const disabledCommit = await quote({
    request: request("https://pelargo.test/api/quote", "POST", { ...quoteBody, dry: false }),
    env,
  });
  assert.equal(disabledCommit.status, 403, "committed quotes must remain disabled by default");

  assert.equal(upstreamCalls, 1, "disabled commit must not reach upstream");

  const commitOrder = { ...order, orderId: "order-commit" };
  const commitIssued = await responseJson(await checkoutSession({
    request: request("https://pelargo.test/api/checkout-session", "POST", commitOrder, {
      "x-pelargo-merchant-key": created.body.apiKey,
    }),
    env,
  }));
  assert.equal(commitIssued.status, 201, "second order should receive a commit-test session");
  const commitJti = JSON.parse(atob(commitIssued.body.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).jti;
  const commitLifecycleId = sqlite.query(
    "SELECT id FROM checkout_orders WHERE external_order_id = ?"
  ).get("order-commit").id;

  assert.throws(
    () => sqlite.query("UPDATE payment_lifecycle SET status = 'quote_committed', quote_id = 'premature-test', deposit_address = 'premature-deposit' WHERE order_id = ?").run(commitLifecycleId),
    /checkout session state could not be synchronized/,
    "lifecycle commit must abort if the session is not in commit_attempted state",
  );
  assert.equal(
    sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = ?").get(commitLifecycleId).status,
    "pending",
    "failed dependent-row synchronization must roll back the lifecycle transition",
  );

  env.ALLOW_MAINNET_DEPOSITS = "true"; // test-only: upstream is fully mocked; no real request or transfer
  globalThis.fetch = async (_url, init) => {
    const submitted = JSON.parse(init.body);
    assert.equal(submitted.dry, false);
    return Response.json({
      correlationId: "quote-correlation-test",
      quote: { depositAddress: "provider-deposit-test", depositMemo: "provider-memo-test" },
    });
  };
  const committed = await responseJson(await quote({
    request: request("https://pelargo.test/api/quote", "POST", {
      ...quoteBody, dry: false, sessionToken: commitIssued.body.token,
    }),
    env,
  }));
  assert.equal(committed.status, 200, "mocked committed quote should be persisted");
  assert.equal(
    sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = ?").get(commitLifecycleId).status,
    "quote_committed",
  );
  assert.equal(
    sqlite.query("SELECT status FROM checkout_orders WHERE id = ?").get(commitLifecycleId).status,
    "quote_committed",
    "order state must synchronize with lifecycle state",
  );
  const persistedQuote = sqlite.query(
    "SELECT quote_id, deposit_address, deposit_memo FROM payment_lifecycle WHERE order_id = ?"
  ).get(commitLifecycleId);
  assert.deepEqual(persistedQuote, {
    quote_id: "quote-correlation-test",
    deposit_address: "provider-deposit-test",
    deposit_memo: "provider-memo-test",
  });
  assert.equal(
    sqlite.query("SELECT status FROM checkout_sessions WHERE jti = ?").get(commitJti).status,
    "committed",
    "session must become committed in the same atomic state transition",
  );
  env.ALLOW_MAINNET_DEPOSITS = undefined;
} finally {
  globalThis.fetch = originalFetchForQuote;
  sqlite.close();
}

console.log("Checkout API integration checks passed: provisioning auth, API-key hashing, merchant auth, session issuance, duplicate-order rejection, session retrieval, merchant-scoped order lookup, authenticated provider status polling, provider status persistence, SUCCESS settlement guard, payment lifecycle initialization, transition validation, audit events, quote binding, dry quote persistence and mainnet commit guard.");
