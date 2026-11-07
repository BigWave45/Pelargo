# Merchant integration guide

## Buyer checkout capabilities

The embedded widget supports source-asset selection, dry quote preview and an explicit buyer confirmation before requesting a committed quote. A committed quote creates provider deposit instructions; it does not itself send funds. The current draft branch also supports an optional injected EIP-1193 wallet transfer for eligible Base Sepolia ERC-20 quotes: it uses the exact provider asset contract, committed deposit address and exact atomic source amount. MetaMask asynchronous provider detection is hardened. The manual deposit-address path remains available. WalletConnect and non-EVM wallet signing are not implemented. Before showing instructions, the widget validates the provider correlation ID, deposit address and exact positive atomic source amount.

After instructions are created, the widget polls `GET /api/payment-status?orderId=...` every five seconds with the signed checkout session in the `Authorization: Bearer` header. The API verifies the signature, stored token hash, committed session state and order binding. A buyer session cannot query another order. Merchant server-side polling continues to use `x-pelargo-merchant-key`.

Provider `SUCCESS` alone is insufficient. The order becomes paid only after independent destination-chain verification succeeds and matching settlement evidence is persisted. The buyer widget displays the internal payment state and stops polling on terminal states or an invalid/unauthorized session.

The live testnet route has since been demonstrated on ORDER-35541967. Preview D1 records both immutable Base Sepolia source-deposit evidence and independently verified NEAR NEP-141 destination settlement evidence for that order. The order is paid/settled and provider status is SUCCESS. A later order, ORDER-45723806, is also paid/settled with destination evidence and provider SUCCESS, but it has no source-deposit evidence row. Keep these evidence states distinct. The successful test proves one supported testnet route, not production readiness, broad network coverage or scheduled Worker operation. Do not use this integration to collect real customer funds.



### Wallet-first checkout (partially implemented; acceptance pending)

The implemented first wallet path is Base Sepolia using injected EIP-1193 wallets. Treat wallet connection, chain/address detection, supported-token balance discovery and transaction execution as separate capabilities. A connected address and visible balance do not establish that a payment was detected or settled.

The current direct signing path is intentionally limited to the provider's committed deposit-address model. For an eligible Base Sepolia ERC-20 asset, the widget constructs the standard token transfer to the provider-issued deposit address using the exact committed amount. It does not assume provider-supplied calldata. Quotes with memo/tag requirements remain on the manual path. Any new provider adapter must independently validate its deposit semantics before enabling this wallet path.

The intended buyer sequence is: open checkout; explicitly choose Connect wallet; connect a supported Base wallet; detect the connected network and eligible balances; request/refresh a quote; show the source amount, merchant settlement amount, fees/route and expiry; ask the wallet to approve the exact transaction; track provider and destination settlement states. Handle wrong-network, insufficient-balance, rejected-signature, expired-quote, pending, failed and completed states explicitly.

The direct Base Sepolia wallet transfer is implemented but still requires mobile browser acceptance, provider deposit detection and independent NEAR settlement verification on a fresh order. Never claim automatic wallet discovery, arbitrary-wallet support or universal network coverage. Keep merchant API keys server-side and preserve the current signed checkout-session authorization boundary.

## Security model

The merchant dashboard uses a separate opaque, server-side session stored in an HttpOnly, Secure, SameSite=Lax cookie. Passwords are PBKDF2-hashed; session tokens are random and only their SHA-256 hashes are stored. Registration and login attempts are rate-limited. The browser never receives the merchant API key.

For server integrations, the merchant server owns the merchant API key and decides the trusted order amount, destination asset and receiving address. The browser receives only a short-lived signed checkout-session token and public order claims.

Never expose the merchant API key, `MERCHANT_PROVISIONING_SECRET`, `ORDER_SESSION_SECRET` or `NEAR_INDEXER_API_KEY` to browser code, HTML attributes, public repositories or Vite `VITE_*` variables. The short-lived signed checkout-session token is the deliberate exception: it is a one-order bearer credential and must be delivered to the buyer widget for quote and status authorization. Do not confuse it with a merchant API key. Keep its lifetime short, avoid logging it, and do not reuse it. The hosted checkout currently carries it in the URL fragment, removes it from browser history immediately, and sends it to the API in an Authorization header. A fragment is not sent in the HTTP request, but the link remains transferable to anyone who obtains it. The server validates its signature, stored hash, status, expiry and order binding on every protected operation.

