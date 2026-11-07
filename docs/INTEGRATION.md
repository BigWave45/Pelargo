# Merchant integration guide

## Buyer checkout capabilities

The embedded widget supports source-asset selection, dry quote preview and an explicit buyer confirmation before requesting a committed quote. A committed quote creates provider deposit instructions; it does not itself send funds. The current draft branch also supports an optional injected EIP-1193 wallet transfer for eligible Base Sepolia ERC-20 quotes: it uses the exact provider asset contract, committed deposit address and exact atomic source amount. MetaMask asynchronous provider detection is hardened. The manual deposit-address path remains available. WalletConnect and non-EVM wallet signing are not implemented. Before showing instructions, the widget validates the provider correlation ID, deposit address and exact positive atomic source amount.

After instructions are created, the widget polls `GET /api/payment-status?orderId=...` every five seconds with the signed checkout session in the `Authorization: Bearer` header. The API verifies the signature, stored token hash, committed session state and order binding. A buyer session cannot query another order. Merchant server-side polling continues to use `x-pelargo-merchant-key`.

Provider `SUCCESS` alone is insufficient. The order becomes paid only after independent destination-chain verification succeeds and matching settlement evidence is persisted. The buyer widget displays the internal payment state and stops polling on terminal states or an invalid/unauthorized session.

The buyer committed-quote and polling paths have mocked integration coverage. A live testnet payment has also been executed for ORDER-83587591: Pelargo verified the Base Sepolia source deposit, then independently verified the exact NEAR NEP-141 destination transfer through canonical NEAR RPC and persisted immutable settlement evidence in Preview D1. The merchant has since signed in successfully. The 7 November dashboard history shows six records: one settled, three awaiting deposit, and two expired. The three awaiting-deposit records are unpaid checkouts; the two expired records are terminal expiries. This UI snapshot is distinct from a fresh D1 audit and does not prove the scheduled Worker's operation. This proves one testnet payment path, not production readiness. Do not use this integration to collect real customer funds.



### Wallet-first checkout (partially implemented; acceptance pending)

The implemented first wallet path is Base Sepolia using injected EIP-1193 wallets. Treat wallet connection, chain/address detection, supported-token balance discovery and transaction execution as separate capabilities. A connected address and visible balance do not establish that a payment was detected or settled.

The current direct signing path is intentionally limited to the provider's committed deposit-address model. For an eligible Base Sepolia ERC-20 asset, the widget constructs the standard token transfer to the provider-issued deposit address using the exact committed amount. It does not assume provider-supplied calldata. Quotes with memo/tag requirements remain on the manual path. Any new provider adapter must independently validate its deposit semantics before enabling this wallet path.

The intended buyer sequence is: open checkout; explicitly choose Connect wallet; connect a supported Base wallet; detect the connected network and eligible balances; request/refresh a quote; show the source amount, merchant settlement amount, fees/route and expiry; ask the wallet to approve the exact transaction; track provider and destination settlement states. Handle wrong-network, insufficient-balance, rejected-signature, expired-quote, pending, failed and completed states explicitly.

The direct Base Sepolia wallet transfer is implemented but still requires mobile browser acceptance, provider deposit detection and independent NEAR settlement verification on a fresh order. Never claim automatic wallet discovery, arbitrary-wallet support or universal network coverage. Keep merchant API keys server-side and preserve the current signed checkout-session authorization boundary.

## Security model

The merchant dashboard uses a separate opaque, server-side session stored in an HttpOnly, Secure, SameSite=Lax cookie. Passwords are PBKDF2-hashed; session tokens are random and only their SHA-256 hashes are stored. Registration and login attempts are rate-limited. The browser never receives the merchant API key.

For server integrations, the merchant server owns the merchant API key and decides the trusted order amount, destination asset and receiving address. The browser receives only a short-lived signed checkout-session token and public order claims.

