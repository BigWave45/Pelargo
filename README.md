# Pelargo

Pelargo is a universal checkout widget powered by NEAR Intents. Its product category is Web3 payments infrastructure: a cross-chain crypto checkout and payment gateway.

Any merchant or application can add a checkout button to an existing website or app. A customer opens Pelargo, chooses a supported token and blockchain they can pay from, and completes payment through a wallet they already use. NEAR Intents routes the payment so the merchant receives the asset configured for settlement.

The widget is the product. The merchant-facing surface exists only to configure checkout and help developers integrate it. Pelargo is not a storefront builder or a full merchant SaaS dashboard.

## Network coverage: routing versus verified settlement

These are separate capabilities:

- Payment routing: source networks and assets shown to a buyer are discovered from live NEAR Intents/1Click availability. A quoted route is not a promise that every route is always available.
- Merchant settlement: Pelargo must independently verify that the configured destination asset reached the merchant's exact address before marking an order paid.
- Currently verified destination: NEAR mainnet NEP-141 tokens only. The verifier checks successful execution, exact token contract, recipient and net atomic amount, including resolver refunds, against finalized NEAR RPC data.
- Planned destination adapters: EVM ERC-20, Solana SPL, then UTXO networks such as Bitcoin. Each requires a chain-specific verifier, finality policy and adversarial tests. These are roadmap targets, not currently supported settlement destinations.

NEAR Intents has broad multi-chain routing coverage, but its coverage does not automatically make Pelargo a verified checkout on every chain. A destination chain is enabled for merchant settlement only after its verifier and live infrastructure tests pass.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## NEAR Hackathon positioning

- **Primary track: 08 / Real-World Money (RWM).** Pelargo is merchant checkout and stablecoin payment infrastructure using NEAR Intents.
- **Secondary track: 13 / Open Innovation (NEW).** The reusable checkout primitive may also qualify as a general-purpose cross-chain payment interface for existing applications.
- **Not currently claimed:** AI Security & Defense, AI Swarms or Agent Economy. These require product capabilities not present in the current scope. Agent Economy may become relevant if autonomous agents become first-class payers or merchants.

Track selection should reflect the working prototype at submission time, not aspirations.

## Product experience

### Merchant integration

A merchant creates an order in their own application and invokes Pelargo with the order amount, order reference, destination asset and receiving address. The checkout must be embeddable in an existing website or application, with a small integration surface and no requirement to rebuild the merchant's storefront.

### Customer checkout

1. The customer opens the merchant's Pelargo checkout.
2. Pelargo loads the assets and networks currently supported by NEAR Intents.
3. The customer selects a source asset and network available to them.
4. Pelargo requests a quote and displays the source amount, destination amount, fees, route details where available, and quote expiry.
5. The customer explicitly confirms before any committed quote or deposit instructions are created.
6. The customer pays from a compatible wallet using the instructions returned by the payment service.
7. Pelargo reconciles the payment and verifies destination settlement.
8. The merchant receives a payment result only after settlement is verified.

“Any wallet and blockchain” is the product ambition, not a claim of universal compatibility. Actual payment options depend on NEAR Intents asset/network support and the wallet's ability to send the selected asset. The interface must show only options that can actually be used.

## Product boundaries

- **Core:** embeddable checkout button/widget, order context, supported-asset discovery, quote review, payment instructions, status reconciliation and verified payment result.
- **Supporting merchant setup:** destination asset, receiving address and basic checkout configuration.
- **Supporting developer docs:** embed contract, SDK/API reference and integration examples.
- **Optional activity:** real orders and verified settlements only.

Do not expand this into a general merchant dashboard. Storefront building, fabricated analytics, billing, teams/roles, elaborate account management and decorative route visualisations are outside the MVP.

## Implementation status

**The repository is not yet an operational universal checkout. The current frontend contains prototype/demo elements and must not be treated as a live payment flow.**

The active `build/live-intents` branch contains Cloudflare Pages Functions scaffolding:

- `GET /api/tokens`: proxy supported-token discovery to NEAR Intents 1Click.
- `POST /api/quote`: validate and forward quote requests. Dry-run quotes are intended to be tested first; committed quotes remain blocked unless `ALLOW_MAINNET_DEPOSITS=true` is deliberately configured.
- `GET /api/status?depositAddress=...`: proxy execution-status lookups.

The Checkout workspace now renders a reusable `PelargoCheckout` component. It loads supported assets from `/api/tokens`, lets a buyer choose a source asset, accepts a source-network refund address, converts the requested destination amount to atomic units, and submits an `EXACT_OUTPUT` dry quote to `/api/quote`. The quote preview is explicitly read-only and displays returned amounts and timing when present. This component has not yet been verified against a current Cloudflare deployment. The frontend is not connected to committed quotes, wallet signing, deposits or a complete order-to-settlement lifecycle. The embed snippet is not a published or executable SDK.