The signed session binds the merchant, order, amount, destination asset and recipient. Do not accept those authorization values from untrusted browser input. The buyer may select a supported source asset and provide a source refund address.

## Self-service merchant accounts

The dashboard supports open merchant registration and password login. Registration creates a merchant record and an internal API key whose hash is stored server-side; the plaintext key is not returned during registration. After signing in, a merchant can use `POST /api/merchant-api-key` to issue or rotate the key. The plaintext is returned once in a `Cache-Control: no-store` response and is not persisted in browser storage. Rotation immediately invalidates the previous key. Dashboard requests authenticate with the merchant session cookie. The dashboard can save a NEAR settlement asset ID, symbol, network, token decimals and recipient, create a signed checkout session, and list merchant-scoped orders.

- `POST /api/auth/register` — create an account with `name`, `email`, and a password of 12–128 characters. Returns the merchant profile and sets the session cookie.
- `POST /api/auth/login` — authenticate with email and password; sets a new session cookie.
- `GET /api/auth/session` — return the current merchant profile.
- `POST /api/auth/logout` — revoke the current server-side session and clear the cookie.
- `GET/PUT /api/merchant-settings` — read or save the merchant's destination configuration.
- `GET /api/orders` — list up to 100 recent orders belonging to the authenticated merchant.

Sessions last seven days. Registration is limited to five attempts per email/IP per hour; login is limited to ten attempts per email/IP per 15 minutes. Email verification and multi-user merchant accounts are not implemented. Merchant API-key issuance and rotation are implemented through the Developers section and `POST /api/merchant-api-key`. Preview password recovery is implemented and has been exercised successfully: a one-time token is emitted to restricted Cloudflare Pages Preview runtime logs, expires after 30 minutes, and can be redeemed once; redemption updates the password and revokes prior sessions. No email delivery is configured, so this is an operator-assisted Preview recovery mechanism, not a production customer recovery channel. The destination asset ID and decimal precision must be confirmed against the active provider token catalogue; the form does not independently prove a token/recipient combination is settleable.

The operator-only `POST /api/merchant` provisioning endpoint remains available for internal setup and existing server integrations. It is not the public signup flow.

### Merchant API key issuance

After signing in to the merchant workspace, generate a server credential from the Developers section. The dashboard calls:

`POST /api/merchant-api-key`

Authentication: the dashboard's HttpOnly merchant session cookie. The request must be same-origin and has no body.

A successful response contains `apiKey` and a warning. The key is shown once. Store it in your server-side secret manager, for example as `PELARGO_MERCHANT_API_KEY`. Do not store it in local storage, ship it in frontend code, commit it to source control or expose it in a `VITE_*` variable. Calling this endpoint again rotates the credential and invalidates the previous key. If the response is lost, generate a new key; the previous plaintext cannot be recovered.

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
  checkout.setAttribute("session-expires-at", session.expiresAt);
  checkout.setAttribute("button-label", "Pay with crypto");
  document.querySelector("#pelargo-checkout-slot").append(checkout);
</script>
```

The element name is `<pelargo-checkout>`. The React checkout is mounted inside Shadow DOM. It renders a Pay with crypto launcher and opens a modal/bottom sheet. Set attributes before appending the element. Pass the server-returned `session.expiresAt` as `session-expires-at` so the buyer UI can warn when the signed session expires. The server remains authoritative and rejects expired sessions regardless of the client display.

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

### `GET /api/checkout-session`

Validates a signed session and returns public order claims. Send the short-lived token in `Authorization: Bearer <token>`. The hosted checkout currently reads the token from the URL fragment (`#checkout=...`), removes it from browser history, and then sends it in the Authorization header. Do not use the legacy query-string token form.

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

For NEAR NEP-141 destinations, Pelargo resolves a transaction signer and then uses canonical NEAR RPC to verify finalized transaction/receipt execution and the exact token contract, recipient and net amount. Signer lookup and provider transaction candidates are hints, not settlement proof. Verified evidence must match the order and stored transaction candidate before the database marks it paid. Other destination networks/token standards fail closed.

### `GET /api/operator/recovery-cases`

Operator-only, read-only endpoint authenticated with `X-Pelargo-Provisioning-Key`. Returns open uncertain committed-quote recovery cases. It is not a merchant endpoint. Do not expose the provisioning secret to the browser or merchant clients.

### Retired route: `GET /api/status`

