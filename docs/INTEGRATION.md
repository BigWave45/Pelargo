# Merchant integration guide

## Buyer checkout capabilities

The embedded widget supports source-asset selection, dry quote preview and an explicit buyer confirmation before requesting a committed quote. A committed quote creates provider deposit instructions; it does not send funds. Before showing instructions, the widget validates the provider correlation ID, deposit address and exact positive atomic source amount. It displays the committed amount, address, optional memo and deadline, with copy controls. The buyer must manually send the exact testnet asset and amount using a wallet on the selected source network.

After instructions are created, the widget polls `GET /api/payment-status?orderId=...` every five seconds with the signed checkout session in the `Authorization: Bearer` header. The API verifies the signature, stored token hash, committed session state and order binding. A buyer session cannot query another order. Merchant server-side polling continues to use `x-pelargo-merchant-key`.

Provider `SUCCESS` alone is insufficient. The order becomes paid only after independent destination-chain verification succeeds and matching settlement evidence is persisted. The buyer widget displays the internal payment state and stops polling on terminal states or an invalid/unauthorized session.

The buyer committed-quote and polling paths have mocked integration coverage. A live testnet payment has also been executed for ORDER-83587591: Pelargo verified the Base Sepolia source deposit, then independently verified the exact NEAR NEP-141 destination transfer through canonical NEAR RPC and persisted immutable settlement evidence in Preview D1. The merchant has since signed in successfully and reports that the latest status read displays settled. This proves one testnet payment path, not production readiness or the scheduled Worker's operation. Do not use this integration to collect real customer funds.

## Security model

The merchant dashboard uses a separate opaque, server-side session stored in an HttpOnly, Secure, SameSite=Lax cookie. Passwords are PBKDF2-hashed; session tokens are random and only their SHA-256 hashes are stored. Registration and login attempts are rate-limited. The browser never receives the merchant API key.

For server integrations, the merchant server owns the merchant API key and decides the trusted order amount, destination asset and receiving address. The browser receives only a short-lived signed checkout-session token and public order claims.

Never expose the merchant API key, `MERCHANT_PROVISIONING_SECRET`, `ORDER_SESSION_SECRET` or `NEAR_INDEXER_API_KEY` to browser code, HTML attributes, public repositories or Vite `VITE_*` variables. Treat the session token as a one-order bearer credential: do not log it unnecessarily or reuse it.

The signed session binds the merchant, order, amount, destination asset and recipient. Do not accept those authorization values from untrusted browser input. The buyer may select a supported source asset and provide a source refund address.

## Self-service merchant accounts

The dashboard supports open merchant registration and password login. A new account creates a merchant record and an internal API key whose hash is stored server-side; the plaintext key is not returned to the browser. Dashboard requests authenticate with the merchant session cookie. The dashboard can save a NEAR settlement asset ID, symbol, network, token decimals and recipient, create a signed checkout session, and list merchant-scoped orders.

- `POST /api/auth/register` — create an account with `name`, `email`, and a password of 12–128 characters. Returns the merchant profile and sets the session cookie.
- `POST /api/auth/login` — authenticate with email and password; sets a new session cookie.
- `GET /api/auth/session` — return the current merchant profile.
- `POST /api/auth/logout` — revoke the current server-side session and clear the cookie.
- `GET/PUT /api/merchant-settings` — read or save the merchant's destination configuration.
- `GET /api/orders` — list up to 100 recent orders belonging to the authenticated merchant.

Sessions last seven days. Registration is limited to five attempts per email/IP per hour; login is limited to ten attempts per email/IP per 15 minutes. Email verification, API-key rotation and multi-user merchant accounts are not implemented. Preview password recovery is implemented and has been exercised successfully: a one-time token is emitted to restricted Cloudflare Pages Preview runtime logs, expires after 30 minutes, and can be redeemed once; redemption updates the password and revokes prior sessions. No email delivery is configured, so this is an operator-assisted Preview recovery mechanism, not a production customer recovery channel. The destination asset ID and decimal precision must be confirmed against the active provider token catalogue; the form does not independently prove a token/recipient combination is settleable.

The operator-only `POST /api/merchant` provisioning endpoint remains available for internal setup and existing server integrations. It is not the public signup flow.

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

Merchant order/session endpoints accept either `X-Pelargo-Merchant-Key` for server integrations or the dashboard's HttpOnly merchant session cookie. Payment-status polling accepts the merchant API key, dashboard session cookie, or a signed committed checkout session for buyer-scoped polling. Asset discovery and quote requests use their documented public/session authentication. Merchant lookups are scoped to the authenticated merchant.

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

