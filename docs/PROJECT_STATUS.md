# Product direction and wallet-first checkout plan — 7 November 2026

This file records the current product/design decision and implementation state. The Base Sepolia wallet path is implemented in the draft branch, but a live end-to-end wallet payment remains unverified.

- Continue the UI, UX and copy redesign in parallel with wallet technical validation. The redesign is not paused or superseded by wallet work.
- Preserve the existing merchant account/API-key model, merchant-created checkout sessions, widget contract, Tidepool/1Click quote integration, order state machine, provider polling and independent NEAR settlement verifier.
- Universal checkout is the long-term product direction: one merchant integration, buyer pays from a wallet/network/asset they already use where supported, and the merchant receives its configured settlement asset. Do not claim universal wallet or chain support in the current build.
- Hackathon wallet implementation is Base Sepolia-first: injected EIP-1193 connection, account/network detection, supported ERC-20 balance lookup, exact provider quote amount and deposit-address transfer signed by the connected wallet.
- The current manual deposit-address flow remains available as a fallback. Wallet transaction submission does not mark an order paid; provider detection and independent NEAR settlement verification remain authoritative.
- Wallet connection, token balance discovery and transaction signing/broadcast are implemented as separate steps. Only injected EVM wallets on Base Sepolia are currently supported by this draft.
- Design direction remains blue/white, modern financial infrastructure plus editorial minimalism. Remove generic AI decoration. Use product UI states, precise diagrams and restrained geometric elements only where they explain the payment journey. Design copy around simplicity, with separate messaging for buyers, merchants and developers.
- Remaining order: Cloudflare Pages Preview browser acceptance, fresh Base Sepolia testnet payment, confirmation that provider polling detects the transfer, and independent NEAR settlement verification. Continue the broader public-site, merchant workspace and developer copy/UI redesign in parallel.
- No production deployment, merge, mainnet activation or payment initiation without explicit approval.

---

# Preview integration and migration audit — 7 November 2026

## Base wallet execution feasibility finding — 7 November 2026

- Repository inspection of `functions/api/quote.ts`, `src/components/PelargoCheckout.tsx`, and the Base Sepolia verifier confirms the current provider flow is 1Click quote → committed quote with `quote.depositAddress` and `quote.amountIn` → source-chain deposit → status polling. The frontend currently displays the deposit address and requires the buyer to send manually.
- The current quote integration does not request or expect provider-supplied EVM transaction calldata. This does **not** block wallet payment: for an ERC-20 source asset on Base Sepolia, the buyer's connected wallet can sign and broadcast the standard token `transfer(depositAddress, amountIn)` transaction. Pelargo must derive the token contract from the exact provider asset ID and use the exact quoted atomic amount; never accept a free-form token contract or amount from the browser.
- The existing verifier in `functions/_lib/base-deposit-verifier.ts` already validates Base Sepolia chain ID `0x14a34`, successful transaction receipt, exact ERC-20 contract, exact deposit recipient, exact atomic amount and at least 12 confirmations. This gives us a substantial existing foundation for a wallet-first Base Sepolia path.
- Provider lifecycle documentation describes the deposit-address model: the buyer sends the source token to the quote's unique deposit address; 1Click detects the deposit and progresses through status polling. The optional `deposit/submit` notification can accelerate detection but is not the wallet execution mechanism. Keep Pelargo's independent destination settlement verification as the final paid-state authority.
- Important API boundary: current `POST /api/deposit-submit` authenticates a merchant session or merchant API key, not the buyer's signed checkout session. Do not expose a merchant credential to the buyer widget. A wallet-first flow can initially rely on provider deposit detection and existing status polling; if explicit transaction notification is needed, add a buyer-session-authorized route that binds the transaction to the committed quote and independently verifies it before notifying the provider.
- Technical direction: Base Sepolia first, injected EIP-1193 wallet provider, request chain `0x14a34`, read connected account, check exact ERC-20 balance, build standard ERC-20 `transfer(address,uint256)` calldata to the committed deposit address for the committed `amountIn`, request wallet signature/broadcast, then track provider status and existing destination settlement verification. Handle wrong network, missing wallet, insufficient balance, rejected signature, duplicate click, expired quote and uncertain broadcast. Keep manual instructions as fallback.
- This finding narrowed the technical risk: a standard ERC-20 transfer is sufficient for the supported Base Sepolia quote deposit. The wallet implementation now exists in the draft branch; live payment and settlement acceptance remain outstanding.