Never expose the merchant API key, `MERCHANT_PROVISIONING_SECRET`, `ORDER_SESSION_SECRET` or `NEAR_INDEXER_API_KEY` to browser code, HTML attributes, public repositories or Vite `VITE_*` variables. The short-lived signed checkout-session token is the deliberate exception: it is a one-order bearer credential and must be delivered to the buyer widget for quote and status authorization. Do not confuse it with a merchant API key. Keep its lifetime short, avoid logging it, do not put it in URLs, do not reuse it, and avoid exposing it to unrelated third-party scripts. The server validates its signature, stored hash, status, expiry and order binding on every protected operation.

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

The active branch contains migrations `0001` through `0020`. A read-only query of the Preview D1 `d1_migrations` table on 7 November confirmed migrations `0001` through `0019` were applied before the new resumable-scan migration was added. Migration `0020_persisted_near_signer_scan.sql` is pending Preview application and verification. The records for `0019_reconciliation_backfill_eligible_states.sql` and `0018_preview_password_reset.sql` appear as IDs 18 and 19 respectively because they were applied in that order. This confirms the migration ledger, not the correctness of every runtime behavior. Production migration state is separate and was not queried or changed.

A Preview-only background reconciliation Worker is deployed as `pelargo-expiry-sweeper-preview` (deployment `52733dc2-06be-4c7d-9a51-7e7c1a433074`), and Cloudflare previously confirmed its five-minute cron (`*/5 * * * *`) is active. The encrypted `RECONCILIATION_SECRET` value cannot be read back through the Cloudflare API; its installation must be confirmed through a successful authenticated Worker invocation or equivalent runtime evidence. A successful scheduled settlement run has not been established. The Worker also runs abandoned-checkout expiry and uncertain quote-commit recovery sweeps, so any redeployment or activation must account for those side effects.

Tests in `bun run test:security` and `bun run test:api` use in-memory SQLite and mocked provider/indexer/RPC responses. They do not prove live provider, indexer, RPC or scheduled Worker behavior. One live testnet payment, ORDER-83587591, has completed canonical NEAR NEP-141 settlement verification and immutable evidence persistence in Preview D1. The merchant has signed in successfully and reports the latest status read as settled. CI and Preview deployment for the subsequent settled-read immutability commits still need verification.

Current product limitations:
- NEAR NEP-141 is the only implemented destination settlement verifier; the active demo is on NEAR testnet.
- EVM, Solana, Bitcoin, native NEAR and other destination settlement verifiers are not implemented.
- Email delivery for password recovery is not configured; Preview recovery is operator-assisted.
- Merchant webhooks are not implemented.
- Multi-user merchant accounts are not implemented. API-key issuance and rotation are implemented, but the authenticated rotation flow has not yet been exercised end-to-end in a merchant browser session.
- No published stable SDK/CDN package.
- The complete merchant-to-embedded-widget flow still needs an independent merchant-origin browser acceptance test using a real merchant-created session. A Preview deployment and a bundle smoke test do not prove this end-to-end flow.

Keep `ALLOW_MAINNET_DEPOSITS` unset. Do not use this prototype to collect real customer funds.


### Base Sepolia connected-wallet payment (implemented in the current draft branch; end-to-end verification pending)

The embedded buyer checkout now supports an injected EIP-1193 wallet on Base Sepolia for source assets whose provider asset ID matches the Base Sepolia OMFT ERC-20 format. The buyer explicitly connects a wallet, the widget detects the account and chain, and the widget reads the exact token balance through `eth_call`. The wallet must be on Base Sepolia (chain ID 84532 / `0x14a34`). The widget derives the token contract from the selected provider asset ID, not from a user-entered contract address.

After the existing committed 1Click quote returns a deposit address and exact `amountIn`, the buyer may approve a standard ERC-20 `transfer(address,uint256)` through the wallet. The recipient and amount are taken from the committed provider quote. The wallet account must match the refund address used to create the quote. Quotes with a deposit memo are excluded from direct wallet transfer and retain the manual instructions path. A connected wallet, visible balance or submitted transaction hash is not proof of payment.

