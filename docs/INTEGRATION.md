# Merchant integration guide

## Buyer checkout capabilities

The embedded widget can request a dry quote, then ask the buyer to explicitly confirm creation of a committed quote. It displays the provider's deposit address, optional memo, exact committed source amount and deadline only after validating the provider response. It does not connect a wallet or submit a transfer; the buyer must send the exact testnet asset and amount using a wallet on the selected source network.

After deposit instructions are created, the widget polls `GET /api/payment-status?orderId=...` with the signed checkout session in the `Authorization: Bearer` header. The API verifies the session signature, stored token hash, committed session state and order binding. A buyer session cannot query a different order. Merchant server-side polling continues to use `x-pelargo-merchant-key`.

Payment state is not considered paid until independent destination-chain verification succeeds and matching settlement evidence is persisted. Provider `SUCCESS` alone is insufficient.

The buyer committed-quote and polling paths have mocked integration coverage and passed CI. They have not yet been exercised end-to-end against live Tidepool or a real testnet deposit.


> **Current testnet status — 5 November 2026:** Pelargo Preview is configured to use the community-operated Tidepool NEAR testnet sandbox. The backend has a gated committed-quote path, but live token discovery, quote creation, deposit instructions and settlement have not yet been validated through Pelargo Preview. The embedded widget still supports dry-quote preview only; it is not yet a complete buyer payment flow. Do not use this integration to collect funds. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for the live verification record.

The embedded widget currently supports source-asset selection, dry quote preview, and an explicit buyer-confirmed request for committed deposit instructions. The committed step calls `POST /api/quote` with `dry:false`; Preview must be configured with Tidepool and `ALLOW_TESTNET_DEPOSITS=true`. When the provider returns a valid correlation ID and deposit address, the widget displays the address and optional memo. This does not initiate a transfer, connect a wallet, provide browser-side payment-status polling, or mark the order paid. The live testnet path remains unverified.

This describes the current Pelargo API and integration prototype. It is not a production payment integration. The widget currently supports dry quote preview; the full committed-quote, buyer payment and settlement flow has not been validated end to end. Do not use it to collect real customer funds.

## Security model

The merchant server owns the merchant API key and decides the trusted order amount, destination asset and receiving address. The browser receives only a short-lived signed session token and public order claims.

Never expose the merchant API key, `MERCHANT_PROVISIONING_SECRET`, `ORDER_SESSION_SECRET` or `NEAR_INDEXER_API_KEY` to browser code, HTML attributes, public repositories or Vite `VITE_*` variables. Treat the session token as a one-order bearer credential: do not log it unnecessarily or reuse it.

The signed session binds the merchant, order, amount, destination asset and recipient. Do not accept those authorization values from untrusted browser input. The buyer may select a supported source asset and provide a source refund address.

## Merchant provisioning

An operator provisions a merchant through `POST /api/merchant`, authenticated with `X-Pelargo-Provisioning-Key`. The generated merchant API key is returned once and stored by the merchant in a server-side secret manager. Pelargo stores a hash, not the plaintext API key.

There is no self-serve merchant signup, API-key rotation workflow or merchant credential management UI yet.

## 1. Create a checkout session from your server

Your server should first authenticate the buyer/order, load the canonical order from its own database, and resolve the destination asset and recipient from trusted merchant configuration. Calculate atomic units using the asset's actual decimals and integer arithmetic; do not use floating-point token conversion.

Example:

```ts
const PELARGO_API = process.env.PELARGO_API_URL!;
const PELARGO_MERCHANT_KEY = process.env.PELARGO_MERCHANT_KEY!;

async function createPelargoSession(order: {
  id: string;
  amount: string;
  amountAtomic: string;
  destinationAsset: string;
  destinationSymbol: string;
  destinationNetwork: string;
  recipient: string;
}) {
  const response = await fetch(new URL("/api/checkout-session", PELARGO_API), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pelargo-merchant-key": PELARGO_MERCHANT_KEY,
    },
    body: JSON.stringify({
      orderId: order.id,
      amount: order.amount,
      amountAtomic: order.amountAtomic,
      destinationAsset: order.destinationAsset,
      destinationSymbol: order.destinationSymbol,
      destinationNetwork: order.destinationNetwork,
      recipient: order.recipient,
      expiresInSeconds: 900,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? `Pelargo session request failed: ${response.status}`);
  }
  return payload;
}
```

