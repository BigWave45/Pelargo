# Pelargo — Build Status

Last updated: 5 November 2026

## Active branch and change control

- Repository: `BigWave45/Pelargo`.
- Active development branch: `build/live-intents`.
- Keep all development changes on this branch.
- `main` must remain untouched unless the project owner explicitly authorises a merge.
- Do not deploy production changes, enable committed mainnet quotes or spend funds without explicit approval.

## Product definition

Pelargo is a **universal checkout widget powered by NEAR Intents**. Category: **Web3 payments infrastructure / cross-chain crypto checkout / payment gateway**.

Any merchant or application should be able to add a checkout button to an existing website or app. The buyer opens Pelargo, selects a supported source token and blockchain, and pays from a compatible wallet they already use. NEAR Intents routes the payment to the merchant's configured destination asset and address.

The widget is the product. Merchant setup and developer documentation are supporting surfaces only. Do not turn Pelargo into a storefront builder or broad merchant SaaS dashboard.

“Any wallet and blockchain” is an ambition, not a compatibility guarantee. The widget must display only source assets/networks supported by the current Intents service and usable through the payment instructions provided.

## NEAR Hackathon track fit

- **Primary:** Track 08 / Real-World Money (RWM). The official track explicitly calls for merchant payments and stablecoin rails for real businesses, including NEAR Intents.
- **Secondary candidate:** Track 13 / Open Innovation (NEW), if the submission demonstrates a genuinely reusable cross-chain checkout primitive for arbitrary existing apps.
- **Not a current fit:** Track 06 / AI Security & Defense and Track 07 / Agent Economy. Pelargo does not currently implement AI-agent spending controls or autonomous agent commerce.

Official track source: https://nearhackathon.com/

## MVP acceptance criteria

1. Merchant can integrate a checkout button/widget into an existing application without adopting a Pelargo storefront.
2. Merchant/order context supplies an amount, order reference, destination asset and receiving address. These values must not be hardcoded demo data.
3. Widget dynamically loads supported source assets and networks from the backend.
4. Buyer selects a supported source asset and receives a live dry quote.
5. Quote review clearly displays source amount, expected destination amount, fees, expiry and relevant payment details.
6. No committed quote or deposit instructions are created before explicit buyer confirmation.
7. After confirmation, the backend obtains real payment instructions and the widget renders the actual address, memo and a standards-compliant QR code where applicable.
8. Backend reconciles status and verifies destination settlement before marking an order paid.
9. Merchant application receives a trustworthy payment result; webhook delivery can follow the initial browser/server integration.
10. No mock state is presented as live payment evidence.

## Current implementation state

### Frontend

- The merchant workspace remains provisional. Reduce it to the minimum setup/integration surface needed by the widget.
- **Added:** `src/components/TokenDiscovery.tsx` provides a reusable live token catalogue with search and network filtering. The buyer checkout component separately loads the same API for its payment selector.
- **Added:** `src/components/PelargoCheckout.tsx` is a reusable buyer-facing checkout component. It loads live token records, selects a source asset, accepts a source-network refund address, converts destination amount using token decimals, and requests an `EXACT_OUTPUT` dry quote.
- **Connected:** The Checkout workspace renders the reusable component using the current local merchant destination settings. The order reference is a local preview placeholder, not a persisted merchant order.
- **Dry-run only:** The component does not request a committed quote, connect a wallet, create deposit instructions, initiate a transfer or mark an order paid.
- **Hardening:** The quote endpoint now validates required route types and a future ISO 8601 deadline at the server boundary. The deadline validator uses a strict timestamp pattern. No unsupported enum values are assumed.
- **Hardening:** In-flight quote responses are discarded if the buyer changes amount, source asset, refund address or merchant destination while the request is pending. A stale quote is cleared on relevant configuration changes.
- **Not verified:** The new component and quote request have not been tested against a current Cloudflare deployment; the corrected upstream schema and response mapping remain unverified.
- Existing legacy demo components/data still contain mock token choices, quote calculations, deposit addresses, QR artwork, transaction hashes, receipts and settlement history. Do not use them as live payment data.
- The illustrative embed snippet is not a published or executable SDK.

### Cloudflare Pages Functions

- `GET /api/tokens`: proxies supported-token discovery to NEAR Intents 1Click.
- `POST /api/quote`: validates and forwards quote requests.
- `GET /api/status?depositAddress=...`: proxies status lookups.

The earlier quote request reached the upstream service but failed schema validation because `depositType`, `refundType`, `recipientType` and ISO 8601 `deadline` were missing. The payload was updated with those fields, but the corrected dry quote has not yet been verified. Treat endpoint scaffolding as implemented, not proven operational.