- Read-only Cloudflare Pages deployment inspection confirms the latest active-branch Preview deployment is `bf42d182-f628-4073-b7b2-e4f8f7847475`, commit `3acdaa917dd796f3a9c652defbcd97361fb82e91`, with build and deploy stages successful. The stable Preview alias remains `https://reliability-background-recon.pelargo.pages.dev`. This is a deployment check, not an independent merchant-origin checkout acceptance test.
- GitHub Actions CI run #490 for commit `3acdaa9` completed successfully. The run includes the repository CI workflow; it does not exercise a live merchant API key or a real committed quote.
- Read-only query of Preview D1 `d1_migrations` confirms all 19 migrations are applied. In particular, `0019_reconciliation_backfill_eligible_states.sql` is recorded at migration id 18 and `0018_preview_password_reset.sql` at id 19. The filenames are not ordered by their application record IDs. No database writes were made. Production D1 was not queried or changed.
- Cloudflare deployment metadata confirms the Preview Pages deployment is bound to D1 database `0335acdc-f0e0-42f6-ba87-e3448fb91728`. The latest deployment metadata lists `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` as secret-type bindings but does not expose their values; this does not independently prove their runtime validity.
- The Preview reconciliation Worker was previously verified as deployed with the five-minute cron active. The encrypted `RECONCILIATION_SECRET` value is not readable through the Cloudflare API, and no successful scheduled settlement run is established by this audit. Do not infer secret validity or attribute the existing settled order to the Worker.
- Merchant API-key issuance/rotation and the Developers integration screen are implemented on `reliability/background-reconciliation`. The standalone embed's `process.env.NODE_ENV` browser-runtime reference was fixed, and the latest Preview deployment includes that commit. The actual merchant flow remains unaccepted: issue/rotate a key, create a real merchant order/session server-side, load the widget from a separate merchant origin, preview a dry quote, and verify the buyer confirmation boundary. Do not commit a quote or send funds during this acceptance pass without explicit approval.
- A visual-only redesign is in progress on `design/blue-white-premium`, with draft PR #5 targeting `reliability/background-reconciliation`. It adds isolated checkout/workspace CSS and stylesheet imports; it does not intentionally change payment, quote, deposit, session, authentication, or settlement logic. The branch has not been deployed or merged. No CI run is currently reported for the PR head SHA `2cc147af80c8ab8ccd75f33c4cf2873032f801fc`; visual browser acceptance and build verification remain outstanding.
- No Production resources were queried or changed, no merge occurred, and no branch was deleted.

## Base Sepolia wallet implementation — 7 November 2026