The current flow relies on provider deposit detection and existing `GET /api/payment-status` polling. Pelargo's independent destination-chain verifier remains the only authority for marking an order paid. The manual deposit-address flow remains available as fallback. The implementation is deployed to Cloudflare Pages Preview at `https://design-blue-white-premium.pelargo.pages.dev`. Provider detection now waits for MetaMask's asynchronous `ethereum#initialized` event and rechecks the injected provider. This addresses a likely mobile initialization race but does not prove on-device connection. It supports injected EVM wallets only; WalletConnect, mobile deep links, Solana/NEAR signing and arbitrary-chain execution are not implemented. Preview browser acceptance and a fresh end-to-end wallet payment test remain outstanding.


## Provider dependency and supported-coverage limits

Pelargo's current source routing and deposit execution are coupled to the configured NEAR Intents / 1Click integration through Tidepool's testnet environment. The provider supplies the supported source-token catalogue, route availability, quote data, deposit address, exact source amount and provider-side deposit lifecycle. The `GET /api/tokens` response is therefore a provider-derived catalogue, not a Pelargo guarantee of universal token or network support.

A source token appearing in the catalogue does not guarantee that every destination can be reached, that every route will be quotable at all times, or that Pelargo can independently verify the destination settlement. The only implemented destination settlement verifier is NEAR NEP-141. Other destination standards fail closed.

The current wallet transfer path is narrower still: injected EIP-1193 wallets on Base Sepolia, for provider-listed Base Sepolia ERC-20 assets matching the recognized asset-ID format. Wallet connection compatibility and provider route compatibility are independent. Adding WalletConnect or another wallet connector would not add provider liquidity, new supported assets, new routes or new destination verifiers.

There is no second live provider, automatic provider failover or Pelargo-operated routing/liquidity engine in the current build. The provider adapter boundary is a future extension point, not evidence of provider independence today. Merchant integrations should treat the supported-token endpoint and quote response as authoritative at checkout time and must not hardcode assumptions about universal coverage.


## Provider selection, fallback and network pinning

The Worker supports two allowlisted provider origins through the server-side `INTENTS_API_BASE_URL` setting:

- Official NEAR 1Click mainnet: `https://1click.chaindefuser.com`. This is selected when the setting is unset. Configure the partner JWT only as the encrypted server-side `ONECLICK_JWT` secret when required.
- Tidepool community testnet: `https://www.usetidepool.tech`. This is explicitly configured in the current Preview environment and is the testnet/development fallback.

The provider selector in `functions/_lib/intents.ts` validates the exact HTTPS origin and assigns the network classification. Mainnet committed quotes require the separate `ALLOW_MAINNET_DEPOSITS=true` gate; keep it unset for the hackathon. Testnet commits use `ALLOW_TESTNET_DEPOSITS=true` in Preview.

Only one provider is selected for a given environment/configuration. There is no runtime provider race, health-based failover, quote comparison or automatic retry against a second provider. Tidepool testnet is not a transparent failover for an official 1Click mainnet quote. Provider and network identity must be pinned to every committed quote/order. If a provider is unavailable before quote commitment, an operator may deliberately switch configuration and create a new dry quote in the same supported network environment. Never switch a committed quote, reuse its deposit address with another provider, or automatically create a second committed quote.

Additional providers can be supported through explicit adapters. Before enabling one, validate token ID namespace, chain/network IDs, quote amount semantics, quote signatures, deposit address and memo behavior, deadlines, status transitions, deposit-submit semantics, refund behavior, authentication, fee model and independent destination verification. Do not expose an asset merely because a provider lists it; Pelargo must support its source-deposit handling and destination settlement verification.


## Testnet settlement indexer dependency and recovery

For Tidepool testnet orders, `GET /v0/status` may return both generic `swapDetails` transaction-hash arrays and a Tidepool-specific `tidepool.explorer` array. The latter contains labelled transaction links, including the `swap (execute_intents)` transaction. These labels are useful for candidate selection and operator diagnostics, but they do not prove settlement and do not expose the transaction signer in the documented response.

