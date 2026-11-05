# Pelargo

Pelargo is an embeddable crypto checkout for merchants. It uses NEAR Intents / 1Click to quote cross-chain payment routes, while the merchant receives a configured destination asset when the route is supported.

The checkout widget is the product. The merchant workspace exists to configure and integrate checkout; Pelargo is not a storefront builder.

## Hackathon scope

The immediate goal is a credible end-to-end **testnet demonstration**, not a production payment platform.

The demo needs to prove a small number of things:

1. A merchant can create an order and issue a short-lived checkout session.
2. A buyer can discover available assets, request a quote and see payment instructions.
3. Pelargo can observe the provider's payment status.
4. For a supported NEAR NEP-141 destination, Pelargo can independently verify the transaction before marking the order paid.
5. The merchant can retrieve the resulting order status through an authenticated API.

Keep the implementation focused on this path. Do not add more chains, more indexer providers, a proprietary indexer, self-serve merchant billing, provider redundancy or production operations work just to broaden the architecture. Revisit those only when the demo exposes a concrete need.

## Checkout flow

1. The merchant backend creates an order through `POST /api/checkout-session`.
2. Pelargo returns a short-lived signed session token. The merchant passes it to the browser widget; the merchant API key stays server-side.
3. The widget discovers provider-supported assets and requests a dry quote.
4. A committed quote requests real deposit instructions. This is a payment action, not a preview.
5. Pelargo polls 1Click and treats provider `SUCCESS` only as a signal to verify the destination transaction.
6. The NEAR verifier resolves the transaction signer through a network-matched indexer, then asks canonical NEAR RPC to verify final execution and the exact token transfer.
7. Only a matching verified transfer can mark the order paid.

## Current verification state (5 November 2026)

- Operational branch: `ops/live-d1-readiness`; application integration branch: `build/live-intents`. `main` remains untouched.
- Preview is configured with isolated D1 and Tidepool testnet provider settings. `ALLOW_TESTNET_DEPOSITS=true` enables only testnet committed quotes; mainnet commits remain disabled.
- The widget supports dry-quote preview, buyer-confirmed committed-quote creation, and display of the provider's deposit address/memo, exact committed source amount and deadline. It does not connect a wallet or submit the source transfer; the buyer sends funds from their own wallet.
- Buyer payment-status polling is scoped to the session's own committed order. Merchant server integrations use the merchant API key; the dashboard uses an HttpOnly merchant session cookie. The dashboard's manual **Check status** action currently has an unresolved runtime issue and should not be treated as a reliable reconciliation control.
- Self-service merchant registration/login, persisted destination settings, dashboard order creation and merchant-scoped activity APIs have been added. CI has covered type-checking, checkout-session security, checkout API integration and frontend build; see the project status handover for commit-specific evidence.
- Preview migrations `0012` through `0016` have been applied to the isolated Preview D1 database. The source-deposit recovery endpoint was exercised against the existing live order: Pelargo verified the submitted Base Sepolia deposit and notified Tidepool.
- **Live testnet payment:** order `ORDER-83587591`, Tidepool quote `6fd9fef3-a12d-4347-a73f-e250c3acd40d`. The buyer sent `1.012633` Base Sepolia USDC to the committed deposit address in transaction `0x6ccc936c0de29f926478ce525434ef3b26c2ccb792efbdfab10a75471ad9553d`. The dashboard recovery action returned: “Source deposit verified and provider notified. Provider status: PROCESSING. Settlement: pending provider confirmation.”
- The buyer then supplied successful NEAR testnet transaction `vif8EKtCAzHcaihLNuC6XaRMhCzEDxUiHbAJJRQVUVE`. The explorer details report an `execute_intents` transaction at block `276344865` and a transfer of 1 Tidepool Testnet USDC to `agentg.testnet`. Pelargo has **not** yet independently verified the exact NEP-141 token contract, recipient, net amount and finality through its own verifier, or persisted settlement evidence. The order therefore remains `processing`, not `paid`.
- Provider status was still `PROCESSING` at the last observed check. The destination explorer report is evidence supplied by the buyer, not a substitute for Pelargo's canonical RPC verification. Do not send another payment or manually mark this order paid.
- Production is unchanged, `main` has not been merged, and mainnet deposits remain disabled.

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the exact verification record and next sequence.

## What is implemented

- Public merchant registration and password login, with PBKDF2-SHA-256 (100,000 iterations, the Cloudflare Workers WebCrypto ceiling), per-account random salts, and a server-side HMAC-SHA-256 pepper derived from `ORDER_SESSION_SECRET`; database-backed login/registration throttling and seven-day opaque HttpOnly Secure SameSite=Lax sessions.
- Merchant-scoped destination settings, dashboard order creation and order activity APIs.
- Dashboard cookie authentication and server-side merchant API-key authentication remain separate; internal API keys are never returned to the browser.
- Merchant-authenticated order and checkout-session creation.
- Short-lived HMAC-signed sessions bound to merchant, order, amount, destination asset and recipient.
- Session replay protection and merchant-scoped order lookup.
- Provider asset discovery, dry quote handling and committed-quote persistence.
- Authenticated provider status polling with stale-response protection; concurrent polls return the latest persisted state instead of a misleading conflict.
- Independent Base Sepolia ERC-20 source-deposit verification (chain ID, receipt hash/status, exact token contract, deposit recipient, exact amount and 12-confirmation minimum), immutable source evidence, and authenticated `/api/deposit-submit` notification to Tidepool.
- NEAR destination settlement verification runs when a correlated destination transaction hash is available, even if Tidepool still reports `PROCESSING`; only finalized exact NEP-141 transfer evidence can mark an order paid.
- Merchant/buyer-authorized recovery of the original source asset, exact input amount, output amount and deadline from the provider's original quote response, without creating another quote.
- A NEAR NEP-141 settlement verifier with exact token-contract, recipient and net-amount checks.
- Database guards that prevent an order being marked paid without matching settlement evidence.
- An operator recovery-case endpoint for ambiguous quote-commit outcomes.