Returns HTTP 410. Do not integrate with this legacy unauthenticated provider proxy. Use the merchant-authenticated `GET /api/payment-status` endpoint.

## 4. Payment lifecycle and failure handling

A quote or deposit address is not proof of payment. A provider status of `SUCCESS` is only a candidate until the destination transaction is independently verified. The database only synchronizes an order to `paid` after matching settlement evidence is persisted.

`FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never be presented as paid. If a committed quote request times out or returns an ambiguous response, do not create a second quote using the same order/session. Pelargo records stale uncertain commit cases for operator investigation; it does not automatically retry or reactivate the session.

Merchant webhooks/callbacks are not implemented. Merchants must currently poll their authenticated order/payment endpoints.

## 5. Current deployment requirements and limits

The Preview Pages environment requires:
- A D1 binding named DB with the migrations required by the deployed code.
- MERCHANT_PROVISIONING_SECRET and ORDER_SESSION_SECRET configured as server-side secrets.
- The appropriate NEAR RPC and signer-indexer configuration for the selected provider network.
- A provisioned merchant account and its API key stored only on the merchant server.

Do not copy secret values into this guide, browser code, Vite VITE_* variables or public repositories. Preview and Production use separate resources; do not apply migrations or change bindings in Production as part of Preview testing.

The supported destination settlement verifier is NEAR NEP-141. The direct wallet transfer path is limited to eligible provider-listed Base Sepolia ERC-20 source assets. Provider route availability is dynamic. Pelargo does not currently provide arbitrary-chain settlement verification, automatic provider failover, route comparison or a Pelargo-operated liquidity engine.

The testnet route demonstrated on ORDER-35541967 has both source and destination evidence. ORDER-45723806 has destination evidence but no source-evidence row. These are distinct records and must not be conflated. A successful scheduled reconciliation run and independent external merchant-origin acceptance are separate checks; do not infer either from the successful payment record.

## 6. Wallet connection status

The current implementation supports injected EIP-1193 wallets on Base Sepolia for eligible ERC-20 quotes. The manual deposit-address path remains available.

Reown AppKit is integrated in the development Preview. `src/lib/appkit.ts` initializes `@reown/appkit` with `EthersAdapter`, the user-provided Project ID and Base Sepolia as the only configured network. `src/main.tsx` loads the initialization before rendering the app. The checkout uses `useAppKit`, `useAppKitAccount`, `useAppKitProvider("eip155")` and `useAppKitNetwork`. Its balance reads, network checks and exact-amount ERC-20 transfer continue through the EIP-1193 provider. An injected provider remains a fallback, and manual deposit remains available.

The Cloudflare Pages Preview build passed for commit `f95404888e8183c3b9ba031f9a28e1ed89419acf`. Still required: mobile WalletConnect connection, account-change, disconnect/reconnect and network-switch checks, followed by an explicitly approved exact-quote testnet transfer. Keep the connector restricted to Base Sepolia. Reown adds wallet-connection options only; it does not expand supported assets, routes or destination verifiers.

## 7. Hosted checkout URL and current integration status

The hosted checkout receives the short-lived buyer token in the URL fragment (for example, #checkout=<token>). The browser reads the fragment, removes it from browser history and then calls GET /api/checkout-session with Authorization: Bearer <token>. New integrations should use this fragment pattern, not a query-string token.

The fragment reduces exposure through ordinary HTTP request logs and referrer headers. It does not make the link private: anyone who obtains an unexpired checkout URL can use that bearer token. Do not publish checkout links or send them to analytics.

The custom-element embed exists in the repository, but no stable versioned SDK/CDN package, Shopify/WooCommerce plugin or merchant webhook delivery is released. Confirm the actual deployed pelargo.js artifact before using it. The external merchant-origin flow still requires a separate acceptance test.

## 8. Current Preview route and release safeguards

The current Preview URL is https://design-blue-white-premium.pelargo.pages.dev. Verify that the latest successful Cloudflare Pages deployment corresponds to the intended branch head before using the URL for acceptance testing.

The current development branch is design/blue-white-premium. The existing Cloudflare Pages production branch is build/live-intents; GitHub main contains an older generated version. Do not merge, change the production branch, configure a public domain, deploy Production, modify Production D1 or enable mainnet without explicit approval.

Keep ALLOW_MAINNET_DEPOSITS unset. Do not use Preview to collect real customer funds. Do not initiate another test payment solely to repeat the route already demonstrated.