Expose this through an authenticated route on your own application. That route should load the order from your database rather than trusting amount or recipient values supplied by the browser. Apply your own CSRF protection, authorization and rate limiting.

Sessions expire after 60–1800 seconds; the default is 900 seconds. Duplicate external order IDs for the same merchant are rejected.

## 2. Mount the checkout element

Load the embed bundle from the same Pelargo deployment that serves its API. The custom element derives its API origin from the loaded script URL.

```html
<script type="module" src="https://YOUR_VERIFIED_PELARGO_HOST/pelargo.js"></script>
<div id="pelargo-checkout-slot"></div>
<script type="module">
  const response = await fetch("/api/pelargo/checkout-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderId: "ORDER-123" })
  });
  if (!response.ok) throw new Error("Unable to initialize checkout");

  const { token, session } = await response.json();
  const checkout = document.createElement("pelargo-checkout");
  checkout.setAttribute("merchant-name", session.merchantName);
  checkout.setAttribute("amount", session.amount);
  checkout.setAttribute("order-id", session.orderId);
  checkout.setAttribute("destination-asset", session.destinationAsset);
  checkout.setAttribute("destination-symbol", session.destinationSymbol);
  checkout.setAttribute("destination-network", session.destinationNetwork);
  checkout.setAttribute("recipient", session.recipient);
  checkout.setAttribute("session-token", token);
  checkout.setAttribute("button-label", "Pay with crypto");
  document.querySelector("#pelargo-checkout-slot").append(checkout);
</script>
```

The element name is `<pelargo-checkout>`. The React checkout is mounted inside Shadow DOM. It renders a Pay with crypto launcher and opens a modal/bottom sheet. Set attributes before appending the element.

The bundle is built from `src/embed.tsx` using `bun run build:embed`; the complete app build is `bun run build`. The package is not currently published as a stable SDK/CDN product. Confirm the actual deployment artifact and URL before using it.

## 3. API reference

All merchant endpoints require `X-Pelargo-Merchant-Key`, except the public asset-discovery and quote routes described below. Merchant lookups are scoped to the authenticated merchant.

### `POST /api/checkout-session`

Creates a merchant order and signed checkout session.

Required JSON:
- `orderId`: merchant's external order reference.
- `amount`: positive decimal display amount.
- `amountAtomic`: positive integer string in destination token base units.
- `destinationAsset`: exact NEAR Intents asset ID.
- `destinationSymbol` and `destinationNetwork`.
- `recipient`: destination receiving address.

Optional: `expiresInSeconds` (60–1800; default 900).

Returns HTTP 201 with a signed `token` and public `session` claims. Duplicate order references for one merchant return HTTP 409. The API resolves merchant identity from the stored API-key hash, not from browser input.

### `GET /api/checkout-session?token=...`

Validates a signed session and returns public order claims. The token is a bearer credential and must be protected from unnecessary logging.

### `GET /api/tokens`

Proxies supported-token discovery from NEAR Intents / 1Click. Provider availability is dynamic; it is not a guarantee that every token/network pair will remain routable.

### `POST /api/quote`

Accepts a signed checkout session and a quote request. Pelargo validates the session signature and persisted active session, then binds the destination asset, recipient and exact output amount to the merchant-created order. The buyer can select a supported source asset and provide a refund address.

The widget currently requests dry quotes only. A dry quote is a preview; it does not create deposit instructions or prove payment. A committed quote can create real deposit instructions and potentially irreversible transfers. Keep committed mainnet quotes disabled.