- Implemented in `src/components/PelargoCheckout.tsx` on `design/blue-white-premium`: injected EIP-1193 wallet connect, Base Sepolia chain switch (84532 / `0x14a34`), connected account display, exact provider-token balance lookup, and standard ERC-20 transfer to the committed quote's deposit address using the exact atomic `amountIn`.
- The selected source token contract is parsed from the provider asset ID. The connected wallet must match the quote refund address. Source asset selection locks after committed deposit instructions exist. Quotes with a provider memo cannot use direct wallet transfer and stay on the manual path.
- Existing quote creation, commit behavior, provider status polling and independent destination settlement verifier were not replaced. The manual deposit-address path remains available. A wallet transaction hash is presented as submitted only, never as paid.
- Supported scope is injected EVM wallets on Base Sepolia for recognized Base Sepolia ERC-20 asset IDs. WalletConnect, mobile deep links, Solana/NEAR wallet signing, arbitrary chain support and universal asset discovery are not implemented.
- CI run `42325932624` on code commit `08dec058aba78c934a37e7ec44d0f783a007925d` passed type-check, checkout-session security tests, checkout API integration tests and frontend build.
- Live Preview browser acceptance and a fresh end-to-end testnet payment through independently verified NEAR settlement remain outstanding. This code change did not initiate a payment.
- Mobile provider detection was hardened in commit `afce17bb4ad9a85567380e25b6a6d93ca3342641`: the widget waits for MetaMask's asynchronous `ethereum#initialized` injection event, rechecks `window.ethereum`, and attaches account/network listeners after provider initialization. Cloudflare Pages Preview deployment `53a9a3b9-7f3c-4348-855d-a4356f0b20a5` built and deployed this exact commit successfully; the `design-blue-white-premium.pelargo.pages.dev` alias points to it. GitHub returned no PR workflow runs or combined status checks for this SHA, so CI is not verified for this patch. Retry MetaMask in-app browser connection before quote commitment or transfer.

## Next acceptance sequence

1. Sign in to the Preview merchant workspace and generate a merchant API key. Save it only in a server-side secret store; do not paste it into browser code or this chat.
2. From a merchant backend route, call `POST /api/checkout-session` with a fresh external order ID and trusted order configuration. Confirm the response is `201` and contains a short-lived session token and public session claims.
3. On a separate merchant-origin test page, load `https://reliability-background-recon.pelargo.pages.dev/pelargo.js`, call the merchant backend route, and mount `<pelargo-checkout>` using the returned claims and token.
4. Verify the widget mounts, requests token discovery, and displays a dry quote. Stop before buyer confirmation/committed quote unless a separate testnet payment has been explicitly approved.
5. Test authenticated `GET /api/order` or `GET /api/payment-status` from the merchant backend. Verify cross-merchant access is denied.
6. Separately establish Worker secret validity and scheduled invocation evidence from runtime logs and Preview D1 job state. Review expiry and uncertain-commit sweep side effects before dispatching or redeploying anything.


---

## Provider dependency and product-coverage disclosure — 7 November 2026

The current V1 is still dependent on the configured NEAR Intents / 1Click provider integration through Tidepool's testnet environment. Tidepool/1Click currently determines the source-token catalogue, available source/destination routes, quote availability and expiry, deposit address, exact source amount and provider-side deposit lifecycle. Pelargo does not currently provide its own independent routing/liquidity layer, second-provider redundancy, automatic provider failover or arbitrary-asset execution.

This is a provider dependency, not a claim that Pelargo is merely a thin UI wrapper. Pelargo owns merchant authentication and API-key boundaries, signed checkout sessions, order binding and lifecycle, checkout UX, provider-facing orchestration, and independent NEAR NEP-141 destination settlement verification. Nevertheless, source-asset and route coverage remain constrained by the configured provider and must be represented honestly in the product and demo.

Wallet support is separate from route support. The current direct wallet path supports injected EIP-1193 wallets on Base Sepolia for matching provider-listed ERC-20 source assets. Adding MetaMask, WalletConnect or other wallet connectors does not expand Tidepool's token catalogue, route liquidity or Pelargo's implemented destination verifiers. WalletConnect is not implemented yet.

Public copy and developer documentation must distinguish:
- **Implemented now:** provider-listed source assets/routes; Tidepool/1Click testnet quote and deposit flow; Base Sepolia injected-wallet transfer for eligible provider quotes; manual deposit fallback; independent NEAR NEP-141 destination settlement verification.
- **Not implemented:** arbitrary source assets/routes; provider redundancy/failover; independent Pelargo routing; WalletConnect; universal wallet discovery; EVM/Solana/Bitcoin/native-NEAR destination settlement verification.
- **Product direction:** a universal checkout interface that can add more wallet connectors, providers, source networks and settlement verifiers behind stable merchant and checkout contracts.