### Known prototype limitations

- Existing token choices, quote calculations, deposit addresses, QR artwork, transaction hashes, receipts and settlement history in demo components/data are mock values unless explicitly replaced by live API responses.
- A decorative QR pattern is not a valid payment QR code.
- A quote, deposit address or detected deposit is not proof of merchant payment.
- Merchant and order persistence is implemented against the D1 interface. A NEAR NEP-141 settlement verifier is now implemented and covered by mocked integration tests; live D1/RPC validation and webhook delivery remain outstanding.
- No public SDK/CDN package is published.

## Latest infrastructure verification — 5 November 2026

- Production Pages project has a `DB` binding to D1 database `pelargo-db`; all eight migrations are recorded in order.
- Synthetic D1 lifecycle tests confirmed order/session synchronization and audit events. A settlement attempt without matching evidence was rejected. Temporary test records were removed.
- The latest PR preview built successfully at https://2d869dc1.pelargo.pages.dev for commit `8968cfc`. GitHub Actions `verify` and Cloudflare Pages checks passed.
- Cloudflare Pages configuration contains separate encrypted-secret entries named `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` in both production and preview. Cloudflare redacts secret values on read-back, so this confirms configured names, not the correctness or runtime usability of the values.
- Production `DB` is bound to `pelargo-db`; preview `DB` is now bound to the isolated `pelargo-preview-db`. The preview binding was added after the latest preview deployment, so a fresh preview deployment and runtime smoke test are still required.
- `PRAGMA integrity_check` remains unverified because the D1 query API returned `SQLITE_AUTH`. Manual foreign-key orphan checks passed.
- Keep `ALLOW_MAINNET_DEPOSITS` unset. No real payment has been executed.

## Payment safety

NEAR Intents 1Click is treated as a mainnet service in this implementation. A dry quote is a preview and does not create a deposit address. A committed quote creates real payment instructions and can lead to real, potentially irreversible transfers.

- Keep `ALLOW_MAINNET_DEPOSITS` unset until the payment lifecycle is reviewed and the project owner explicitly approves a small-value test.
- Do not send funds or create committed quotes without explicit approval.
- Never request or handle private keys or seed phrases.
- Never show a success state based on a timer, frontend simulation, quote creation or deposit detection alone.
- Mark an order paid only after a successful terminal status and verification of destination transaction details.
- `FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never mark an order paid.

## Intended architecture

```text
Merchant application
  └─ creates order and invokes Pelargo checkout
       └─ Pelargo embeddable widget
            ├─ loads supported assets
            ├─ requests dry quote
            ├─ displays quote for buyer review
            ├─ requests committed quote after explicit confirmation
            ├─ displays real deposit instructions
            └─ tracks payment status
                 └─ server verifies destination settlement
                      └─ merchant receives verified result/webhook