For committed quote handling, Pelargo consumes the session before contacting 1Click, overwrites the provider `sessionId` with the server-issued session JTI, and requires a provider correlation ID and deposit details before persisting the quote. An ambiguous upstream response leaves the session consumed; never retry automatically.

### `GET /api/order?orderId=...`

Returns the authenticated merchant's stored order and current database status. An order belonging to another merchant returns 404. Session tokens are not returned.

### `GET /api/payment-status?orderId=...`

Polls the configured Intents provider using the persisted deposit address and optional memo. Provider status and destination transaction candidate are stored with concurrency guards. Provider `SUCCESS` is not sufficient to mark an order paid.

For NEAR NEP-141 destinations, Pelargo selects the signer lookup and canonical NEAR RPC for the configured provider network. Mainnet signer lookup uses NearScanner; testnet lookup is configured for NearBlocks v3 `GET /v3/txns/{hash}`. These external response contracts are currently mocked in CI and have not been validated against a live Pelargo transaction. Canonical NEAR RPC must independently verify finalized transaction/receipt execution and the exact token contract, recipient and net amount. Verified evidence must match the order and stored transaction candidate before the database marks it paid. Other destination networks/token standards fail closed.

### `GET /api/operator/recovery-cases`

Operator-only, read-only endpoint authenticated with `X-Pelargo-Provisioning-Key`. Returns open uncertain committed-quote recovery cases. It is not a merchant endpoint. Do not expose the provisioning secret to the browser or merchant clients.

### Retired route: `GET /api/status`

Returns HTTP 410. Do not integrate with this legacy unauthenticated provider proxy. Use the merchant-authenticated `GET /api/payment-status` endpoint.

## 4. Payment lifecycle and failure handling

A quote or deposit address is not proof of payment. A provider status of `SUCCESS` is only a candidate until the destination transaction is independently verified. The database only synchronizes an order to `paid` after matching settlement evidence is persisted.

`FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never be presented as paid. If a committed quote request times out or returns an ambiguous response, do not create a second quote using the same order/session. Pelargo records stale uncertain commit cases for operator investigation; it does not automatically retry or reactivate the session.

Merchant webhooks/callbacks are not implemented. Merchants must currently poll their authenticated order/payment endpoints.

## 5. Deployment prerequisites and current limits

The target Pages environment needs:
- D1 binding named `DB`, with the required migrations applied.
- `MERCHANT_PROVISIONING_SECRET` for operator provisioning and recovery access.
- `ORDER_SESSION_SECRET` with high entropy (at least 32 characters).
- A provisioned merchant and its API key stored server-side.
- `NEARSCANNER_API_KEY` for NearScanner signer lookup; the user reports that this secret has been added to Cloudflare.
- Optional `NEAR_RPC_URL` and `NEARSCANNER_TX_API_URL` endpoint overrides.

Repository migrations currently run through `0011`. The isolated preview D1 migration history was verified through 0011 on 5 November 2026. Production migration state is separate and must be checked before release. The expiry/recovery Worker code and five-minute cron configuration exist, but the Worker has not been deployed and its cron is not active.

Tests in `bun run test:security` and `bun run test:api` use in-memory SQLite and mocked provider/indexer/RPC responses. They do not prove live Tidepool/1Click, NearBlocks/NearScanner authentication or response compatibility, NEAR RPC or deployed Pages runtime compatibility. Preview build and deployment have passed, but live API requests through Preview remain outstanding. Preview HTTP runtime testing remains outstanding.

Current product limitations:
- NEAR mainnet NEP-141 is the only implemented destination settlement verifier.
- EVM, Solana, Bitcoin and other settlement verifiers are not implemented.
- No self-serve merchant onboarding or credential rotation.
- No merchant webhooks.
- No production rate limiting/admin controls.
- No published stable SDK/CDN package.
- No live end-to-end payment validation.

Keep `ALLOW_MAINNET_DEPOSITS` unset. Do not use this prototype to collect real customer funds.