No production deployment, provider migration, additional provider integration or payment initiation is authorized by this documentation update.


---

## Provider strategy clarification — 7 November 2026

The earlier wording that described Tidepool as Pelargo's only provider option was incomplete. The current `functions/_lib/intents.ts` implementation allowlists both official NEAR 1Click (`https://1click.chaindefuser.com`) and Tidepool (`https://www.usetidepool.tech`). An unset `INTENTS_API_BASE_URL` selects official 1Click and classifies it as mainnet; the Preview environment explicitly selects Tidepool and is classified as testnet. `ONECLICK_JWT` is forwarded only to official mainnet 1Click. Mainnet committed quotes remain separately disabled unless `ALLOW_MAINNET_DEPOSITS=true` is explicitly configured.

This is provider configurability, not multi-provider orchestration. One provider is selected per environment. No runtime health-based selection, quote retry across providers, automatic failover or simultaneous route comparison exists. Tidepool is the current Preview/testnet fallback; it is not a drop-in failover for an official mainnet quote. Once a provider has committed a quote and issued deposit instructions, the order must remain pinned to that provider and quote. Never recreate or reroute a committed order automatically.

The adapter boundary should be extended for additional compatible providers only after validating their token identifiers, quote semantics, deposit/memo requirements, status lifecycle, transaction notification, expiry, fees and network environment. A provider's claim of NEAR Intents compatibility is not sufficient evidence that it matches the current 1Click contract. No provider switch, mainnet activation or payment was performed as part of this documentation correction.


---

## Provider adapter boundary and wallet work — 7 November 2026

- Refactored `functions/_lib/intents.ts` to introduce an explicit `IntentsProviderAdapter` contract and a closed registry for official NEAR 1Click (mainnet) and Tidepool (testnet). Existing `intentsProvider()` network metadata remains available to preserve the independent mainnet/testnet deposit gates.
- Provider authentication is adapter-owned. Official 1Click receives `ONECLICK_JWT` when configured; Tidepool explicitly receives no official partner JWT. Arbitrary provider URLs fail closed. This remains one provider selected per environment, not simultaneous orchestration, quote comparison, health routing or automatic failover.
- Added regression assertions in `scripts/verify-checkout-api.mjs` for provider identity, network classification, default selection, mainnet JWT isolation and rejection of unregistered origins. These tests are committed but have not yet been run in CI.
- The buyer wallet layer remains separate from provider adapters. Existing Base Sepolia EIP-1193 transfer support and MetaMask asynchronous provider-injection hardening are retained. WalletConnect, Solana/NEAR signing and additional source networks remain out of scope for this adapter refactor.
- The direct wallet path still requires fresh mobile browser acceptance, provider deposit detection and independent NEAR NEP-141 settlement verification. No quote was committed and no funds were sent during this refactor.
- No Production deployment, main-branch merge, provider migration or mainnet activation was performed.


### Preview verification update — 7 November 2026

- Cloudflare Pages Preview deployment `79f6ba95-56fa-434c-8b56-8ef71a9dadb2` completed successfully for commit `afcd4b97afb6dbe60998193b2c0dde7d5835c372`. The application bundle and standalone `pelargo.js` embed bundle both built.
- An earlier deployment attempt at `df9042a` failed because the provider adapter refactor malformed the `fetch()` options object. The syntax error was corrected in `afcd4b9`; the succeeding Pages build confirms Functions bundling now completes.
- Branch alias: `https://design-blue-white-premium.pelargo.pages.dev`.
- PR #5 validation notes were updated to reflect the successful Preview build. GitHub Actions has not reported a current-head CI run; the new adapter regression assertions therefore remain unverified by CI.
- This verifies compilation and Preview deployment only. It does not verify runtime provider requests, MetaMask injection in the user's mobile browser, a new source deposit, provider detection or settlement. No payment was initiated.