The current verifier resolves the signer through the configured testnet transaction indexer (NearBlocks v3 by default), then asks canonical NEAR RPC for the exact transaction and verifies finalized execution plus the exact NEP-141 transfer. A public indexer HTTP 429 therefore makes verification temporarily unavailable; it must never cause Pelargo to mark the order paid or to assume the transfer failed.

FastNear Transactions API offers direct transaction lookup by hash on testnet, but its documentation requires an API key. It is not configured as a dependency in the current Preview environment. FastNear NEAR Data API exposes finalized testnet block documents by height and may support a bounded block-window scan to discover a transaction signer without a paid direct-lookup API. That recovery path is not implemented or live-validated. NearScanner's documented indexed API is currently described for mainnet and must not be treated as a testnet fallback without separate confirmation.

Do not weaken settlement verification to accept provider `SUCCESS`, an explorer URL, a transaction hash, or an indexer response as proof. Any discovered signer remains an untrusted hint; canonical NEAR RPC must independently verify finality, successful receipt execution, the configured NEP-141 token contract, exact recipient and exact net amount. Never resubmit a source deposit merely because destination verification is unavailable.
 

## Testnet signer recovery without a paid indexer

For Tidepool testnet only, the verifier now attempts a bounded signer lookup through the configured canonical NEAR RPC when NearBlocks returns a transient 429/5xx/network/timeout error or does not return a matching signer. It uses the provider status `updatedAt` timestamp to binary-search finalized block timestamps, inspects a bounded ±8 block window, and fetches non-empty chunks with bounded concurrency. A signer is accepted only when exactly one transaction matches the requested transaction hash.

The signer recovered from a block/chunk is not settlement evidence. Pelargo must still call canonical `EXPERIMENTAL_tx_status` with `wait_until: FINAL` and verify successful execution plus the exact NEP-141 token contract, recipient, and net amount from successful receipts. If the timestamp is missing/outside the bounded scan window, RPC calls fail, or the hash is not found uniquely, verification remains pending and fails closed. This fallback is not a replacement for a healthy indexer and has not yet been live-validated against the recorded stuck order.

Tidepool's labelled `tidepool.explorer` metadata is preserved in bounded provider diagnostics. A URL labelled `execute_intents` may prioritize its final path-segment hash as a candidate, but the URL and label are untrusted provider hints only. Never infer settlement from them.


The block/chunk fallback is capped to one prioritized candidate per payment-status poll to limit public RPC load. If that candidate is not found, the order remains pending verification; later polls may retry. This deliberately avoids scanning every intermediate provider hash in one request.


### Bounded testnet signer-recovery diagnostics (7 November 2026)

The testnet fallback now scans a configurable, bounded window ending eight blocks after the first finalized block at or after Tidepool's provider update timestamp. The default is 120 blocks (mostly before the provider timestamp), configurable with the server-side `NEAR_TX_RECOVERY_WINDOW_BLOCKS` setting from 8 to 600. The fallback reports the searched height range, block count, and non-empty chunk count in bounded verification diagnostics. It still requires a unique matching transaction signer followed by canonical `EXPERIMENTAL_tx_status` finality and exact NEP-141 receipt verification. The merchant workspace now displays candidate-specific verification stages and bounded scan details on 503 responses. This is diagnostic and recovery coverage, not proof that the existing stuck payment will settle; the fallback has not yet been live-validated against that order. Do not resubmit its source deposit.


### Resumable NEAR signer recovery (7 November 2026)

