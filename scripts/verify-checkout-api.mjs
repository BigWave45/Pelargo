import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { onRequest as provisionMerchant } from "../functions/api/merchant.ts";
import { onRequest as registerMerchant } from "../functions/api/auth/register.ts";
import { onRequest as loginMerchant } from "../functions/api/auth/login.ts";
import { onRequest as requestPasswordReset } from "../functions/api/auth/password-reset-request.ts";
import { onRequest as resetPassword } from "../functions/api/auth/password-reset.ts";
import { onRequest as merchantSession } from "../functions/api/auth/session.ts";
import { onRequest as logoutMerchant } from "../functions/api/auth/logout.ts";
import { onRequest as merchantSettings } from "../functions/api/merchant-settings.ts";
import { onRequest as merchantOrders } from "../functions/api/orders.ts";
import { onRequest as checkoutSession } from "../functions/api/checkout-session.ts";
import { onRequest as quote } from "../functions/api/quote.ts";
import { onRequest as getOrder } from "../functions/api/order.ts";
import { onRequest as paymentStatus } from "../functions/api/payment-status.ts";
import { onRequest as submitDeposit } from "../functions/api/deposit-submit.ts";
import { onRequest as legacyStatus } from "../functions/api/status.ts";
import { transitionPayment, PaymentTransitionError } from "../functions/_lib/payment-lifecycle.ts";
import { verifyNearNep141Settlement } from "../functions/_lib/near-settlement-verifier.ts";
import { expireAbandonedCheckouts, recordUncertainQuoteCommits, reconcileDuePayments } from "../workers/expiry-sweeper.ts";
import { onRequest as operatorRecoveryCases } from "../functions/api/operator/recovery-cases.ts";
import { signCheckoutSession } from "../functions/_lib/checkout-session.ts";
import { sha256Hex } from "../functions/_lib/database.ts";
import { intentsProviderAdapter, intentsProvider } from "../functions/_lib/intents.ts";

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
sqlite.exec(readFileSync(new URL("../migrations/0015_auth_rate_limits.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0016_origin_deposit_evidence.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0017_payment_reconciliation_jobs.sql", import.meta.url), "utf8"));
sqlite.exec(readFileSync(new URL("../migrations/0018_preview_password_reset.sql", import.meta.url), "utf8"));
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

// Provider adapter registry: explicit endpoints, network separation and auth isolation.
const mainnetAdapter = intentsProviderAdapter({});
assert.equal(mainnetAdapter.id, "near-1click");
assert.equal(mainnetAdapter.network, "mainnet");
assert.equal(mainnetAdapter.baseUrl, "https://1click.chaindefuser.com");
const mainnetHeaders = new Headers();
mainnetAdapter.applyAuthentication(mainnetHeaders, { ONECLICK_JWT: "test-jwt" });
assert.equal(mainnetHeaders.get("authorization"), "Bearer test-jwt");

const tidepoolAdapter = intentsProviderAdapter({ INTENTS_API_BASE_URL: "https://www.usetidepool.tech" });
assert.equal(tidepoolAdapter.id, "tidepool");
assert.equal(tidepoolAdapter.network, "testnet");
const tidepoolHeaders = new Headers();
tidepoolAdapter.applyAuthentication(tidepoolHeaders, { ONECLICK_JWT: "must-not-leak" });
assert.equal(tidepoolHeaders.has("authorization"), false, "mainnet JWT must never reach Tidepool");

assert.throws(
  () => intentsProviderAdapter({ INTENTS_API_BASE_URL: "https://unregistered-provider.example" }),
  /Unsupported NEAR Intents provider origin/,
  "unregistered provider origins must fail closed",
);
assert.deepEqual(intentsProvider({ INTENTS_API_BASE_URL: "https://www.usetidepool.tech" }), {
  baseUrl: "https://www.usetidepool.tech", network: "testnet",
});


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

// Preview-only password recovery: generic request, one-time token, password update,
// session revocation, and replay rejection. Keep testnet provider settings isolated
// from the other payment-status integration cases in this shared test process.
const recoveryEnv = { ...env, INTENTS_API_BASE_URL: "https://www.usetidepool.tech", ALLOW_TESTNET_DEPOSITS: "true" };
const originalWarn = console.warn;
let resetLog = "";
console.warn = (...args) => { resetLog = args.join(" "); };
const resetRequestResponse = await requestPasswordReset({
  request: request("https://reliability-background-recon.pelargo.pages.dev/api/auth/password-reset-request", "POST", {
    email: "OWNER@example.test",
  }, { origin: "https://reliability-background-recon.pelargo.pages.dev" }),
  env: recoveryEnv,
});
console.warn = originalWarn;
assert.equal(resetRequestResponse.status, 200, "known account reset request should return generic success");
assert.match((await resetRequestResponse.json()).message, /reset link has been generated/i);
const resetUrlMatch = resetLog.match(/https:\/\/reliability-background-recon\.pelargo\.pages\.dev\/\?password-reset=([a-f0-9]{64})/);
assert.ok(resetUrlMatch, "operator Preview log should contain a one-time reset URL");
const resetToken = resetUrlMatch[1];