## Buyer checkout recovery after wallet-app interruption — 7 November 2026

- Added device-local recovery for the committed buyer checkout state in `src/components/PelargoCheckout.tsx`. It is scoped to the checkout order, merchant destination and session expiry, and restores the selected source asset, refund address, provider deposit instructions and submitted transaction hash after a page reload or MetaMask browser interruption.
- The signed checkout bearer token and wallet credentials are deliberately not written to browser storage. The merchant checkout session remains the authority; expired sessions/quotes are blocked from wallet submission. A recovered quote is not automatically refreshed or rerouted.
- The checkout continues to poll the existing authenticated payment-status endpoint after restoring committed instructions. The buyer must request a fresh quote when the old quote expires; the old deposit address must not be reused.
- Browser storage may be unavailable in private/restricted contexts; the active checkout remains usable in that case, but cross-reload recovery cannot be guaranteed.
- This is a client-side recovery patch only. It does not yet provide cross-device recovery or a server-side resume endpoint. It has not yet been built, CI-tested, or accepted in MetaMask mobile. No Cloudflare deployment, merge, production change or payment was performed.

- Follow-up hardening: recovery is now read in a client-side effect after mount rather than during the initial render, avoiding direct `localStorage` access during server rendering and preventing server/client hydration mismatch. Commit: `f3ed90881f8266375c6e5ea37a769480d9261e9a`.
- CI status lookup for the recovery commits returned no reported statuses or PR-triggered workflow runs. Treat build/test status as unknown, not passed. Cloudflare Preview deployment and MetaMask mobile validation remain pending.


## Testnet settlement investigation — 7 November 2026

- Investigated the stuck Preview order `ORDER-35541967`. The Preview D1 record shows destination network NEAR, destination asset `nep141:usdc.tidepool-sandbox.testnet`, recipient `agentg.testnet`, expected amount `1000000` atomic units, provider status `SUCCESS`, and payment lifecycle status `processing`. The persisted candidate is `9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS`. The provider update timestamp is `2026-11-07T07:15:31.071Z` (08:15:31 WAT). This is not settlement evidence and the order must not be marked paid until canonical verification succeeds.
- Runtime logs previously established that the configured public NearBlocks testnet v3 endpoint returned HTTP 429 for candidate lookups. The verifier then returned `NEAR_SETTLEMENT_CANDIDATES_FAILED`. This is an indexer availability/rate-limit failure, not proof that the destination transfer failed.
- Tidepool's documented `GET /v0/status` response includes a Tidepool-specific `tidepool.explorer` array with labelled transaction URLs, including the `swap (execute_intents)` transaction. Current `payment-status.ts` extracts the generic `swapDetails` hash arrays but discards this Tidepool-specific explorer metadata. The labels can improve candidate selection; they do not provide the transaction signer and cannot replace canonical RPC verification.
- FastNear Transactions API supports direct transaction lookup by hash on testnet but requires a FastNear API key. No paid API subscription or key was provisioned.
- FastNear NEAR Data API exposes testnet block documents by height. It is a possible no-indexer-key recovery path: locate a narrow finalized block window around the provider update time, extract the matching transaction's signer, then pass that signer only as a hint to the existing canonical NEAR RPC verifier. This is a block-window scan, not a direct hash lookup. Authentication/rate limits and the correct scan window have not yet been live-tested; do not describe this fallback as implemented or proven.
- NearScanner's published free API documentation describes its indexed REST API as Nightshade mainnet; it is not currently a verified testnet replacement.
- No source code, D1 data, secrets, or Cloudflare deployment was changed during this investigation. The buyer must not resubmit the source transfer or create a replacement order. The separate `ORDER-34416645` remains unrelated.
- Next engineering step: preserve Tidepool's labelled explorer evidence in the payment-status diagnostics, then test a bounded NEAR Data block scan against the three recorded hashes before integrating it as a fallback. Canonical RPC must continue to verify finality, successful execution, exact NEP-141 contract, recipient and net amount.
 