```

The widget must remain independent of any one merchant storefront. Merchant-specific order details and destination settings are inputs to checkout, not hardcoded demo data.

## Merchant provisioning and durable checkout storage

The active branch adds a Cloudflare D1-backed merchant/order/session model.

### One-time infrastructure setup

1. The Cloudflare Pages project `pelargo` is connected to the D1 database `pelargo-db` (`eae6ecc8-d79d-4d12-8a37-2d38ab84a0b1`).
2. Production Pages `DB` is bound to `pelargo-db`; preview Pages `DB` is bound to the isolated `pelargo-preview-db`.
3. Migrations `0001` through `0008` have been applied directly to D1 and reconciled with the `d1_migrations` history table in numerical order.
4. Both environments have separate encrypted entries for `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET`. Cloudflare redacts secret values in API read-back; verify runtime behavior through authenticated tests. Never copy production values into preview.
5. Call `POST /api/merchant` from a trusted operator environment with `X-Pelargo-Provisioning-Key` to create a merchant. The API key is returned once; store it securely.
6. The merchant's own server calls `POST /api/checkout-session` with `X-Pelargo-Merchant-Key`. The merchant identity and name are resolved from the stored API-key hash, not accepted from the browser request.

The merchant provisioning secret and merchant API keys must never be put in frontend code, HTML attributes, public repositories or `VITE_*` variables. The browser receives only the short-lived signed checkout-session token.

### Server-side order session request

A merchant server sends an order reference, amount, atomic amount, destination asset and recipient to `POST /api/checkout-session`. The API creates a unique merchant order row and a signed session row. Duplicate external order IDs for the same merchant are rejected.

### Automated security checks

Run `bun run test:security` for session-token signing and verification. Run `bun run test:api` for merchant provisioning, API-key hashing, merchant authentication, checkout-session issuance/retrieval, duplicate-order rejection, quote binding, dry-quote behavior, mainnet commit protection, merchant-scoped order lookup and authenticated provider-status polling. The status tests verify deposit-memo forwarding, provider-status persistence and that provider `SUCCESS` cannot independently settle an order. These route-handler tests use an in-memory SQLite adapter and mocked upstream responses; they do not replace a live Cloudflare D1 or live 1Click test. GitHub Actions run `41973414325` passed TypeScript, session-security tests, API integration tests and frontend build on commit `36348bf`. The API suite also exercises mocked committed-quote persistence, including rollback when the order/session rows cannot be synchronized atomically.


### Destination-chain settlement verification

- Migrations `0005`–`0008` add immutable settlement evidence and a database guard for the `settled` transition.
- `functions/_lib/near-settlement-verifier.ts` supports NEAR mainnet NEP-141 destinations only. It resolves the signer for the provider candidate hash through the FastNear transaction indexer, then asks canonical NEAR RPC for `EXPERIMENTAL_tx_status` at `FINAL`.
- The verifier requires a successful transaction and receipt, a NEP-141 `ft_transfer` event emitted by the exact destination token contract, and exact net recipient amount after accounting for any resolver refund events. It checks the receipt block and latest finalized block before producing evidence.
- `GET /api/payment-status?orderId=...` invokes this verifier only after 1Click reports `SUCCESS`, the payment lifecycle is already `processing`, and a destination hash is present.
- Verified evidence and the lifecycle transition to `settled` are committed in one D1 batch. Database triggers require evidence to match the order's network, exact asset ID, recipient, amount and candidate hash, then synchronize the order status to `paid`.
- The generic lifecycle transition helper cannot set `settled`. Unsupported destination networks and token standards remain unverified and fail closed.

### Verification configuration and limits

- Defaults target NEAR mainnet RPC (`https://rpc.mainnet.near.org`) and FastNear's mainnet transaction indexer (`https://tx.main.fastnear.com/v0/transactions`).
- Optional Cloudflare secrets/variables: `NEAR_RPC_URL`, `NEAR_TX_INDEXER_URL`, and `NEAR_INDEXER_API_KEY`. The indexer is used only to resolve the transaction signer; NEAR RPC verifies execution and finality.
- API tests use mocked indexer and RPC responses. They cover mismatched/refunded transfer amounts, matching NEP-141 transfer evidence, skipped provider intermediate states, finalized block checks, atomic settlement evidence persistence and order status synchronization.
- This is not live-chain validation. Live 1Click response compatibility, FastNear/RPC availability and response-shape compatibility, D1 batch/trigger behavior, RPC rate limits and production confirmation policy still require preview/testnet or controlled mainnet validation. No real payment has been tested.

### Payment status polling

- `GET /api/payment-status?orderId=...` requires the merchant's server-side API key and scopes the order lookup to that merchant.
- It polls 1Click using the persisted deposit address and optional memo, stores provider status and the candidate destination transaction hash, and never treats provider `SUCCESS` alone as settlement.

### Durable replay protection

- Checkout sessions are stored by unique session ID and SHA-256 token hash.
- Quote requests verify the signature and require a matching active D1 record.
- Dry quotes leave the session active so the buyer can review and refresh a quote.
- A committed quote attempt atomically changes the session from `active` to `commit_attempted` before contacting 1Click. A second attempt cannot pass that state transition.
- A successful upstream commit updates the lifecycle row with a compare-and-set operation. Migration 0004 uses a SQLite trigger to synchronize the order and session rows in that same atomic write; it aborts the lifecycle update if either dependent row is missing or stale.
- An uncertain upstream result leaves the session consumed. This intentionally favors preventing duplicate deposits over automatic retry.

**Current limitations:** merchant credentials are provisioned manually by an operator; there is no self-serve merchant signup, credential rotation UI or rate limiting yet. Automated tests cover cryptographic session validation and merchant/session/quote/order/payment-status handlers against an in-memory SQLite adapter using the actual migrations. The NEAR NEP-141 settlement verifier is exercised with mocked FastNear and RPC responses. Live production Pages Function testing against the newly configured D1 binding, D1 concurrency testing and real upstream payment lifecycle testing remain outstanding. Keep mainnet commit configuration disabled until separately reviewed and explicitly approved.

## Merchant order sessions (early security boundary)

The active branch includes:

