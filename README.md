# Pelargo

Pelargo is a universal checkout widget powered by NEAR Intents. Its product category is Web3 payments infrastructure: a cross-chain crypto checkout and payment gateway.

Any merchant or application can add a checkout button to an existing website or app. A customer opens Pelargo, chooses a supported token and blockchain they can pay from, and completes payment through a wallet they already use. NEAR Intents routes the payment so the merchant receives the asset configured for settlement.

The widget is the product. The merchant-facing surface exists only to configure checkout and help developers integrate it. Pelargo is not a storefront builder or a full merchant SaaS dashboard.

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
- Merchant and order persistence is being implemented through Cloudflare D1; payment settlement verification and webhook delivery are not yet established.
- No public SDK/CDN package is published.

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

1. Create a Cloudflare D1 database named `pelargo-checkout` in the same Cloudflare account as the Pages project.
2. Add a Pages Function binding named `DB` pointing to that database (preview and production bindings are separate; configure preview first).
3. Apply `migrations/0001_checkout_storage.sql` to the database.
4. Add the following as Cloudflare Pages secrets for the preview environment:
   - `MERCHANT_PROVISIONING_SECRET`: high-entropy provisioning secret.
   - `ORDER_SESSION_SECRET`: random signing secret of at least 32 characters.
5. Call `POST /api/merchant` from a trusted operator environment with `X-Pelargo-Provisioning-Key` to create a merchant. The API key is returned once; store it securely.
6. The merchant's own server calls `POST /api/checkout-session` with `X-Pelargo-Merchant-Key`. The merchant identity and name are resolved from the stored API-key hash, not accepted from the browser request.

The merchant provisioning secret and merchant API keys must never be put in frontend code, HTML attributes, public repositories or `VITE_*` variables. The browser receives only the short-lived signed checkout-session token.

### Server-side order session request

A merchant server sends an order reference, amount, atomic amount, destination asset and recipient to `POST /api/checkout-session`. The API creates a unique merchant order row and a signed session row. Duplicate external order IDs for the same merchant are rejected.

### Durable replay protection

- Checkout sessions are stored by unique session ID and SHA-256 token hash.
- Quote requests verify the signature and require a matching active D1 record.
- Dry quotes leave the session active so the buyer can review and refresh a quote.
- A committed quote attempt atomically changes the session from `active` to `commit_attempted` before contacting 1Click. A second attempt cannot pass that state transition.
- A successful upstream commit records `committed` and updates the order to `quote_committed`.
- An uncertain upstream result leaves the session consumed. This intentionally favors preventing duplicate deposits over automatic retry.

**Current limitations:** merchant credentials are provisioned manually by an operator; there is no self-serve merchant signup, credential rotation UI or rate limiting yet. A commit attempt is single-use, but no automated payment settlement verification is implemented. Keep mainnet commit configuration disabled until separately reviewed and explicitly approved.

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
- The element mounts the React checkout inside a Shadow DOM so merchant page styles do not directly affect the widget.
- The widget calls the Pelargo API using the origin of the loaded embed script, rather than the merchant page's origin.
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

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the engineering handover.

## License

MIT