## Bounded NEAR RPC signer recovery — 7 November 2026

- Added a testnet-only fallback in `functions/_lib/near-settlement-verifier.ts` for transient NearBlocks failures (HTTP 429/5xx, network and timeout failures) and for successful indexer responses that do not contain a matching signer.
- The fallback uses the configured canonical NEAR RPC only. It obtains the finalized head, binary-searches block timestamps around the provider status `updatedAt`, inspects a bounded ±8 block window, fetches non-empty chunks with bounded concurrency, and accepts a signer only when exactly one transaction matches the requested hash.
- The discovered signer is untrusted lookup metadata only. The existing `EXPERIMENTAL_tx_status` FINAL request and exact NEP-141 receipt checks remain mandatory before any settlement write. No signer, provider SUCCESS status, explorer link or hash alone can settle an order.
- `functions/api/payment-status.ts` now retains a bounded/sanitized Tidepool `tidepool.explorer` evidence list and prioritizes a transaction URL labelled `execute_intents` when its final path segment is a valid NEAR hash. It passes the provider's `updatedAt` timestamp to the verifier as the scan anchor.
- This is source implementation only. The RPC block/chunk response contract, scan hit rate and performance have not yet been live-tested against `ORDER-35541967`. It has not been deployed to Cloudflare Preview. Do not claim the order is settled; its status remains `processing` until the existing canonical verifier commits immutable evidence.
- FastNear paid Transactions API is not a dependency. No paid key was provisioned. No D1 row, secret, production deployment, main branch, or payment was changed.


### Follow-up implementation notes

- Added a mocked regression case in `scripts/verify-checkout-api.mjs` for the no-key path: NearBlocks returns HTTP 429, the canonical RPC block/chunk scan locates a unique signer, and the verifier still requires `EXPERIMENTAL_tx_status` plus the exact NEP-141 receipt transfer.
- Fixed timestamp extraction to read `timestamp_nanosec` from the resolved block object. Payment status now passes the live provider `updatedAt`, falling back to the previously persisted `provider_updated_at` when the current response omits it.
- The regression script has been committed but has not been executed in this environment. GitHub reports no workflow runs or commit statuses for the latest head. Cloudflare Pages Preview builds are being triggered by branch pushes; a successful Pages build is not a substitute for the API integration test or live transaction recovery.


### RPC scan load control and current Preview state

- Limited the bounded RPC block/chunk recovery scan to one prioritized transaction candidate per payment-status poll. This avoids repeating the block-window scan for every intermediate NEAR hash returned by one provider response; subsequent polls can retry.
- Preview D1 was re-read after the implementation. `ORDER-35541967` remains `processing`, provider status `SUCCESS`, candidate `9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS`; no D1 rows were changed by this work.
- The latest source commits are deployed through Cloudflare Pages Preview only. Production branch `build/live-intents`, Production D1, and Production deployment were not modified.
- Still outstanding: execute the committed API regression script, trigger a status poll on the existing order in Preview, inspect the new diagnostic stages and runtime logs, and independently confirm the exact NEP-141 receipt before any settled transition.


### Bounded testnet signer-recovery diagnostics (7 November 2026)

The testnet fallback now scans a configurable, bounded window ending eight blocks after the first finalized block at or after Tidepool's provider update timestamp. The default is 120 blocks (mostly before the provider timestamp), configurable with the server-side `NEAR_TX_RECOVERY_WINDOW_BLOCKS` setting from 8 to 600. The fallback reports the searched height range, block count, and non-empty chunk count in bounded verification diagnostics. It still requires a unique matching transaction signer followed by canonical `EXPERIMENTAL_tx_status` finality and exact NEP-141 receipt verification. The merchant workspace now displays candidate-specific verification stages and bounded scan details on 503 responses. This is diagnostic and recovery coverage, not proof that the existing stuck payment will settle; the fallback has not yet been live-validated against that order. Do not resubmit its source deposit.
