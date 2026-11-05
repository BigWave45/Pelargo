import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { onRequest as provisionMerchant } from "../functions/api/merchant.ts";
import { onRequest as registerMerchant } from "../functions/api/auth/register.ts";
import { onRequest as loginMerchant } from "../functions/api/auth/login.ts";
import { onRequest as merchantSession } from "../functions/api/auth/session.ts";
import { onRequest as logoutMerchant } from "../functions/api/auth/logout.ts";
import { onRequest as merchantSettings } from "../functions/api/merchant-settings.ts";
import { onRequest as merchantOrders } from "../functions/api/orders.ts";
import { onRequest as checkoutSession } from "../functions/api/checkout-session.ts";
import { onRequest as quote } from "../functions/api/quote.ts";
import { onRequest as getOrder } from "../functions/api/order.ts";
import { onRequest as paymentStatus } from "../functions/api/payment-status.ts";
import { onRequest as legacyStatus } from "../functions/api/status.ts";
import { transitionPayment, PaymentTransitionError } from "../functions/_lib/payment-lifecycle.ts";
import { verifyNearNep141Settlement } from "../functions/_lib/near-settlement-verifier.ts";
import { expireAbandonedCheckouts, recordUncertainQuoteCommits } from "../workers/expiry-sweeper.ts";
import { onRequest as operatorRecoveryCases } from "../functions/api/operator/recovery-cases.ts";

