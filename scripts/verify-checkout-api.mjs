import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { onRequest as provisionMerchant } from "../functions/api/merchant.ts";
import { onRequest as checkoutSession } from "../functions/api/checkout-session.ts";
import { onRequest as quote } from "../functions/api/quote.ts";

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

const originalFetch = globalThis.fetch;
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
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}

console.log("Checkout API integration checks passed: provisioning auth, API-key hashing, merchant auth, session issuance, duplicate-order rejection, session retrieval, quote binding, dry quote persistence and mainnet commit guard.");
