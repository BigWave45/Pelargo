# Product direction and wallet-first checkout plan — 7 November 2026

This entry records the current product/design decision. It is a plan and scope update, not evidence that wallet connection or direct wallet execution is implemented.

- Continue the UI, UX and copy redesign in parallel with wallet technical validation. The redesign is not paused or superseded by wallet work.
- Preserve the existing merchant account/API-key model, merchant-created checkout sessions, widget contract, Tidepool/1Click quote integration, order state machine, provider polling and independent NEAR settlement verifier.
- Universal checkout is the long-term product direction: one merchant integration, buyer pays from a wallet/network/asset they already use where supported, and the merchant receives its configured settlement asset. Do not claim universal wallet or chain support in the current build.
- Hackathon wallet target is Base-first: connect wallet, detect address and chain, inspect balances for assets supported by the active provider route, obtain the existing Pelargo quote, then establish whether the provider supports a directly signable/broadcastable transaction for the chosen wallet. Direct signing is conditional on provider compatibility.
- The current deposit-address flow remains the working fallback: buyer receives instructions and sends funds manually. Keep it intact until the connected-wallet flow passes an end-to-end test.
- Separate the work into three capabilities: (1) wallet connection, (2) network/token balance discovery, and (3) transaction construction/signing/broadcast. Completing (1) does not prove (3).
- Design direction remains blue/white, modern financial infrastructure plus editorial minimalism. Remove generic AI decoration. Use product UI states, precise diagrams and restrained geometric elements only where they explain the payment journey. Design copy around simplicity, with separate messaging for buyers, merchants and developers.
- Recommended order: journey/screen-state definition; early provider compatibility spike; wallet connection and balance discovery; direct execution only if confirmed; integrate and polish checkout; finish merchant/developer/public-site redesign; mobile and end-to-end acceptance; update demo and submission docs.
- No production deployment, merge, mainnet activation or payment initiation without explicit approval.

---

# Preview integration and migration audit — 7 November 2026

- Read-only Cloudflare Pages deployment inspection confirms the latest active-branch Preview deployment is `bf42d182-f628-4073-b7b2-e4f8f7847475`, commit `3acdaa917dd796f3a9c652defbcd97361fb82e91`, with build and deploy stages successful. The stable Preview alias remains `https://reliability-background-recon.pelargo.pages.dev`. This is a deployment check, not an independent merchant-origin checkout acceptance test.
- GitHub Actions CI run #490 for commit `3acdaa9` completed successfully. The run includes the repository CI workflow; it does not exercise a live merchant API key or a real committed quote.
- Read-only query of Preview D1 `d1_migrations` confirms all 19 migrations are applied. In particular, `0019_reconciliation_backfill_eligible_states.sql` is recorded at migration id 18 and `0018_preview_password_reset.sql` at id 19. The filenames are not ordered by their application record IDs. No database writes were made. Production D1 was not queried or changed.
- Cloudflare deployment metadata confirms the Preview Pages deployment is bound to D1 database `0335acdc-f0e0-42f6-ba87-e3448fb91728`. The latest deployment metadata lists `MERCHANT_PROVISIONING_SECRET` and `ORDER_SESSION_SECRET` as secret-type bindings but does not expose their values; this does not independently prove their runtime validity.
- The Preview reconciliation Worker was previously verified as deployed with the five-minute cron active. The encrypted `RECONCILIATION_SECRET` value is not readable through the Cloudflare API, and no successful scheduled settlement run is established by this audit. Do not infer secret validity or attribute the existing settled order to the Worker.
- Merchant API-key issuance/rotation and the Developers integration screen are implemented on `reliability/background-reconciliation`. The standalone embed's `process.env.NODE_ENV` browser-runtime reference was fixed, and the latest Preview deployment includes that commit. The actual merchant flow remains unaccepted: issue/rotate a key, create a real merchant order/session server-side, load the widget from a separate merchant origin, preview a dry quote, and verify the buyer confirmation boundary. Do not commit a quote or send funds during this acceptance pass without explicit approval.
- A visual-only redesign is in progress on `design/blue-white-premium`, with draft PR #5 targeting `reliability/background-reconciliation`. It adds isolated checkout/workspace CSS and stylesheet imports; it does not intentionally change payment, quote, deposit, session, authentication, or settlement logic. The branch has not been deployed or merged. No CI run is currently reported for the PR head SHA `2cc147af80c8ab8ccd75f33c4cf2873032f801fc`; visual browser acceptance and build verification remain outstanding.
- No Production resources were queried or changed, no merge occurred, and no branch was deleted.

## Next acceptance sequence

1. Sign in to the Preview merchant workspace and generate a merchant API key. Save it only in a server-side secret store; do not paste it into browser code or this chat.
2. From a merchant backend route, call `POST /api/checkout-session` with a fresh external order ID and trusted order configuration. Confirm the response is `201` and contains a short-lived session token and public session claims.
3. On a separate merchant-origin test page, load `https://reliability-background-recon.pelargo.pages.dev/pelargo.js`, call the merchant backend route, and mount `<pelargo-checkout>` using the returned claims and token.
4. Verify the widget mounts, requests token discovery, and displays a dry quote. Stop before buyer confirmation/committed quote unless a separate testnet payment has been explicitly approved.
5. Test authenticated `GET /api/order` or `GET /api/payment-status` from the merchant backend. Verify cross-merchant access is denied.
6. Separately establish Worker secret validity and scheduled invocation evidence from runtime logs and Preview D1 job state. Review expiry and uncertain-commit sweep side effects before dispatching or redeploying anything.