class Statement {
  constructor(db, sql, values = []) { this.db = db; this.sql = sql; this.values = values; }
  bind(...values) { return new Statement(this.db, this.sql, values); }
  first() { return this.db.query(this.sql).get(...this.values) ?? null; }
  all() { return { results: this.db.query(this.sql).all(...this.values) }; }
  run() {
    const result = this.db.query(this.sql).run(...this.values);
    return { success: true, meta: { changes: result.changes } };
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
sqlite.exec(readFileSync(new URL("../migrations/0008_settlement_evidence_contract_guard.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0009_settlement_evidence_insert_guard.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0010_pending_expiry_sync.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0011_payment_recovery_cases.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0012_merchant_accounts.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0013_merchant_destination_settings.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0014_destination_decimals.sql", import.meta.url), "utf8"));
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
  NEARSCANNER_API_KEY: "test-nearscanner-api-key",
};
const responseJson = async (response) => ({ status: response.status, body: await response.json() });

const request = (url, method, body, headers = {}) => new Request(url, {
  method,
  headers: { "content-type": "application/json", ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const selfServeRegistration = await registerMerchant({
  request: request("https://pelargo.test/api/auth/register", "POST", {
    name: "Self Serve Shop", email: "owner@example.test", password: "a-long-test-password-123",
  }),
  env,
});
assert.equal(selfServeRegistration.status, 201, "public merchant registration should create an account");
assert.equal(selfServeRegistration.headers.get("set-cookie")?.includes("HttpOnly"), true, "registration must issue an HttpOnly session cookie");
const selfServeCookie = selfServeRegistration.headers.get("set-cookie").split(";")[0];
const selfServeBody = await selfServeRegistration.json();
assert.equal(selfServeBody.merchant.email, "owner@example.test");
assert.equal("apiKey" in selfServeBody, false, "browser registration must not expose the internal merchant API key");

const accountSession = await responseJson(await merchantSession({
  request: new Request("https://pelargo.test/api/auth/session", { headers: { cookie: selfServeCookie } }),
  env,
}));
assert.equal(accountSession.status, 200, "registration session should authenticate the dashboard");
assert.equal(accountSession.body.merchant.name, "Self Serve Shop");

const duplicateRegistration = await registerMerchant({
  request: request("https://pelargo.test/api/auth/register", "POST", {
    name: "Duplicate", email: "OWNER@example.test", password: "a-long-test-password-456",
  }),
  env,
});
assert.equal(duplicateRegistration.status, 409, "email uniqueness must be case-insensitive");

const badLogin = await loginMerchant({
  request: request("https://pelargo.test/api/auth/login", "POST", {
    email: "owner@example.test", password: "wrong-password",
  }),
  env,
});
assert.equal(badLogin.status, 401, "login must reject an incorrect password");

const goodLogin = await loginMerchant({
  request: request("https://pelargo.test/api/auth/login", "POST", {
    email: "OWNER@example.test", password: "a-long-test-password-123",
  }),
  env,
});
assert.equal(goodLogin.status, 200, "login should accept a valid account");
const loginCookie = goodLogin.headers.get("set-cookie").split(";")[0];

const savedSettings = await responseJson(await merchantSettings({
  request: request("https://pelargo.test/api/merchant-settings", "PUT", {
    name: "Self Serve Shop", destinationAsset: "nep141:usdc.omft.near",
    destinationSymbol: "USDC", destinationNetwork: "NEAR",
    recipient: "shop.near", destinationDecimals: 6,
  }, { cookie: loginCookie }),
  env,
}));
assert.equal(savedSettings.status, 200, "authenticated merchant should save destination settings");

const selfServeOrder = {
  orderId: "self-serve-order-1", amount: "1.25", amountAtomic: "1250000",
  destinationAsset: "nep141:usdc.omft.near", destinationSymbol: "USDC",
  destinationNetwork: "NEAR", recipient: "shop.near",
};
const selfServeIssued = await responseJson(await checkoutSession({
  request: request("https://pelargo.test/api/checkout-session", "POST", selfServeOrder, { cookie: loginCookie }),
  env,
}));
assert.equal(selfServeIssued.status, 201, "dashboard session should create a merchant checkout session");

const selfServeOrderLookup = await getOrder({
  request: new Request("https://pelargo.test/api/order?orderId=self-serve-order-1", { headers: { cookie: loginCookie } }),
  env,
});
assert.equal(selfServeOrderLookup.status, 200, "dashboard session should read its own order");

const selfServeOrderList = await responseJson(await merchantOrders({
  request: new Request("https://pelargo.test/api/orders", { headers: { cookie: loginCookie } }),
  env,
}));
assert.equal(selfServeOrderList.status, 200);
assert.equal(selfServeOrderList.body.orders[0].orderId, "self-serve-order-1");

const loggedOut = await logoutMerchant({
  request: new Request("https://pelargo.test/api/auth/logout", { method: "POST", headers: { cookie: loginCookie, origin: "https://pelargo.test" } }),
  env,
});
assert.equal(loggedOut.status, 204);
const afterLogout = await merchantSession({
  request: new Request("https://pelargo.test/api/auth/session", { headers: { cookie: loginCookie } }),
  env,
});
assert.equal(afterLogout.status, 401, "logout must revoke the server-side session");


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

const missingSigningSecret = await checkoutSession({
  request: request("https://pelargo.test/api/checkout-session", "POST", {
    ...order, orderId: "order-no-signing-secret",
  }, { "x-pelargo-merchant-key": created.body.apiKey }),
  env: { ...env, ORDER_SESSION_SECRET: undefined },
});
assert.equal(missingSigningSecret.status, 503, "session issuance must fail closed without its signing secret");

const expiredOrder = await responseJson(await checkoutSession({
  request: request("https://pelargo.test/api/checkout-session", "POST", {
    ...order, orderId: "order-expired-session",
  }, { "x-pelargo-merchant-key": created.body.apiKey }),
  env,
}));
assert.equal(expiredOrder.status, 201, "expiry test order should be created");
const expiredJti = JSON.parse(atob(expiredOrder.body.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).jti;
sqlite.query("UPDATE checkout_sessions SET expires_at = ? WHERE jti = ?").run(
  new Date(Date.now() - 60_000).toISOString(), expiredJti,
);
const expiredLookup = await checkoutSession({
  request: new Request("https://pelargo.test/api/checkout-session?token=" + encodeURIComponent(expiredOrder.body.token)),
  env,
});
assert.equal(expiredLookup.status, 410, "stored expired sessions must be rejected even when token verification is otherwise valid");
sqlite.query("UPDATE checkout_orders SET expires_at = ? WHERE external_order_id = ?").run(
  new Date(Date.now() - 60_000).toISOString(), "order-expired-session",
);
const expiryCount = await expireAbandonedCheckouts(db);
assert.equal(expiryCount, 1, "expiry sweep should expire an elapsed uncommitted order");
const expiredLifecycle = sqlite.query(
  "SELECT status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)"
).get("order-expired-session");
const expiredOrderState = sqlite.query(
  "SELECT status FROM checkout_orders WHERE external_order_id = ?"
).get("order-expired-session");
const expiredSessionState = sqlite.query(
  "SELECT status FROM checkout_sessions WHERE jti = ?"
).get(expiredJti);
assert.equal(expiredLifecycle.status, "expired");
assert.equal(expiredOrderState.status, "expired");
assert.equal(expiredSessionState.status, "expired");
assert.equal(await expireAbandonedCheckouts(db), 0, "expiry sweep must be idempotent");


const revokedOrder = await responseJson(await checkoutSession({
  request: request("https://pelargo.test/api/checkout-session", "POST", {
    ...order, orderId: "order-revoked-session",
  }, { "x-pelargo-merchant-key": created.body.apiKey }),
  env,
}));
assert.equal(revokedOrder.status, 201, "revocation test order should be created");
const revokedJti = JSON.parse(atob(revokedOrder.body.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).jti;
sqlite.query("UPDATE checkout_sessions SET status = 'revoked' WHERE jti = ?").run(revokedJti);
const revokedLookup = await checkoutSession({
  request: new Request("https://pelargo.test/api/checkout-session?token=" + encodeURIComponent(revokedOrder.body.token)),
  env,
});
assert.equal(revokedLookup.status, 410, "revoked sessions must not be retrievable");

sqlite.query("UPDATE merchants SET active = 0 WHERE id = ?").run("shop_test");
const inactiveMerchantOrder = await getOrder({
  request: new Request("https://pelargo.test/api/order?orderId=order-001", {
    headers: { "x-pelargo-merchant-key": created.body.apiKey },
  }),
  env,
});
assert.equal(inactiveMerchantOrder.status, 401, "deactivated merchant credentials must stop authorizing order access");
sqlite.query("UPDATE merchants SET active = 1 WHERE id = ?").run("shop_test");
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

const retiredLegacyStatus = await legacyStatus({
  request: new Request("https://pelargo.test/api/status?depositAddress=public-deposit-address"),
  env,
});
assert.equal(retiredLegacyStatus.status, 410, "legacy public status proxy must be retired");
assert.equal((await retiredLegacyStatus.json()).code, "LEGACY_STATUS_ENDPOINT_RETIRED");

// The status endpoint requires a committed quote/deposit address before polling.
sqlite.query("UPDATE payment_lifecycle SET deposit_address = ?, deposit_memo = ? WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").run("deposit-address-test", "memo-test", "order-001");
sqlite.query("UPDATE checkout_orders SET status = 'quote_committed' WHERE external_order_id = ?").run("order-001");
const originalFetchForInvalidProvider = globalThis.fetch;
try {
  globalThis.fetch = async () => Response.json({
    status: "SUCCESS",
    updatedAt: "not-a-date",
    swapDetails: { destinationChainTxHashes: [{ hash: "valid-looking-hash" }] },
  });
  const invalidTimestamp = await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  });
  assert.equal(invalidTimestamp.status, 502, "invalid provider timestamps must be rejected");
  assert.equal(
    sqlite.query("SELECT provider_status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").provider_status,
    null,
    "invalid provider payload must not be persisted",
  );

  globalThis.fetch = async () => Response.json({
    status: "SUCCESS",
    updatedAt: "2026-11-05T00:00:00Z",
    swapDetails: { destinationChainTxHashes: [null, {}, { hash: "" }, { hash: "valid-candidate-hash" }] },
  });
  const malformedHashes = await responseJson(await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  }));
  assert.equal(malformedHashes.status, 200, "malformed hash entries must not crash provider status parsing");
  assert.equal(malformedHashes.body.settlement, "awaiting_destination_chain_verification");
  assert.equal(
    sqlite.query("SELECT destination_tx_candidate FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").destination_tx_candidate,
    "valid-candidate-hash",
    "status parser should select the first valid transaction hash",
  );
} finally {
  globalThis.fetch = originalFetchForInvalidProvider;
}

// The SUCCESS payload case intentionally exercises the full progression to
// processing. Reset this synthetic fixture before testing the separate
// KNOWN_DEPOSIT_TX path so the assertions do not share mutated lifecycle state.
sqlite.query(`UPDATE payment_lifecycle
  SET status = 'awaiting_deposit', provider_status = NULL, provider_updated_at = NULL,
      destination_tx_candidate = NULL, last_polled_at = NULL
  WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)`).run("order-001");
sqlite.query("UPDATE checkout_orders SET status = 'quote_committed' WHERE external_order_id = ?").run("order-001");

sqlite.query("UPDATE payment_lifecycle SET deposit_address = ?, deposit_memo = ? WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").run("deposit-address-test", "memo-test", "order-001");
sqlite.query("UPDATE checkout_orders SET status = 'quote_committed' WHERE external_order_id = ?").run("order-001");

// Simulate another poll/verifier changing the candidate while this request is
// waiting on the provider. The stale response must not overwrite newer state.
const originalFetchForRace = globalThis.fetch;
globalThis.fetch = async () => {
  sqlite.query("UPDATE payment_lifecycle SET destination_tx_candidate = ? WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").run("newer-candidate-from-concurrent-poll", "order-001");
  return Response.json({ status: "KNOWN_DEPOSIT_TX", updatedAt: "2026-11-05T00:00:00Z" });
};
try {
  const stalePoll = await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  });
  assert.equal(stalePoll.status, 409, "stale provider poll must return a conflict");
  const afterStalePoll = sqlite.query(
    "SELECT status, provider_status, destination_tx_candidate FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)"
  ).get("order-001");
  assert.equal(afterStalePoll.status, "awaiting_deposit");
  assert.equal(afterStalePoll.provider_status, null, "stale provider status must not overwrite current state");
  assert.equal(afterStalePoll.destination_tx_candidate, "newer-candidate-from-concurrent-poll");
} finally {
  globalThis.fetch = originalFetchForRace;
}
sqlite.query("UPDATE payment_lifecycle SET destination_tx_candidate = NULL, last_polled_at = NULL WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").run("order-001");