Returns HTTP 201 with a signed `token` and public `session` claims. Duplicate order references for one merchant return HTTP 409. The API resolves merchant identity from the stored API-key hash or authenticated dashboard session, never from browser-supplied merchant IDs.

### `GET /api/checkout-session?token=...`

Validates a signed session and returns public order claims. The token is a bearer credential and must be protected from unnecessary logging.

### `GET /api/tokens`

Proxies supported-token discovery from NEAR Intents / 1Click. Provider availability is dynamic; it is not a guarantee that every token/network pair will remain routable.

### `POST /api/quote`

Accepts a signed checkout session and a quote request. Pelargo validates the session signature and persisted active session, then binds the destination asset, recipient and exact output amount to the merchant-created order. The buyer can select a supported source asset and provide a refund address.

The widget requests a dry quote first. A dry quote is a preview; it does not create deposit instructions or prove payment. After explicit buyer confirmation, the widget can request a committed quote, which can create real deposit instructions and potentially irreversible transfers. Keep committed mainnet quotes disabled.

For committed quote handling, Pelargo consumes the session before contacting 1Click, overwrites the provider `sessionId` with the server-issued session JTI, and requires a provider correlation ID and deposit details before persisting the quote. An ambiguous upstream response leaves the session consumed; never retry automatically.

### `GET /api/orders`

Returns up to 100 recent orders for the authenticated merchant dashboard session.

### `GET/PUT /api/merchant-settings`

Reads or persists the authenticated merchant's business name, destination asset ID, symbol, network, token decimals and recipient.

### `GET /api/order?orderId=...`

Returns the authenticated merchant's stored order and current database status. An order belonging to another merchant returns 404. Session tokens are not returned.

### `GET /api/payment-status?orderId=...`

Polls the configured Intents provider using the persisted deposit address and optional memo. Merchant requests authenticate with `x-pelargo-merchant-key`; buyer requests authenticate with the signed checkout session in `Authorization: Bearer`. Buyer sessions are restricted to their own committed order. Provider status and destination transaction candidate are stored with concurrency guards. Provider `SUCCESS` is not sufficient to mark an order paid.

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

The target Preview Pages environment needs:
- D1 binding named `DB`, with the required migrations applied.
- `MERCHANT_PROVISIONING_SECRET` for operator provisioning and recovery access.
- `ORDER_SESSION_SECRET` with high entropy (at least 32 characters).
- A provisioned merchant and its API key stored server-side.
- `NEARSCANNER_API_KEY` for NearScanner signer lookup; the user reports that this secret has been added to Cloudflare.
- Optional `NEAR_RPC_URL` and `NEARSCANNER_TX_API_URL` endpoint overrides.

The active branch contains migrations `0001` through `0019`. Preview D1 migration `0017` was applied and read back successfully. Migration `0019` application remains unverified. Preview password recovery has been exercised successfully, which confirms the deployed reset path and its required database state are functioning; do not infer that every later migration is applied. Production migration state is separate and must not be changed during hackathon testing.

A Preview-only background reconciliation Worker and manual GitHub Actions deployment workflow exist. The workflow has not been dispatched. Worker deployment, encrypted `RECONCILIATION_SECRET` installation and five-minute cron activation are not confirmed. Dispatching the workflow also activates the existing Preview expiry and uncertain quote-commit recovery sweeps; review that side effect before authorization.

Tests in `bun run test:security` and `bun run test:api` use in-memory SQLite and mocked provider/indexer/RPC responses. They do not prove live provider, indexer, RPC or scheduled Worker behavior. One live testnet payment, ORDER-83587591, has completed canonical NEAR NEP-141 settlement verification and immutable evidence persistence in Preview D1. The merchant has signed in successfully and reports the latest status read as settled. CI and Preview deployment for the subsequent settled-read immutability commits still need verification.

Current product limitations:
- NEAR NEP-141 is the only implemented destination settlement verifier; the active demo is on NEAR testnet.
- EVM, Solana, Bitcoin, native NEAR and other destination settlement verifiers are not implemented.
- Email delivery for password recovery is not configured; Preview recovery is operator-assisted.
- Merchant webhooks are not implemented.
- API-key rotation and multi-user merchant accounts are not implemented.
- No published stable SDK/CDN package.
- The complete merchant-to-embedded-widget flow still needs a clean, reproducible submission demonstration.

Keep `ALLOW_MAINNET_DEPOSITS` unset. Do not use this prototype to collect real customer funds.