const resetResponse = await resetPassword({
  request: request("https://reliability-background-recon.pelargo.pages.dev/api/auth/password-reset", "POST", {
    token: resetToken, password: "new-long-test-password-789",
  }, { origin: "https://reliability-background-recon.pelargo.pages.dev" }),
  env: recoveryEnv,
});
assert.equal(resetResponse.status, 200, "valid reset token should update password");
assert.match((await resetResponse.json()).message, /All previous sessions have been signed out/i);

const oldSessionAfterReset = await merchantSession({
  request: new Request("https://pelargo.test/api/auth/session", { headers: { cookie: selfServeCookie } }),
  env,
});
assert.equal(oldSessionAfterReset.status, 401, "password reset must revoke pre-existing sessions");

const replayResponse = await resetPassword({
  request: request("https://reliability-background-recon.pelargo.pages.dev/api/auth/password-reset", "POST", {
    token: resetToken, password: "another-long-test-password-999",
  }, { origin: "https://reliability-background-recon.pelargo.pages.dev" }),
  env: recoveryEnv,
});
assert.equal(replayResponse.status, 400, "reset token must be single-use");

const resetLogin = await loginMerchant({
  request: request("https://pelargo.test/api/auth/login", "POST", {
    email: "owner@example.test", password: "new-long-test-password-789",
  }),
  env,
});
assert.equal(resetLogin.status, 200, "new password must authenticate after reset");