Migration `0020_persisted_near_signer_scan.sql` is applied to Preview D1. The `pelargo-expiry-sweeper-preview` Worker has been redeployed from `design/blue-white-premium` with the resumable scanner, encrypted `RECONCILIATION_SECRET`, Preview-only D1 binding and five-minute Cron Trigger. GitHub CI and the deployment workflow passed for deployment commit `68680b86`. Each invocation processes at most eight blocks or four chunks and persists the exact candidate, timestamp, search bounds, next height, chunk list/offset and recovered signer. Canonical NEAR RPC finality and exact NEP-141 receipt verification remain mandatory. The deployed Worker reschedules scan-progress jobs four minutes after a run, leaving margin before the next five-minute Cron tick and avoiding a missed tick caused by execution-time jitter. When a candidate's persisted scan is exhausted without a match, payment-status now advances to the next provider-supplied NEAR candidate instead of repeatedly stopping on the exhausted candidate. Live Preview evidence: the 08:10:27 UTC Cron invocation ran the new Worker version, claimed ORDER-35541967, scanned eight finalized blocks and persisted 18 non-empty chunk hashes for the exact candidate. The job was released for the next five-minute run; no signer or settlement has been confirmed yet. The 08:50:28 UTC Cron run processed four chunks from the older block batch (cursor offset 4/11) and scheduled the next attempt for 08:54:28 UTC. No signer has been recovered; the order remains processing. The 08:45:28 UTC Cron run advanced to the next older eight-block batch and persisted 11 additional non-empty chunk hashes for the same candidate. The next attempt is scheduled for 08:49:28 UTC; the order remains processing. The 08:40:28 UTC Cron run completed the remaining two chunks from the first eight-block batch (cursor offset reset to 0/18) without finding the candidate. The next run will continue with the next older eight-block batch; the candidate scan is still within its configured 120-block window. The 08:35:28 UTC Cron run inspected four more chunks for ORDER-35541967 (cursor offset 16/18) and rescheduled the next attempt for 08:39:28 UTC. No signer has been recovered from the first 18 chunks; the next run will finish that batch before moving to older blocks or the next provider candidate. The 08:30:28 UTC Cron run inspected four more chunks for ORDER-35541967 (cursor offset 12/18) and rescheduled the next attempt for 08:34:28 UTC. Provider status remains SUCCESS, but the order is still processing because no exact destination transfer has yet passed canonical verification. The 08:25:28 UTC Cron run inspected four additional chunks for ORDER-35541967 (cursor offset 8/18), returned to the queue without settlement, and scheduled the next run for 08:29:28 UTC. The candidate remains unresolved; canonical transaction status and NEP-141 receipt checks have not passed. The 08:20:28 UTC Cron run claimed ORDER-35541967 again, inspected the next four chunks (cursor offset 4/18), and scheduled the next attempt for 08:24:28 UTC. It also polled the separate ORDER-34416645, which remains awaiting deposit with provider status PENDING_DEPOSIT. ORDER-35541967 remains processing; no signer or exact destination transfer has been verified. ORDER-35541967 has not yet been independently verified or marked paid. Do not resubmit its source deposit.

The testnet fallback stores a durable scan cursor in `payment_reconciliation_jobs` through migration `0020_persisted_near_signer_scan.sql`. Each status poll or scheduled reconciliation invocation processes at most one bounded unit: up to eight blocks or four non-empty chunks. It persists the exact candidate hash, provider timestamp, scan bounds, next block height, chunk list and offset, plus a recovered signer when found. Later invocations resume from that state instead of restarting the full block/chunk scan. This is only signer discovery. The canonical NEAR RPC transaction-status and exact NEP-141 receipt checks remain mandatory before settlement. Preview migration, deployment and live validation remain outstanding; never resubmit ORDER-35541967's source deposit.

The testnet RPC signer-recovery scan now processes blocks nearest the provider timestamp first in batches of eight, inspects non-empty chunks in batches of four, and stops after the first exact transaction-hash match. This avoids fetching every block and chunk in the configured recovery window before checking for a match. Automated verification passed for commit `c021cc9`; Cloudflare Preview deployment is still running at the time of this note. Live validation against ORDER-35541967 remains outstanding. The fallback still does not establish payment until canonical NEAR RPC confirms finality and the exact NEP-141 transfer.


### Recovery of source evidence after provider success