- `POST /api/checkout-session`: requires the server-side `X-Pelargo-Merchant-Key` and issues an HMAC-SHA256 signed session.
- `GET /api/checkout-session?token=...`: verifies a signed session and returns its public order claims.
- Sessions expire after a bounded lifetime (60–1800 seconds; 15 minutes by default).
- `POST /api/quote`: requires a valid signed session and enforces the session's destination asset, recipient and exact output amount. The buyer can still choose the source asset and refund address.
- The custom element requires a `session-token` attribute. The merchant must create the session from its own server and pass the returned token into the browser widget.

Required Cloudflare Pages secrets are documented in the D1 setup section above. The previous shared `PELARGO_MERCHANT_API_KEY` design has been replaced by individually provisioned merchant API keys stored as hashes.

Never put `MERCHANT_PROVISIONING_SECRET`, any merchant API key or `ORDER_SESSION_SECRET` in browser code, HTML attributes, a public repository or a Vite `VITE_*` variable. The browser receives only the short-lived signed session token.

**Current limitation:** merchant credentials are provisioned by an operator, not through a self-serve portal. D1 persistence and atomic commit-attempt consumption are implemented in source but require a configured D1 binding and migration before they work in a deployment. Keep committed quotes disabled until the preview database is configured and the complete flow is tested.

## Embeddable checkout element (integration prototype)

The active branch now has a standalone custom-element entry point:

- Source: `src/embed.tsx`.
- Build config: `vite.embed.config.ts`.
- Build output: `dist/pelargo.js` and `dist/pelargo.css`.
- Element name: `<pelargo-checkout>`.
- The element mounts a **Pay with crypto** launcher on the merchant page. Clicking it opens the checkout in an isolated modal (a bottom sheet on small screens); the buyer stays on the merchant's site.
- The React checkout is mounted inside a Shadow DOM so merchant page styles do not directly affect the widget.
- The widget calls the Pelargo API using the origin of the loaded embed script, rather than the merchant page's origin.
- The launcher accepts an optional `button-label` attribute.
- Public API responses include CORS headers; the quote route handles browser preflight.

Build the site and embed bundle with `bun run build`. The separate embed-only command is `bun run build:embed`.

Example integration markup (replace the host and order values):

```html
<script type="module" src="https://YOUR_PELARGO_HOST/pelargo.js"></script>
<pelargo-checkout
  merchant-name="Example Store"
  amount="25.00"
  order-id="ORDER-123"
  destination-symbol="USDC"
  destination-network="Base"
  recipient="0xYOUR_PUBLIC_RECEIVING_ADDRESS"
  session-token="SIGNED_SESSION_TOKEN">
</pelargo-checkout>
```

You may use `destination-asset="EXACT_INTENTS_ASSET_ID"` instead of the symbol/network pair to bind the destination to an exact supported asset.

**This is an integration prototype, not a production payment integration.** The order ID, amount, recipient and session token are public client-side attributes; only the signed session and matching D1 record are accepted as quote authority. The merchant server must create the session. Payment settlement verification and merchant callbacks are not implemented. Do not treat the widget's display state as proof of payment. Committed quotes remain disabled by default.

## Run locally

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Stack

- React 19, TypeScript and Vite.
- Cloudflare Pages Functions for server-side API routes.
- NEAR Intents 1Click API for supported-asset discovery, quotes and status.
- Cloudflare-first, free-tier-conscious hosting.
- No Supabase, Vercel or paid database dependency is required for the current milestone.

## Hosting and change control

- Cloudflare Pages project: `pelargo`.
- Public site: https://pelargo.pages.dev
- Active development branch: `build/live-intents`.
- Keep `main` untouched unless the project owner explicitly authorises a merge.
- Do not deploy production changes, enable committed mainnet quotes or spend funds without explicit approval.

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for the server-to-server merchant integration contract and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the engineering handover.

## License

MIT


### Preview environment isolation

The Pages preview environment uses a separate D1 database, `pelargo-preview-db`, with migrations `0001`–`0008` applied at the time of the last confirmed migration check. Migration `0009_settlement_evidence_insert_guard.sql` is newly added and must be applied to preview before testing the updated settlement code. Its `DB` binding and encrypted `MERCHANT_PROVISIONING_SECRET` / `ORDER_SESSION_SECRET` entries are separate from production. Do not copy production secrets into preview. Deployed preview runtime access still requires smoke testing.


### Settlement evidence concurrency guard

Migration `0009_settlement_evidence_insert_guard.sql` adds a database-side precondition for settlement evidence insertion: the lifecycle must still be `processing` and the evidence transaction hash must equal the stored destination candidate. This closes a stale-verifier race at the evidence insert boundary. Apply migration 0009 to the target D1 environment before deploying code that relies on it. The regression suite covers rejection of a stale candidate; live chain and deployed D1 runtime tests remain outstanding.