const productionResetDenied = await requestPasswordReset({
  request: request("https://pelargo.pages.dev/api/auth/password-reset-request", "POST", {
    email: "owner@example.test",
  }, { origin: "https://pelargo.pages.dev" }),
  env: recoveryEnv,
});
assert.equal(productionResetDenied.status, 404, "password reset must be disabled outside the exact Preview host");



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
    quoteResponse: {
      quoteRequest: { originAsset: "eip155:8453/erc20:0xUSDC" },
      quote: {
        amountIn: "1012633", amountInFormatted: "1.012633",
        amountOut: "1000000", amountOutFormatted: "1.00",
        deadline: "2026-11-05T00:10:00.000Z",
      },
    },
    swapDetails: { destinationChainTxHashes: [null, {}, { hash: "" }, { hash: "2222222222222222222222222222222222222222222" }] },
  });
  const malformedHashes = await responseJson(await paymentStatus({
    request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
      headers: { "x-pelargo-merchant-key": created.body.apiKey },
    }),
    env,
  }));
  assert.equal(malformedHashes.status, 200, "malformed hash entries must not crash provider status parsing");
  assert.equal(malformedHashes.body.settlement, "awaiting_destination_chain_verification");
  assert.deepEqual(malformedHashes.body.depositInstructions, {
    originAssetId: "eip155:8453/erc20:0xUSDC",
    amountInAtomic: "1012633",
    amountInFormatted: "1.012633",
    amountOutAtomic: "1000000",
    amountOutFormatted: "1.00",
    deadline: "2026-11-05T00:10:00.000Z",
    depositAddress: "deposit-address-test",
    depositMemo: "memo-test",
  }, "status response should expose the original provider source asset, exact deposit amount and deadline");
  assert.equal(
    sqlite.query("SELECT destination_tx_candidate FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").destination_tx_candidate,
    "2222222222222222222222222222222222222222222",
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
  assert.equal(stalePoll.status, 200, "stale provider poll should return the latest persisted state");
  const stalePollBody = await stalePoll.json();
  assert.equal(stalePollBody.concurrentPoll, true);
  assert.equal(stalePollBody.paymentStatus, "awaiting_deposit");
  assert.equal(stalePollBody.providerStatus, null);
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
  assert.equal(stalePoll.status, 200, "a newer poll timestamp should return the latest persisted state");
  const stalePollBody = await stalePoll.json();
  assert.equal(stalePollBody.concurrentPoll, true);
  assert.equal(stalePollBody.paymentStatus, "awaiting_deposit");
  assert.equal(stalePollBody.providerStatus, null);
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
      return Response.json({ data: [{ transaction_hash: hash, signer_account_id: "buyer.testnet" }] });
    }
    if (parsed.hostname === "rpc.testnet.near.org") {
      const req = JSON.parse(init.body);
      if (req.method === "status") return Response.json({ result: { chain_id: "testnet" }});
      if (req.method === "EXPERIMENTAL_tx_status") {
        assert.deepEqual(req.params, {
          tx_hash: hash,
          sender_account_id: "buyer.testnet",
          wait_until: "FINAL",
        });
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

 
// Tidepool recovery: a configured signer is accepted only for its exact hash.
// Canonical RPC must still prove FINAL execution and the exact NEP-141 transfer.
{
  const hash = "vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE";
  const signer = "maker.tidepool-sandbox.testnet";
  const rpcCalls = [];
  const original = globalThis.fetch;
  const envWithRecoverySigner = {
    INTENTS_API_BASE_URL: "https://www.usetidepool.tech",
    NEAR_TX_HASH: hash,
    NEAR_TX_SIGNER_ID: signer,
    NEAR_RPC_URL: "https://rpc.testnet.near.org",
  };
  const order = {
    destinationNetwork: "NEAR",
    destinationAsset: "nep141:usdc.tidepool-sandbox.testnet",
    recipient: "agentg.testnet",
    amountAtomic: "1000000",
  };
  const mockRpc = (amount = "1000000", expectedSigner = signer) => async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.hostname !== "rpc.testnet.near.org") {
      throw new Error("Configured signer path must not call the NearBlocks indexer: " + parsed.hostname);
    }
    const req = JSON.parse(init.body);
    rpcCalls.push(req);
    if (req.method === "status") return Response.json({ result: { chain_id: "testnet" } });
    if (req.method === "EXPERIMENTAL_tx_status") {
      assert.deepEqual(req.params, {
        tx_hash: hash, sender_account_id: expectedSigner, wait_until: "FINAL",
      });
      if (expectedSigner !== signer) return Response.json({
        error: { name: "HANDLER_ERROR", cause: { name: "INVALID_TRANSACTION", info: { error_message: "Transaction signer does not match" } } },
      });
      return Response.json({ result: {
        status: { SuccessValue: "" },
        receipts_outcome: [{
          block_hash: "tidepool-receipt-block",
          outcome: {
            executor_id: "usdc.tidepool-sandbox.testnet",
            status: { SuccessValue: "" },
            logs: [`EVENT_JSON:${JSON.stringify({
              standard: "nep141", version: "1.0.0", event: "ft_transfer",
              data: [{ old_owner_id: "maker.tidepool-sandbox.testnet", new_owner_id: "agentg.testnet", amount }],
            })}`],
          },
        }],
      }});
    }
    if (req.method === "block" && req.params.block_id) {
      return Response.json({ result: { header: { hash: "tidepool-receipt-block", height: 276344865 } } });
    }
    if (req.method === "block" && req.params.finality === "final") {
      return Response.json({ result: { header: { hash: "final-block", height: 276344900 } } });
    }
    throw new Error("Unexpected canonical NEAR RPC method: " + req.method);
  };
  try {
    globalThis.fetch = mockRpc();
    const evidence = await verifyNearNep141Settlement(envWithRecoverySigner, order, hash);
    assert.equal(evidence?.transactionHash, hash);
    assert.equal(evidence?.tokenContract, "usdc.tidepool-sandbox.testnet");
    assert.equal(evidence?.recipient, "agentg.testnet");
    assert.equal(evidence?.amountAtomic, "1000000");
    assert.equal(evidence?.blockNumber, "276344865");
    assert.equal(rpcCalls.some((call) => call.method === "EXPERIMENTAL_tx_status"), true);

    // A configured signer for another hash must not be used; indexer lookup is required.
    let indexerCalled = false;
    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === "rpc.testnet.near.org") {
        const req = JSON.parse(init.body);
        if (req.method === "status") return Response.json({ result: { chain_id: "testnet" } });
      }
      if (parsed.hostname === "api-testnet.nearblocks.io") {
        indexerCalled = true;
        return Response.json({ data: [] });
      }
      throw new Error("Unexpected hash-scope test request: " + parsed.hostname);
    };
    const otherHash = "2222222222222222222222222222222222222222222";
    const unscoped = await verifyNearNep141Settlement(envWithRecoverySigner, order, otherHash);
    assert.equal(unscoped, null);
    assert.equal(indexerCalled, true, "signer hint must not leak to a different candidate hash");

    // Even with the correct signer and a successful transaction, the wrong amount cannot settle.
    globalThis.fetch = mockRpc("999999");
    const wrongAmount = await verifyNearNep141Settlement(envWithRecoverySigner, order, hash);
    assert.equal(wrongAmount, null, "wrong NEP-141 amount must fail closed");

    // A signer mismatch is rejected by canonical RPC and cannot produce evidence.
    globalThis.fetch = mockRpc("1000000", "wrong-signer.testnet");
    const wrongSigner = await verifyNearNep141Settlement({
      ...envWithRecoverySigner,
      NEAR_TX_SIGNER_ID: "wrong-signer.testnet",
    }, order, hash);
    assert.equal(wrongSigner, null, "canonical RPC signer mismatch must fail closed");
  } finally {
    globalThis.fetch = original;
  }
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
  const intermediateHash = "2222222222222222222222222222222222222222222";
  const destinationHash = "1111111111111111111111111111111111111111111";
  const mockNearVerifier = (transferAmount, refundAmount = "0", includeDestinationHash = true, providerStatus = "SUCCESS") => async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "1click.chaindefuser.com") {
      return Response.json({
        status: providerStatus, updatedAt: "2026-11-05T00:01:00Z",
        // The first hash is an intermediate transaction with the wrong
        // transfer amount; the second is the actual destination settlement.
        swapDetails: includeDestinationHash
          ? { destinationChainTxHashes: [{ hash: intermediateHash }, { hash: destinationHash }] }
          : {},
      });
    }
    if (parsed.hostname === "nearscanner.com" && parsed.pathname.startsWith("/api/v1/explorer/tx/")) {
      assert.equal(init.method, "GET", "NearScanner transaction lookup must use GET");
      assert.equal(new Headers(init.headers).get("x-api-key"), "test-nearscanner-api-key",
        "NearScanner transaction lookup must send the configured API key");
      const requestedHash = decodeURIComponent(parsed.pathname.split("/").at(-1));
      assert.ok([intermediateHash, destinationHash].includes(requestedHash));
      return Response.json({
        data: { transaction: { hash: requestedHash, signer_id: "sender.near" } },
      });
    }
    if (parsed.hostname === "rpc.mainnet.near.org") {
      const rpcRequest = JSON.parse(init.body);
      if (rpcRequest.method === "status") {
        return Response.json({ result: { chain_id: "mainnet" } });
      }
      if (rpcRequest.method === "EXPERIMENTAL_tx_status") {
        assert.equal(rpcRequest.params.wait_until, "FINAL", "NEAR transaction verification must request FINAL execution status");
        const isIntermediate = rpcRequest.params.tx_hash === intermediateHash;
        const candidateAmount = isIntermediate ? "1999999" : transferAmount;
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
                  data: [{ old_owner_id: "sender.near", new_owner_id: "merchant.near", amount: candidateAmount }],
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
    mismatchedTransfer.body.verificationDiagnostics.some((item) =>
      item.hash === destinationHash && item.stage === "exact_nep141_net_transfer_not_found"),
    true,
    "mismatched destination transfer must retain its candidate-specific verification stage",
  );
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

  globalThis.fetch = mockNearVerifier("2000000", "0", true, "PROCESSING");

  // A finalized destination transfer can settle the order even while the
  // provider still reports PROCESSING; this also exercises atomic ledger rollback.
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

  // Retry the same provider PROCESSING response after the transient ledger failure.
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
  assert.equal(verifiedTransfer.body.destinationTransactionHash, destinationHash,
    "response must expose the candidate that passed exact settlement verification");
  assert.equal(
    sqlite.query("SELECT destination_tx_candidate FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").destination_tx_candidate,
    destinationHash,
    "the verified later candidate must replace the first intermediate candidate before evidence is committed",
  );
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

  // A settled payment must return its immutable evidence without polling the
  // provider. A later provider hash must not overwrite the verified candidate.
  const settledCandidateBefore = sqlite.query(
    "SELECT destination_tx_candidate FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)"
  ).get("order-001").destination_tx_candidate;
  const fetchBeforeSettledRead = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("provider must not be called for settled payments"); };
  try {
    const settledRead = await responseJson(await paymentStatus({
      request: new Request("https://pelargo.test/api/payment-status?orderId=order-001", {
        headers: { "x-pelargo-merchant-key": created.body.apiKey },
      }),
      env,
    }));
    assert.equal(settledRead.status, 200);
    assert.equal(settledRead.body.paymentStatus, "settled");
    assert.equal(settledRead.body.destinationTransactionHash, destinationHash);
    assert.equal(
      sqlite.query("SELECT destination_tx_candidate FROM payment_lifecycle WHERE order_id = (SELECT id FROM checkout_orders WHERE external_order_id = ?)").get("order-001").destination_tx_candidate,
      settledCandidateBefore,
      "a settled payment's verified candidate must not be overwritten by later polling",
    );
  } finally {
    globalThis.fetch = fetchBeforeSettledRead;
  }
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

    // An expired signed token may recover status only when its persisted session
    // is already committed and remains bound to this exact merchant/order.
    const committedClaims = JSON.parse(atob(commitIssued.body.token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    committedClaims.exp = Math.floor(Date.now() / 1000) - 1;
    const expiredCommittedToken = await signCheckoutSession(committedClaims, env);
    sqlite.query("UPDATE checkout_sessions SET token_hash = ?, expires_at = ? WHERE jti = ?").run(
      await sha256Hex(expiredCommittedToken),
      new Date(Date.now() - 60_000).toISOString(),
      commitJti,
    );
    const recoveredExpiredBuyer = await responseJson(await paymentStatus({
      request: new Request("https://pelargo.test/api/payment-status?orderId=order-commit", {
        headers: { authorization: "Bearer " + expiredCommittedToken },
      }),
      env,
    }));
    assert.equal(recoveredExpiredBuyer.status, 200, "expired committed buyer session must retain read-only payment recovery");
    assert.equal(recoveredExpiredBuyer.body.paymentStatus, "awaiting_deposit");

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

  // A concurrent poll that wins the provider-state compare-and-set must
  // cause the losing request to return the persisted state, not HTTP 409.
  const concurrentOrder = { ...order, orderId: "order-concurrent-poll" };
  const concurrentIssued = await responseJson(await checkoutSession({
    request: request("https://pelargo.test/api/checkout-session", "POST", concurrentOrder, {
      "x-pelargo-merchant-key": created.body.apiKey,
    }),
    env,
  }));
  assert.equal(concurrentIssued.status, 201);
  const concurrentOrderRow = sqlite.query(
    "SELECT id FROM checkout_orders WHERE external_order_id = ?"
  ).get("order-concurrent-poll");
  sqlite.query(
    "UPDATE payment_lifecycle SET status = 'awaiting_deposit', deposit_address = ?, provider_status = NULL, destination_tx_candidate = NULL, last_polled_at = NULL WHERE order_id = ?"
  ).run("concurrent-deposit-address", concurrentOrderRow.id);

  const beforeConcurrentPoll = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      sqlite.query(
        "UPDATE payment_lifecycle SET provider_status = ?, last_polled_at = ? WHERE order_id = ?"
      ).run("PENDING_DEPOSIT", "2026-11-05T12:00:00.000Z", concurrentOrderRow.id);
      return Response.json({ status: "PENDING_DEPOSIT" });
    };
    const concurrentPoll = await responseJson(await paymentStatus({
      request: new Request("https://pelargo.test/api/payment-status?orderId=order-concurrent-poll", {
        headers: { "x-pelargo-merchant-key": created.body.apiKey },
      }),
      env,
    }));
    assert.equal(concurrentPoll.status, 200, "losing concurrent poll should return current state");
    assert.equal(concurrentPoll.body.concurrentPoll, true);
    assert.equal(concurrentPoll.body.paymentStatus, "awaiting_deposit");
    assert.equal(concurrentPoll.body.providerStatus, "PENDING_DEPOSIT");
    assert.equal(
      sqlite.query("SELECT last_polled_at FROM payment_lifecycle WHERE order_id = ?").get(concurrentOrderRow.id).last_polled_at,
      "2026-11-05T12:00:00.000Z",
      "losing poll must not overwrite the winning poll timestamp",
    );
  } finally {
    globalThis.fetch = beforeConcurrentPoll;
  }


  // Durable background reconciliation: lifecycle eligibility enqueues a job;
  // the worker uses the private internal path, then releases a lease with backoff
  // when the provider is temporarily unavailable. It must never execute a quote.
  const scheduledOrder = { ...order, orderId: "order-scheduled-reconciliation" };
  const scheduledIssued = await responseJson(await checkoutSession({
    request: request("https://pelargo.test/api/checkout-session", "POST", scheduledOrder, {
      "x-pelargo-merchant-key": created.body.apiKey,
    }),
    env,
  }));
  assert.equal(scheduledIssued.status, 201);
  const scheduledOrderId = sqlite.query(
    "SELECT id FROM checkout_orders WHERE external_order_id = ?"
  ).get("order-scheduled-reconciliation").id;
  sqlite.query(
    "UPDATE payment_lifecycle SET status = 'awaiting_deposit', quote_id = ?, deposit_address = ? WHERE order_id = ?"
  ).run("scheduled-quote", "scheduled-deposit-address", scheduledOrderId);
  sqlite.query(
    "UPDATE checkout_orders SET status = 'quote_committed' WHERE id = ?"
  ).run(scheduledOrderId);
  const enqueued = sqlite.query(
    "SELECT order_id, attempt_count FROM payment_reconciliation_jobs WHERE order_id = ?"
  ).get(scheduledOrderId);
  assert.ok(enqueued, "eligible committed payment must be durably enqueued by the lifecycle trigger");
  assert.equal(enqueued.attempt_count, 0);
  // Earlier API scenarios can legitimately enqueue other committed orders.
  // Isolate this deterministic worker assertion to the fixture under test.
  sqlite.query("DELETE FROM payment_reconciliation_jobs WHERE order_id <> ?").run(scheduledOrderId);

  env.RECONCILIATION_SECRET = "test-reconciliation-secret-with-at-least-32-characters";
  env.INTENTS_API_BASE_URL = "https://www.usetidepool.tech";
  const beforeScheduledSweep = globalThis.fetch;
  let scheduledStatusCalls = 0;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "www.usetidepool.tech" && parsed.pathname === "/v0/status") {
      scheduledStatusCalls++;
      return Response.json({ correlationId: "scheduled-quote", status: "PROCESSING", swapDetails: {} });
    }
    throw new Error("Unexpected background reconciliation request: " + String(url));
  };
  try {
    const sweepStats = await reconcileDuePayments(env, new Date(), 1);
    assert.deepEqual(sweepStats, { claimed: 1, settled: 0, deferred: 1 });
    assert.equal(scheduledStatusCalls, 1, "worker should call the existing status verifier once");
    const scheduledJob = sqlite.query(
      "SELECT attempt_count, lease_token, lease_until, last_error, next_attempt_at FROM payment_reconciliation_jobs WHERE order_id = ?"
    ).get(scheduledOrderId);
    assert.equal(scheduledJob.attempt_count, 1);
    assert.equal(scheduledJob.lease_token, null, "worker must release the lease after a retryable result");
    assert.equal(scheduledJob.lease_until, null);
    assert.match(scheduledJob.last_error, /HTTP 200/);
    assert.ok(Date.parse(scheduledJob.next_attempt_at) > Date.now(),
      "retryable payment status must receive a future backoff time");
    assert.equal(
      sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = ?").get(scheduledOrderId).status,
      "awaiting_deposit",
      "background reconciliation must not invent settlement",
    );
  } finally {
    globalThis.fetch = beforeScheduledSweep;
    env.RECONCILIATION_SECRET = undefined;
    env.INTENTS_API_BASE_URL = undefined;
  }

  // Failure injection: provider timeout must release the lease and leave
  // the payment non-terminal so a later scheduled run can retry it.
  async function makeWorkerFixture(externalOrderId, lifecycleStatus = "awaiting_deposit") {
    const issued = await responseJson(await checkoutSession({
      request: request("https://pelargo.test/api/checkout-session", "POST", {
        ...order, orderId: externalOrderId,
      }, { "x-pelargo-merchant-key": created.body.apiKey }),
      env,
    }));
    assert.equal(issued.status, 201);
    const id = sqlite.query(
      "SELECT id FROM checkout_orders WHERE external_order_id = ?"
    ).get(externalOrderId).id;
    sqlite.query(
      "UPDATE payment_lifecycle SET status = ?, quote_id = ?, deposit_address = ? WHERE order_id = ?"
    ).run(lifecycleStatus, externalOrderId + "-quote", "deposit-" + externalOrderId, id);
    sqlite.query("UPDATE checkout_orders SET status = 'quote_committed' WHERE id = ?").run(id);
    return id;
  }

  env.RECONCILIATION_SECRET = "test-reconciliation-secret-with-at-least-32-characters";
  env.INTENTS_API_BASE_URL = "https://www.usetidepool.tech";

  const timeoutJobOrderId = await makeWorkerFixture("order-worker-timeout");
  sqlite.query("DELETE FROM payment_reconciliation_jobs WHERE order_id <> ?").run(timeoutJobOrderId);
  const fetchBeforeWorkerTimeout = globalThis.fetch;
  globalThis.fetch = async () => { throw new DOMException("injected timeout", "TimeoutError"); };
  try {
    const timeoutStats = await reconcileDuePayments(env, new Date(), 1);
    assert.deepEqual(timeoutStats, { claimed: 1, settled: 0, deferred: 1 });
    const timeoutJob = sqlite.query(
      "SELECT attempt_count, lease_token, last_error FROM payment_reconciliation_jobs WHERE order_id = ?"
    ).get(timeoutJobOrderId);
    assert.equal(timeoutJob.attempt_count, 1);
    assert.equal(timeoutJob.lease_token, null);
    assert.match(timeoutJob.last_error, /HTTP 504/);
    assert.equal(
      sqlite.query("SELECT status FROM payment_lifecycle WHERE order_id = ?").get(timeoutJobOrderId).status,
      "awaiting_deposit",
    );
  } finally {
    globalThis.fetch = fetchBeforeWorkerTimeout;
  }

  // A Worker crash after claim leaves a lease. A second invocation must not
  // steal it early, but must recover it after the lease expires.
  const orphanedLeaseOrderId = await makeWorkerFixture("order-worker-orphaned-lease");
  sqlite.query("DELETE FROM payment_reconciliation_jobs WHERE order_id <> ?").run(orphanedLeaseOrderId);
  const leaseStart = new Date();
  const leaseExpiry = new Date(leaseStart.getTime() + 5 * 60_000).toISOString();
  sqlite.query(
    "UPDATE payment_reconciliation_jobs SET attempt_count = 1, lease_token = ?, lease_until = ? WHERE order_id = ?"
  ).run("simulated-crashed-worker", leaseExpiry, orphanedLeaseOrderId);
  const fetchBeforeLeaseRecovery = globalThis.fetch;
  let leaseRecoveryPolls = 0;
  globalThis.fetch = async () => {
    leaseRecoveryPolls++;
    return Response.json({ correlationId: "order-worker-orphaned-lease-quote", status: "PROCESSING", swapDetails: {} });
  };
  try {
    const activeLease = await reconcileDuePayments(env, leaseStart, 1);
    assert.deepEqual(activeLease, { claimed: 0, settled: 0, deferred: 0 });
    assert.equal(leaseRecoveryPolls, 0);
    const expiredLease = await reconcileDuePayments(env, new Date(leaseStart.getTime() + 6 * 60_000), 1);
    assert.deepEqual(expiredLease, { claimed: 1, settled: 0, deferred: 1 });
    assert.equal(leaseRecoveryPolls, 1);
    const recovered = sqlite.query(
      "SELECT attempt_count, lease_token FROM payment_reconciliation_jobs WHERE order_id = ?"
    ).get(orphanedLeaseOrderId);
    assert.equal(recovered.attempt_count, 2);
    assert.equal(recovered.lease_token, null);
  } finally {
    globalThis.fetch = fetchBeforeLeaseRecovery;
  }

  // Two concurrent invocations with two due jobs should claim distinct work.
  // A CAS collision on the first selected row must retry selection.
  const concurrentA = await makeWorkerFixture("order-worker-concurrent-a");
  const concurrentB = await makeWorkerFixture("order-worker-concurrent-b");
  sqlite.query("DELETE FROM payment_reconciliation_jobs WHERE order_id NOT IN (?, ?)").run(concurrentA, concurrentB);
  const concurrentFetchBefore = globalThis.fetch;
  let concurrentPolls = 0;
  globalThis.fetch = async () => {
    concurrentPolls++;
    return Response.json({ status: "PROCESSING", swapDetails: {} });
  };
  try {
    const concurrentStats = await Promise.all([
      reconcileDuePayments(env, new Date(), 1),
      reconcileDuePayments(env, new Date(), 1),
    ]);
    assert.equal(concurrentStats.reduce((sum, stat) => sum + stat.claimed, 0), 2);
    assert.equal(concurrentPolls, 2);
    for (const id of [concurrentA, concurrentB]) {
      const job = sqlite.query(
        "SELECT attempt_count, lease_token FROM payment_reconciliation_jobs WHERE order_id = ?"
      ).get(id);
      assert.equal(job.attempt_count, 1);
      assert.equal(job.lease_token, null);
    }
  } finally {
    globalThis.fetch = concurrentFetchBefore;
  }

  // Terminal lifecycle transitions remove their durable reconciliation job.
  sqlite.query("UPDATE payment_lifecycle SET status = 'failed' WHERE order_id = ?").run(concurrentA);
  assert.equal(
    sqlite.query("SELECT COUNT(*) AS count FROM payment_reconciliation_jobs WHERE order_id = ?").get(concurrentA).count,
    0,
    "terminal lifecycle trigger must delete the reconciliation job",
  );

  // Internal reconciliation must reject a caller without the shared secret.
  const invalidWorkerSecret = await paymentStatus({
    request: new Request(
      "https://pelargo.test/api/payment-status?internalOrderId=" + encodeURIComponent(concurrentB),
      { headers: { "x-pelargo-reconciliation-secret": "incorrect-worker-secret" } },
    ),
    env,
  });
  assert.equal(invalidWorkerSecret.status, 401);

  env.RECONCILIATION_SECRET = undefined;
  env.INTENTS_API_BASE_URL = undefined;

  // Origin-chain recovery requires a quote-bound, exact Base Sepolia ERC-20 transfer.
  const originValidOrder = { ...order, orderId: "order-origin-valid" };
  const originValidIssued = await responseJson(await checkoutSession({
    request: request("https://pelargo.test/api/checkout-session", "POST", originValidOrder, {
      "x-pelargo-merchant-key": created.body.apiKey,
    }),
    env,
  }));
  assert.equal(originValidIssued.status, 201);
  const originOrderId = sqlite.query(
    "SELECT id FROM checkout_orders WHERE external_order_id = ?"
  ).get("order-origin-valid").id;
  const originToken = "0x38d81431b9f76d9699af7517040d5221d9dea252";
  const originDepositAddress = "0x93084718ae40758F22F489D288DFdE0556d39dc9";
  const originTxHash = "0x" + "a".repeat(64);
  sqlite.query(
    "UPDATE payment_lifecycle SET status = 'processing', quote_id = ?, deposit_address = ? WHERE order_id = ?"
  ).run("origin-quote-test", originDepositAddress, originOrderId);
  sqlite.query(
    "UPDATE checkout_orders SET status = 'quote_committed' WHERE id = ?"
  ).run(originOrderId);
  env.INTENTS_API_BASE_URL = "https://www.usetidepool.tech";
  env.BASE_SEPOLIA_RPC_URL = "https://base-rpc.test";
  const originalFetchForOriginSubmit = globalThis.fetch;
  let providerSubmitCalls = 0;
  let transferAmount = 1012633n;
  const originTransferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const paddedAddress = "0x" + originDepositAddress.slice(2).toLowerCase().padStart(64, "0");
  const quoteResponse = {
    correlationId: "origin-quote-test",
    quoteRequest: {
      originAsset: "nep141:base-" + originToken + ".tp-omft.testnet",
      destinationAsset: "nep141:usdc.omft.near",
      recipient: "merchant.near",
    },
    quote: {
      amountIn: "1012633",
      amountOut: "2000000",
      depositAddress: originDepositAddress,
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(String(url));
    if (parsed.hostname === "www.usetidepool.tech" && parsed.pathname === "/v0/status") {
      return Response.json({
        correlationId: "origin-quote-test", status: "PROCESSING", quoteResponse,
        swapDetails: {
          nearTxHashes: [],
          originChainTxHashes: [],
          // The provider's documented shape may contain plain hash strings.
          destinationChainTxHashes: ["vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE"],
        },
      });
    }
    if (parsed.hostname === "www.usetidepool.tech" && parsed.pathname === "/v0/deposit/submit") {
      providerSubmitCalls++;
      const payload = JSON.parse(init.body);
      assert.equal(payload.txHash, originTxHash);
      assert.equal(payload.depositAddress, originDepositAddress);
      return Response.json({
        correlationId: "origin-quote-test", status: "PROCESSING", quoteResponse,
        swapDetails: { nearTxHashes: [], originChainTxHashes: [{ hash: originTxHash }] },
      });
    }
    if (parsed.hostname === "near-rpc.test") {
      return Response.json({ jsonrpc: "2.0", id: "test", result: { chain_id: "testnet" } });
    }
    if (parsed.hostname === "api-testnet.nearblocks.io") {
      return Response.json({ data: [] });
    }
    if (parsed.hostname === "base-rpc.test") {
      const rpcRequest = JSON.parse(init.body);
      if (rpcRequest.method === "eth_chainId") return Response.json({ result: "0x14a34" });
      if (rpcRequest.method === "eth_blockNumber") return Response.json({ result: "0x20" });
      if (rpcRequest.method === "eth_getTransactionReceipt") return Response.json({ result: {
        status: "0x1", transactionHash: originTxHash, blockNumber: "0x10", blockHash: "0x" + "b".repeat(64),
        logs: [{
          address: originToken,
          topics: [originTransferTopic, "0x" + "0".repeat(64), paddedAddress],
          data: "0x" + transferAmount.toString(16),
        }],
      }});
    }
    throw new Error("Unexpected origin recovery request: " + String(url));
  };
  try {
    const unauthenticatedOriginSubmit = await submitDeposit({
      request: request("https://pelargo.test/api/deposit-submit", "POST", {
        orderId: "order-origin-valid", transactionHash: originTxHash,
      }),
      env,
    });
    assert.equal(unauthenticatedOriginSubmit.status, 401,
      "origin deposit submission must require merchant authentication");

    const invalidOriginAmount = await responseJson(await submitDeposit({
      request: request("https://pelargo.test/api/deposit-submit", "POST", {
        orderId: "order-origin-valid", transactionHash: originTxHash,
      }, { "x-pelargo-merchant-key": created.body.apiKey }),
      env,
    }));
    assert.equal(invalidOriginAmount.status, 200, JSON.stringify(invalidOriginAmount.body));
    assert.equal(invalidOriginAmount.body.originDeposit, "verified");
    assert.equal(invalidOriginAmount.body.providerNotification, "accepted");
    assert.equal(providerSubmitCalls, 1);
    assert.equal(
      sqlite.query("SELECT transaction_hash, amount_atomic, provider_submit_status FROM payment_origin_deposit_evidence WHERE order_id = ?").get(originOrderId).transaction_hash,
      originTxHash,
    );

    // Regression: status polling must retain a provider destination hash when
    // the API returns the hash as a string rather than { hash: "..." }.
    env.NEAR_RPC_URL = "https://near-rpc.test";
    const stringHashStatus = await responseJson(await paymentStatus({
      request: new Request("https://pelargo.test/api/payment-status?orderId=order-origin-valid", {
        headers: { "x-pelargo-merchant-key": created.body.apiKey },
      }),
      env,
    }));
    assert.equal(stringHashStatus.status, 200, JSON.stringify(stringHashStatus.body));
    assert.equal(
      sqlite.query("SELECT destination_tx_candidate FROM payment_lifecycle WHERE order_id = ?").get(originOrderId).destination_tx_candidate,
      "vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE",
      "plain-string provider destination hashes must be persisted as settlement candidates",
    );

    // A different amount on the same token/recipient must be rejected before provider notification.
    transferAmount = 1012632n;
    // Evidence is immutable by design; use a second order for the negative case.
    const wrongOriginOrder = { ...order, orderId: "order-origin-wrong-amount" };
    const wrongOriginIssued = await responseJson(await checkoutSession({
      request: request("https://pelargo.test/api/checkout-session", "POST", wrongOriginOrder, {
        "x-pelargo-merchant-key": created.body.apiKey,
      }),
      env,
    }));
    assert.equal(wrongOriginIssued.status, 201);
    const wrongOriginRow = sqlite.query(
      "SELECT id FROM checkout_orders WHERE external_order_id = ?"
    ).get("order-origin-wrong-amount");
    sqlite.query(
      "UPDATE payment_lifecycle SET status = 'processing', quote_id = ?, deposit_address = ? WHERE order_id = ?"
    ).run("origin-quote-wrong-amount", originDepositAddress, wrongOriginRow.id);
    const wrongQuoteResponse = {
      ...quoteResponse, correlationId: "origin-quote-wrong-amount",
    };
    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(String(url));
      if (parsed.hostname === "www.usetidepool.tech" && parsed.pathname === "/v0/status") {
        return Response.json({
          correlationId: "origin-quote-wrong-amount", status: "PROCESSING",
          quoteResponse: wrongQuoteResponse, swapDetails: {},
        });
      }
      if (parsed.hostname === "base-rpc.test") {
        const rpcRequest = JSON.parse(init.body);
        if (rpcRequest.method === "eth_chainId") return Response.json({ result: "0x14a34" });
        if (rpcRequest.method === "eth_getTransactionReceipt") return Response.json({ result: {
          status: "0x1", transactionHash: "0x" + "c".repeat(64), blockNumber: "0x10", blockHash: "0x" + "c".repeat(64),
          logs: [{
            address: originToken, topics: [originTransferTopic, "0x" + "0".repeat(64), paddedAddress],
            data: "0x" + transferAmount.toString(16),
          }],
        }});
      }
      throw new Error("Unexpected negative origin verification request");
    };
    const wrongOrigin = await responseJson(await submitDeposit({
      request: request("https://pelargo.test/api/deposit-submit", "POST", {
        orderId: "order-origin-wrong-amount", transactionHash: "0x" + "c".repeat(64),
      }, { "x-pelargo-merchant-key": created.body.apiKey }),
      env,
    }));
    assert.equal(wrongOrigin.status, 422);
    assert.equal(wrongOrigin.body.code, "ORIGIN_DEPOSIT_NOT_VERIFIED");
    assert.equal(providerSubmitCalls, 1,
      "an unverified source transfer must never be submitted to the provider");
  } finally {
    globalThis.fetch = originalFetchForOriginSubmit;
    env.INTENTS_API_BASE_URL = undefined;
    env.BASE_SEPOLIA_RPC_URL = undefined;
  }

  env.ALLOW_MAINNET_DEPOSITS = undefined;
} finally {
  globalThis.fetch = originalFetchForQuote;
  sqlite.close();
}

console.log("Checkout API integration checks passed: provisioning auth, API-key hashing, merchant auth, inactive merchant rejection, session issuance, missing-secret fail-closed behavior, expiry and revocation enforcement, duplicate-order rejection, session retrieval, merchant-scoped order lookup, authenticated provider status polling, provider status persistence, SUCCESS settlement guard, payment lifecycle initialization, transition validation, audit events, quote binding, dry quote persistence and mainnet commit guard.");