## Important limits

- **Routing support is not settlement support.** A route offered by 1Click does not mean Pelargo can verify settlement on that destination.
- The only implemented settlement verifier is for NEAR NEP-141 tokens. EVM, Solana, Bitcoin, native NEAR and other destinations are not verified by Pelargo.
- Provider selection is server-side and allowlisted: unset `INTENTS_API_BASE_URL` selects official 1Click mainnet; `https://www.usetidepool.tech` selects the community Tidepool testnet sandbox. Mainnet partner JWTs are never forwarded to Tidepool.
- Testnet signer lookup is configured to use NearBlocks v3 `GET /v3/txns/{hash}` and hash-bound `transaction_hash` / `signer_account_id` fields. Mainnet uses NearScanner's `hash` / `signer_id` fields. These response shapes are covered by mocks, not yet confirmed against a live transaction. The indexer only resolves the signer; NEAR RPC verifies execution, token transfer details and finality.
- RPC defaults follow the provider network and the verifier checks RPC `chain_id` before transaction verification.
- Committed quotes remain disabled by default. `ALLOW_TESTNET_DEPOSITS=true` enables only Tidepool testnet commits; `ALLOW_MAINNET_DEPOSITS=true` remains a separate mainnet-only switch.
- NearBlocks testnet signer parsing accepts object and array response envelopes, with a regression fixture for the array form. The live response shape for the completed destination transaction has not yet been confirmed in Pelargo's runtime. The live order remains unsettled until the verifier independently validates the transaction through NEAR RPC and persists matching evidence.
- The browser widget is an integration prototype, not a finished production checkout SDK. Do not use it to collect real customer funds.
- Tidepool publishes a 31/31 conformance report against official 1Click OpenAPI and real NEAR testnet transaction examples. Pelargo has completed a live committed quote and source deposit on testnet and received a buyer-reported successful destination transaction. Pelargo's independent destination verification and settlement persistence for that order remain incomplete.
- NearBlocks testnet API access and live response behavior in Pelargo Preview remain to be confirmed against the completed order.

## What is deliberately out of scope for the hackathon

Do not spend hackathon time on:
- Supporting every chain exposed by the routing provider.
- Building or operating our own transaction indexer.
- Integrating multiple indexer vendors before the current one has been tested.
- Merchant billing, multi-user organisations, email verification, password recovery, API-key rotation or enterprise identity management.
- Production-grade redundancy, monitoring and incident operations.
- Mainnet payment activation.

These are possible later product requirements, not prerequisites for demonstrating the core checkout and verification flow.

## API surface

- `POST /api/checkout-session` — merchant-authenticated order/session creation.
- `GET /api/checkout-session?token=...` — validate/retrieve public session claims.
- `GET /api/tokens` — provider-supported asset discovery.
- `POST /api/quote` — session-bound dry or committed quote request.
- `GET /api/order?orderId=...` — merchant-scoped order lookup.
- `GET /api/orders` — dashboard activity list for the authenticated merchant.
- `GET/PUT /api/merchant-settings` — retrieve and persist merchant destination settings.
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout` — merchant account and session lifecycle.
- `GET /api/payment-status?orderId=...` — merchant-scoped provider polling, recovery of original committed-quote deposit instructions when returned by the provider, and eligible NEAR settlement verification.
- `POST /api/deposit-submit` — merchant-authenticated source transaction recovery; verifies the exact Base Sepolia ERC-20 deposit against the provider quote before notifying Tidepool.
- `GET /api/operator/recovery-cases` — operator-authenticated read-only queue for ambiguous quote commits.
- `GET /api/status` — retired; returns HTTP 410.

See [docs/INTEGRATION.md](docs/INTEGRATION.md) for merchant request contracts and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for the current implementation and verification record.

## Database

Migrations `0001` through `0016` are in the repository. Preview D1 has been advanced through `0016`, including merchant account, settings, authentication throttle and immutable origin-deposit evidence tables. Production migration state has not been checked or changed. Do not apply production migrations as part of ordinary hackathon testing.

## Safety boundaries

- Keep `ALLOW_MAINNET_DEPOSITS` unset. Mainnet committed quotes and deposits are not part of the hackathon testnet demo.
- Use testnet assets only for the demo, after confirming every provider and verifier endpoint is configured for the same network.
- Never expose merchant API keys, `MERCHANT_PROVISIONING_SECRET`, `ORDER_SESSION_SECRET` or indexer credentials in browser code or public repositories.
- A quote, deposit address, detected deposit or provider `SUCCESS` is not proof of settlement.
- Do not merge to `main` or deploy production without explicit release authorization.

## Repository and development

- Repository: [BigWave45/Pelargo](https://github.com/BigWave45/Pelargo)
- Application integration branch: `build/live-intents`
- Current operational branch: `ops/live-d1-readiness`
- Cloudflare Pages project: `pelargo`

Stack: React, TypeScript, Vite, Cloudflare Pages Functions, Cloudflare D1 and NEAR Intents / 1Click.

Run locally:

```bash
bun install
bun run dev
bun run test:security
bun run test:api
bun run build
```

## License

MIT


### Committed payment recovery after checkout-session expiry

If a buyer's short-lived checkout token expires after the quote was committed, the same signed token can still be used to read and poll only its own committed order. The API verifies the signature and exact persisted session/order binding and requires the session to remain in the `committed` state. This recovery exception does not allow quote creation, session reactivation, or access to another order. Uncommitted and expired checkout sessions remain rejected.