`POST /api/deposit-submit` can now independently verify and persist a Base Sepolia source-deposit receipt even when the provider already reports `SUCCESS`. This recovery path is deliberately non-submitting: after provider success it must not call `deposit/submit` again. It still requires merchant authentication, exact committed quote correlation, the source token contract derived from the committed asset ID, the exact quoted input amount and deposit address, a successful Base Sepolia receipt, at least 12 confirmations, and matching ERC-20 Transfer logs. The immutable source evidence row records the provider's already-successful status. This closes the code-path gap for source evidence recovery; it does not automatically backfill old orders. An authenticated request with the original source transaction hash is required, and no new payment should be sent for recovery.


For an order whose Pelargo lifecycle is already `settled`, the recovery endpoint accepts the request only if the provider status still independently reports `SUCCESS`. Any other provider state is rejected with `SETTLED_ORDER_PROVIDER_MISMATCH`. This allows source-evidence backfill without reopening settlement or resubmitting the already-completed source transfer.

## Verified source and destination evidence for ORDER-35541967

As of 7 November 2026, Preview D1 contains both the source-deposit evidence and destination-settlement evidence for testnet order `ORDER-35541967`. Integrators should distinguish these records: the Base Sepolia source receipt proves the quoted input reached the provider deposit address; the NEAR settlement receipt independently proves the exact destination token transfer to the merchant recipient. Neither provider `SUCCESS` nor a source receipt alone is sufficient to mark the order paid.

The source record is for Base Sepolia transaction `0x886ff617f13d6eddb23d376eaf2437a90082b610f8c006de743b5df1a5464d5c`, token `0x38d81431b9f76d9699af7517040d5221d9dea252`, deposit address `0x8bdce93d4ff3cd7555f5eb1c29dc229e7c719178`, amount `1012633` atomic units (1.012633 USDC), block `55569210`, with 37,260 confirmations and `chain_rpc` verification.

The destination record is for NEAR testnet transaction `9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS`, token contract `usdc.tidepool-sandbox.testnet`, recipient `agentg.testnet`, amount `1000000` atomic units (1 USDC), block `276599398`, with 10,063 confirmations and `chain_rpc` verification. The order reads back as `paid` in `checkout_orders` and `settled` in `payment_lifecycle`.

The post-success source-evidence recovery request is non-submitting: when the provider already reports `SUCCESS`, it verifies and records the original source transaction but does not call `deposit/submit`, re-run destination settlement, or change the existing destination evidence. For this order, the UI confirmed that the provider was not notified again. These values are a verified Preview testnet example, not a guarantee of future route availability or mainnet behavior.


## Buyer checkout link and browser integration security

Create a checkout session server-to-server with POST /api/checkout-session, authenticated using the merchant API key in the x-pelargo-merchant-key header. Keep that merchant key exclusively in the merchant backend. The response includes a signed, short-lived buyer session token and public order details.

For a buyer-facing Pelargo-hosted link, place the buyer token in the URL fragment, not the query string. The browser application reads the fragment and removes it from the visible URL/history before making the session request. It then retrieves the public session with GET /api/checkout-session and an Authorization: Bearer header.

The GET endpoint does not accept the token in a query parameter. The frontend currently supports older ?checkout= links for migration compatibility, but immediately removes the query parameter and sends the token in the Authorization header. New integrations should generate fragment-based links only.

A URL fragment is not included in the HTTP request target and is not ordinarily sent as a referrer. This reduces accidental credential exposure in server access logs and referrer propagation; it does not make the link non-transferable. The signed token is a bearer credential scoped to one merchant order and expires. Anyone who obtains the active link can use it. Do not publish it, log it, place it in analytics events, or store it in persistent browser storage.

The buyer session token is also supplied to the quote API in its request body and to payment-status polling through the Authorization header. Do not expose the merchant API key to buyer-side code.

The embedded checkout currently has no stable published SDK/CDN package or official platform plugins. Treat existing embed examples as implementation guidance for the current Preview build, not as a versioned production distribution. The complete external merchant-origin flow still requires an independent acceptance test.