// Even when lifecycle status and candidate are unchanged, a newer poll must
// invalidate a response that was based on an older poll snapshot.
const originalFetchForPollRace = globalThis.fetch;
globalThis.fetch = async () => {
  sqlite.query("UPDATE payment_lifecycle SET last_polled_at = ? WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)")
    .run("2026-11-05T00:02:00.000Z", "order-001");
  return Response.json({ status: "KNOWN_DEPOSIT_TX", updatedAt: "2026-11-05T00:02:01Z" });
};
try {
  const stalePoll = await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  });
  assert.equal(stalePoll.status, 409, "a newer poll timestamp must invalidate an older in-flight poll");
  const afterPollRace = sqlite.query(
    "SELECT status, provider_status, destination_tx_candidate, last_polled_at FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)"
  ).get("order-001");
  assert.equal(afterPollRace.status, "awaiting_deposit");
  assert.equal(afterPollRace.provider_status, null);
  assert.equal(afterPollRace.destination_tx_candidate, null);
  assert.equal(afterPollRace.last_polled_at, "2026-11-05T00:02:00.000Z");
} finally {
  globalThis.fetch = originalFetchForPollRace;
}
sqlite.query("UPDATE payment_lifecycle SET last_polled_at = NULL WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").run("order-001");

// Tidepool testnet: resolve the signer from a hash-bound NearBlocks v3
// transaction object, then verify the transfer through canonical testnet RPC.
{
  const hash = "2222222222222222222222222222222222222222222";
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "api-testnet.nearblocks.io") {
      assert.equal(parsed.pathname, `/v3/txns/${hash}`);
      return Response.json({ data: { transaction_hash: hash, signer_account_id: "buyer.testnet" }});
    }
    if (parsed.hostname === "rpc.testnet.near.org") {
      const req = JSON.parse(init.body);
      if (req.method === "status") return Response.json({ result: { chain_id: "testnet" }});
      if (req.method === "EXPERIMENTAL_tx_status") {
        assert.deepEqual(req.params, [hash, "buyer.testnet", "FINAL"]);
        return Response.json({ result: { status: { SuccessValue: "" }, receipts_outcome: [{
          block_hash: "receipt-block", outcome: {
            executor_id: "usdc.tidepool-sandbox.testnet", status: { SuccessValue: "" },
            logs: [`EVENT_JSON:${JSON.stringify({standard:"nep141",version:"1.0.0",event:"ft_transfer",
              data:[{old_owner_id:"buyer.testnet",new_owner_id:"merchant.testnet",amount:"2000000"}]})}`],
          },
        }] }});
      }
      if (req.method === "block" && req.params.block_id)
        return Response.json({ result: { header: { hash: "receipt-block", height: 90 }}});
      if (req.method === "block" && req.params.finality === "final")
        return Response.json({ result: { header: { hash: "final-block", height: 100 }}});
    }
    throw new Error(`Unexpected testnet verifier request: ${url}`);
  };
  try {
    const evidence = await verifyNearNep141Settlement({ INTENTS_API_BASE_URL:"https://www.usetidepool.tech" }, {
      destinationNetwork:"NEAR", destinationAsset:"nep141:usdc.tidepool-sandbox.testnet",
      recipient:"merchant.testnet", amountAtomic:"2000000",
    }, hash);
    assert.equal(evidence?.tokenContract, "usdc.tidepool-sandbox.testnet");
    assert.equal(evidence?.recipient, "merchant.testnet");
    assert.equal(evidence?.amountAtomic, "2000000");
    assert.equal(evidence?.confirmations, 11);
  } finally { globalThis.fetch = original; }
}

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
  // The next SUCCESS poll intentionally skips the provider's PROCESSING state;
  // the route must fill the internal lifecycle gap before chain verification.
  const destinationHash = "1111111111111111111111111111111111111111111";
  const mockNearVerifier = (transferAmount, refundAmount = "0", includeDestinationHash = true) => async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "1click.chaindefuser.com") {
      return Response.json({
        status: "SUCCESS", updatedAt: "2026-11-05T00:01:00Z",
        swapDetails: includeDestinationHash
          ? { destinationChainTxHashes: [{ hash: destinationHash }] }
          : {},
      });
    }
    if (parsed.hostname === "nearscanner.com" && parsed.pathname.startsWith("/api/v1/explorer/tx/")) {
      assert.equal(init.method, "GET", "NearScanner transaction lookup must use GET");
      assert.equal(new Headers(init.headers).get("x-api-key"), "test-nearscanner-api-key",
        "NearScanner transaction lookup must send the configured API key");
      assert.equal(decodeURIComponent(parsed.pathname.split("/").at(-1)), destinationHash);
      return Response.json({
        data: { transaction: { hash: destinationHash, signer_id: "sender.near" } },
      });
    }
    if (parsed.hostname === "rpc.mainnet.near.org") {
      const rpcRequest = JSON.parse(init.body);
      if (rpcRequest.method === "status") {
        return Response.json({ result: { chain_id: "mainnet" } });
      }
      if (rpcRequest.method === "EXPERIMENTAL_tx_status") {
        assert.equal(rpcRequest.params[2], "FINAL", "NEAR transaction verification must request FINAL execution status");
        return Response.json({ result: {
          status: { SuccessValue: "" },
          receipts_outcome: [{
            block_hash: "receipt-block-hash",
            outcome: {
              executor_id: "usdc.omft.near",
              status: { SuccessValue: "" },
              logs: [
                `EVENT_JSON:${JSON.stringify({
                  standard: "nep141", version: "1.0.0", event: "ft_transfer",
                  data: [{ old_owner_id: "sender.near", new_owner_id: "merchant.near", amount: transferAmount }],
                })}`,
                ...(refundAmount === "0" ? [] : [`EVENT_JSON:${JSON.stringify({
                  standard: "nep141", version: "1.0.0", event: "ft_transfer",
                  data: [{ old_owner_id: "merchant.near", new_owner_id: "sender.near", amount: refundAmount }],
                })}`]),
              ],
            },
          }],
        }});
      }
      if (rpcRequest.method === "block" && rpcRequest.params.block_id) {
        return Response.json({ result: { header: { hash: "receipt-block-hash", height: 90 } } });
      }
      if (rpcRequest.method === "block" && rpcRequest.params.finality === "final") {
        return Response.json({ result: { header: { hash: "final-block-hash", height: 100 } } });
      }
    }
    throw new Error(`Unexpected verifier request: ${url}`);
  };

  // The provider no longer returns the hash, but Pelargo has a previously
  // observed candidate. SUCCESS must still run independent chain verification.
  sqlite.query("UPDATE payment_lifecycle SET destination_tx_candidate = ? WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").run(destinationHash, "order-001");
  globalThis.fetch = mockNearVerifier("2000000", "1", false);
  const mismatchedTransfer = await responseJson(await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  }));
  assert.equal(mismatchedTransfer.body.settlement, "awaiting_destination_chain_verification",
    "persisted candidate hash must be verified when a later SUCCESS response omits hashes");
  assert.equal(
    sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").status,
    "processing",
    "wrong transfer amount must not settle the order",
  );
  assert.equal(
    sqlite.query("SELECT COUNT(*) AS count FROM payment_settlement_evidence").get().count,
    0,
    "mismatched chain transfer must not create settlement evidence",
  );
  assert.throws(
    () => sqlite.query(`INSERT INTO payment_settlement_evidence
      (order_id, destination_chain, destination_asset, token_contract, transaction_hash,
       recipient, amount_atomic, block_number, block_hash, confirmations, verification_source, verified_at)
      VALUES (?, 'NEAR', 'nep141:usdc.omft.near', 'usdc.omft.near', 'stale-candidate',
              'merchant.near', '2000000', '90', 'receipt-block-hash', 11, 'chain_rpc', ?)`)
      .run(sqlite.query("SELECT id FROM checkout_orders WHERE external_order_id = ?").get("order-001").id, new Date().toISOString()),
    /settlement evidence requires matching processing candidate/,
    "evidence insert must reject a stale or non-matching candidate hash",
  );
  assert.equal(
    sqlite.query("SELECT COUNT(*) AS count FROM payment_settlement_evidence").get().count,
    0,
    "rejected stale evidence must not be stored",
  );

  // If chain verification is temporarily unavailable after the
  // lifecycle has advanced, the API must report the persisted processing state.
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "1click.chaindefuser.com") {
      return Response.json({
        status: "SUCCESS", updatedAt: "2026-11-05T00:00:59Z",
        swapDetails: { destinationChainTxHashes: [{ hash: destinationHash }] },
      });
    }
    if (parsed.hostname === "nearscanner.com") throw new Error("synthetic indexer outage");
    throw new Error("unexpected verifier request");
  };
  const unavailableVerifier = await responseJson(await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  }));
  assert.equal(unavailableVerifier.status, 503);
  assert.equal(unavailableVerifier.body.paymentStatus, "processing",
    "verification failure response must report the persisted lifecycle state, not the stale pre-transition state");
  assert.equal(
    sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").status,
    "processing",
  );

  globalThis.fetch = mockNearVerifier("2000000");

  // Force the lifecycle half of the settlement batch to fail after the
  // evidence insert is attempted. D1's batch must roll back both writes.
  sqlite.exec(`CREATE TRIGGER force_settlement_batch_rollback
    BEFORE UPDATE OF status ON payment_lifecycle
    WHEN NEW.status = 'settled'
    BEGIN SELECT RAISE(ABORT, 'forced settlement batch rollback test'); END;`);
  const failedSettlementCommit = await responseJson(await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  }));
  assert.equal(failedSettlementCommit.status, 503, "failed ledger commit must not be reported as settled");
  assert.equal(
    sqlite.query("SELECT COUNT(*) AS count FROM payment_settlement_evidence").get().count,
    0,
    "evidence insert must roll back when lifecycle settlement update fails",
  );
  assert.equal(
    sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").status,
    "processing",
    "failed settlement batch must preserve processing lifecycle state",
  );
  assert.equal(
    sqlite.query("SELECT status FROM checkout_orders WHERE external_order_id = ?").get("order-001").status,
    "quote_committed",
    "failed settlement batch must not mark the order paid",
  );
  sqlite.exec("DROP TRIGGER force_settlement_batch_rollback");

  // Retry the same provider SUCCESS after the transient ledger failure.
  // It must verify and commit once the database is writable again.
  const verifiedTransfer = await responseJson(await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  }));
  assert.equal(verifiedTransfer.status, 200);
  assert.equal(verifiedTransfer.body.paymentStatus, "settled");
  assert.equal(verifiedTransfer.body.settlement, "verified");
  const settledOrder = sqlite.query(
    "SELECT o.status AS order_status, p.status AS payment_status FROM checkout_orders o JOIN payment_lifecycle p ON p.order_id = o.id WHERE o.external_order_id = ?"
  ).get("order-001");
  assert.deepEqual(settledOrder, { order_status: "paid", payment_status: "settled" });
  const evidence = sqlite.query(
    "SELECT destination_chain, destination_asset, token_contract, transaction_hash, recipient, amount_atomic, block_number, block_hash, confirmations, verification_source FROM payment_settlement_evidence"
  ).get();
  assert.deepEqual(evidence, {
    destination_chain: "NEAR",
    destination_asset: "nep141:usdc.omft.near",
    token_contract: "usdc.omft.near",
    transaction_hash: destinationHash,
    recipient: "merchant.near",
    amount_atomic: "2000000",
    block_number: "90",
    block_hash: "receipt-block-hash",
    confirmations: 11,
    verification_source: "chain_rpc",
  });
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

  const tidepoolEnv = { ...env, INTENTS_API_BASE_URL: "https://www.usetidepool.tech" };
  const testnetDisabled = await quote({
    request: request("https://pelargo.test/api/quote", "POST", { ...quoteBody, dry: false }),
    env: tidepoolEnv,
  });
  assert.equal(testnetDisabled.status, 403);
  assert.equal((await testnetDisabled.json()).code, "TESTNET_DEPOSITS_DISABLED");
  tidepoolEnv.ALLOW_TESTNET_DEPOSITS = "true";
  const mainnetStillDisabled = await quote({
    request: request("https://pelargo.test/api/quote", "POST", { ...quoteBody, dry: false }),
    env,
  });
  assert.equal(mainnetStillDisabled.status, 403);
  assert.equal((await mainnetStillDisabled.json()).code, "MAINNET_DEPOSITS_DISABLED");

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
  let omitCorrelationId = false;
  globalThis.fetch = async (_url, init) => {
    const submitted = JSON.parse(init.body);
    assert.equal(submitted.dry, false);
    assert.equal(typeof submitted.sessionId, "string", "provider tracking session must be server-issued");
    return Response.json({
      ...(omitCorrelationId ? {} : { correlationId: "quote-correlation-test" }),
      quote: { depositAddress: "provider-deposit-test", depositMemo: "provider-memo-test" },
    });
  };
  const missingIdOrder = { ...order, orderId: "order-commit-missing-id" };
  const missingIdIssued = await responseJson(await checkoutSession({
    request: request("https://pelargo.test/api/checkout-session", "POST", missingIdOrder, {
      "x-pelargo-merchant-key": created.body.apiKey,
    }),
    env,
  }));
  assert.equal(missingIdIssued.status, 201);
  const missingIdLifecycleId = sqlite.query(
    "SELECT id FROM checkout_orders WHERE external_order_id = ?"
  ).get("order-commit-missing-id").id;
  omitCorrelationId = true;
  const missingQuoteId = await responseJson(await quote({
    request: request("https://pelargo.test/api/quote", "POST", {
      ...quoteBody, dry: false, sessionToken: missingIdIssued.body.token,
    }),
    env,
  }));
  assert.equal(missingQuoteId.status, 502, "committed quote without correlationId must fail closed");
  assert.equal(missingQuoteId.body.code, "COMMITTED_QUOTE_MISSING_ID");
  assert.equal(
    sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = ?").get(missingIdLifecycleId).status,
    "pending",
    "quote without correlationId must not become a payable order",
  );
  assert.equal(
    sqlite.query("SELECT status FROM checkout_sessions WHERE jti = ?").get(
      JSON.parse(atob(missingIdIssued.body.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).jti,
    ).status,
    "commit_attempted",
    "uncertain upstream commit must keep its session consumed",
  );
  omitCorrelationId = false;

  // A committed quote whose upstream response was lost stays commit_attempted.
  // The sweeper creates an operator case but never retries the provider call.
  sqlite.query("UPDATE checkout_sessions SET consumed_at = ?, status = 'commit_attempted' WHERE jti = ?").run(
    new Date(Date.now() - 11 * 60_000).toISOString(),
    JSON.parse(atob(missingIdIssued.body.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).jti,
  );
  const recoveryCasesCreated = await recordUncertainQuoteCommits(db);
  assert.equal(recoveryCasesCreated, 1, "stale uncertain commit must create one recovery case");
  assert.equal(await recordUncertainQuoteCommits(db), 0, "recovery case creation must be idempotent");
  const recoveryListUnauthenticated = await operatorRecoveryCases({
    request: new Request("https://pelargo.test/api/operator/recovery-cases"),
    env,
  });
  assert.equal(recoveryListUnauthenticated.status, 401, "recovery queue must require operator authentication");
  const recoveryList = await responseJson(await operatorRecoveryCases({
    request: new Request("https://pelargo.test/api/operator/recovery-cases", {
      headers: { "x-pelargo-provisioning-key": env.MERCHANT_PROVISIONING_SECRET },
    }),
    env,
  }));
  assert.equal(recoveryList.status, 200);
  assert.equal(recoveryList.body.cases.length, 1);
  assert.equal(recoveryList.body.cases[0].orderId, "order-commit-missing-id");
  assert.equal(recoveryList.body.cases[0].status, "open");
  assert.equal(
    sqlite.query("SELECT status FROM checkout_sessions WHERE jti = ?").get(
      JSON.parse(atob(missingIdIssued.body.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))).jti,
    ).status,
    "commit_attempted",
    "recovery must not unlock or retry an uncertain commit session",
  );

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
  // Buyer polling is authorized only by the signed token for its own committed order.
  const originalFetchForBuyerStatus = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).includes("/v0/status?"));
      assert.equal(init.method, "GET");
      return Response.json({ status: "PENDING_DEPOSIT" });
    };
    const buyerStatus = await responseJson(await paymentStatus({
      request: new Request("https://pelargo.test/api/payment-status?orderId=order-commit", {
        headers: { authorization: "Bearer " + commitIssued.body.token },
      }),
      env,
    }));
    assert.equal(buyerStatus.status, 200, "buyer session should retrieve its own committed payment status");
    assert.equal(buyerStatus.body.paymentStatus, "awaiting_deposit");
    const crossOrderStatus = await paymentStatus({
      request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
        headers: { authorization: "Bearer " + commitIssued.body.token },
      }),
      env,
    });
    assert.equal(crossOrderStatus.status, 403, "buyer session must not retrieve another order");
    const buyerOptions = await paymentStatus({
      request: new Request("https://pelargo.test/api/payment-status", { method: "OPTIONS" }),
      env,
    });
    assert.equal(buyerOptions.status, 204);
    assert.match(buyerOptions.headers.get("access-control-allow-headers") ?? "", /Authorization/i);
  } finally {
    globalThis.fetch = originalFetchForBuyerStatus;
  }

  env.ALLOW_MAINNET_DEPOSITS = undefined;
} finally {
  globalThis.fetch = originalFetchForQuote;
  sqlite.close();
}

console.log("Checkout API integration checks passed: provisioning auth, API-key hashing, merchant auth, inactive merchant rejection, session issuance, missing-secret fail-closed behavior, expiry and revocation enforcement, duplicate-order rejection, session retrieval, merchant-scoped order lookup, authenticated provider status polling, provider status persistence, SUCCESS settlement guard, payment lifecycle initialization, transition validation, audit events, quote binding, dry quote persistence and mainnet commit guard.");