The token UI expects the documented token array fields `assetId`, `decimals`, `blockchain` and `symbol`. It accepts either a raw array or an object with a `tokens` array. It does not construct asset IDs manually.

## Embeddable element milestone

- **Added:** `src/embed.tsx` registers a `<pelargo-checkout>` custom element and mounts the React checkout inside Shadow DOM.
- **Added:** `vite.embed.config.ts` builds a standalone ES module and stylesheet. The normal build script now runs the site build and embed build.
- **Added:** widget props support merchant-fixed amount, exact destination asset ID and an API base URL derived from the embed script origin.
- **Added:** public API responses include CORS headers and `POST /api/quote` handles OPTIONS preflight, allowing cross-origin browser requests from merchant sites.
- **Updated:** Developers view shows the proposed custom-element integration contract.
- **Not verified:** no build has been run and no Cloudflare preview has been confirmed to contain the embed assets. The element is not yet proven to load on a third-party merchant domain.
- **Critical security gap:** embed attributes are currently untrusted client inputs. No merchant-authenticated, signed, expiring server-side order session exists; no single-use/replay storage exists. Never enable committed quotes or treat an order ID/recipient supplied by markup as authoritative.

## Payment lifecycle

```text
Merchant application creates order
  -> embeds/invokes Pelargo checkout with order context
  -> widget loads supported source assets
  -> buyer selects asset/network
  -> backend requests dry quote
  -> buyer reviews and explicitly confirms
  -> backend requests committed quote
  -> widget displays real deposit instructions
  -> buyer pays from compatible wallet
  -> backend reconciles Intents status
  -> backend verifies destination transaction
  -> merchant receives verified paid result
```

A quote is not payment. A deposit address is not payment. Detecting a deposit is not successful settlement. `FAILED`, `REFUNDED` and `INCOMPLETE_DEPOSIT` must never mark an order paid.

## Mainnet safety

- NEAR Intents 1Click is treated as a mainnet service in this implementation.
- `dry: true` requests a quote preview and does not create a deposit address.
- `dry: false` creates real payment instructions and can lead to irreversible transfers.
- Keep `ALLOW_MAINNET_DEPOSITS` unset.
- Do not create committed quotes or send funds without explicit project-owner approval and a reviewed small-value test plan.
- Never request or handle private keys or seed phrases.
- Never infer payment success from frontend timers or simulated states.

## Out of scope for MVP

- Storefront builder or sample ecommerce catalog as the main experience.
- Large merchant dashboard, analytics suite or fabricated transaction ledger.
- Billing, teams, roles and elaborate merchant account administration.
- Multiple payment providers before the Intents flow works.
- Mainnet payment testing without explicit approval.

## Next engineering sequence

1. Run build and TypeScript checks; fix any errors in the app and standalone embed bundles.
2. Verify token discovery and dry quote through a Cloudflare preview, inspecting actual upstream response fields.
3. Verify the custom element loads from a separate origin and that its stylesheet/API requests resolve correctly.
4. Implement merchant authentication and a signed, expiring order-session creation API. Bind amount, destination asset, recipient and merchant identity on the server; never trust embed attributes for committed payment authority.
5. Add persistent single-use quote/commit state and replay protection before enabling any committed quote.
6. Only after explicit project-owner approval, perform a controlled small-value payment test and render real deposit address/memo instructions.
7. Implement status reconciliation, destination transaction verification and merchant payment-result delivery.

## Verification record

- Latest implementation: standalone custom-element embed entry, merchant-fixed amount/exact destination props, cross-origin API CORS/preflight and embed markup have been added. Build, deployment, third-party loading and dry quote are still unverified.
- CI/workflow runs for the latest code commit: none reported by GitHub at time of update.
- Build/lint: not run in this environment.
- Deployment: not verified. Do not assume Cloudflare Pages has deployed this branch head.
- Production deployment and merge to `main`: not authorised.

## Hosting

- Cloudflare Pages project: `pelargo`.
- Public site: https://pelargo.pages.dev
- Check the exact deployed commit in Cloudflare Pages before treating any URL as current.
- No production deployment or merge to `main` is authorised by this status update.

## Handover rules

1. Read this file and `README.md` before continuing.
2. Inspect the active branch and current files; this document may lag repository state.
3. Distinguish implemented, deployed, tested and verified behavior.
4. Keep changes on `build/live-intents`; do not merge to `main` or deploy production without explicit approval.
5. Update this file and README after each material milestone.
6. Never invent API results, deployment status or payment outcomes.
