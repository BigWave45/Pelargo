# Pelargo threat model

**Status:** implementation-oriented threat model for the current hackathon prototype. It identifies assets, trust boundaries, controls and residual risks visible in the repository and recorded acceptance evidence. It is not a formal security audit or a claim that every threat has been tested.

## Security objectives

1. A merchant can access only its own orders and checkout sessions.
2. A buyer session is short-lived and bound to the intended merchant order.
3. Provider status, source-chain activity and unverified transaction hashes cannot independently mark an order paid.
4. Settlement evidence must match the expected NEAR NEP-141 token contract, recipient and exact amount.
5. Evidence persistence and the paid/settled lifecycle transition must not split into inconsistent partial writes.
6. Reconciliation must not allow unauthenticated callers or concurrent workers to corrupt payment state.
7. Secrets and production resources remain outside public browser code and testnet judge workflows.

## Assets and trust boundaries

| Asset / boundary | Security significance |
|---|---|
| Merchant API keys and provisioning credentials | Authorize merchant-side operations; compromise can permit unauthorized order/session creation within the affected merchant |
| Checkout-session signing secret and buyer bearer sessions | Protect buyer access to a specific order; leakage or weak binding could expose or alter checkout state |
| Merchant/order ownership records | Prevent cross-merchant data access and order substitution |
| Provider quote, deposit address and status | External, mutable inputs; must be bound to the correct order and validated |
| Source-chain RPC observations | External chain data used to establish source deposit facts for the configured Base Sepolia route |
| NEAR RPC and destination transaction candidate | External chain data used for the final settlement decision |
| D1 lifecycle and evidence rows | Authoritative application record of order state and verified settlement |
| Reconciliation secret and Worker | Protect background processing and recovery operations |
| Cloudflare environment bindings | Separate Preview and Production data, credentials and operational authority |

## Threats, controls and residual risk

| Threat | Existing control / evidence | Residual risk or limitation |
|---|---|---|
| Stolen or invalid merchant API key | Merchant authentication rejects invalid keys; hosted external-merchant acceptance includes invalid-key rejection | Key rotation, broad account recovery and enterprise identity controls are not claimed |
| Cross-merchant order enumeration | Merchant-scoped retrieval; API tests and hosted acceptance verify a second merchant cannot retrieve another merchant's order | Continue testing every newly added endpoint for tenant scoping |
| Buyer session replay or order substitution | Short-lived signed checkout sessions, stored token-hash/state validation and order binding; security tests cover checkout-session assertions | Signing-secret compromise and browser/device compromise remain material risks |
| Provider reports SUCCESS for a wrong or missing transfer | Provider SUCCESS is only a candidate signal; NEAR verifier checks final execution, token contract, recipient and exact amount; adversarial test expects processing state and zero evidence rows on mismatch | Correctness still depends on canonical RPC availability and verifier parsing/validation |
| Source deposit sent to wrong token, address or amount | Base Sepolia source verifier validates expected token, deposit destination and amount for the configured route | Source verification is implemented for the demonstrated route, not arbitrary chains |
| Destination transaction hash is stale, mismatched or unverifiable | Candidate is checked against canonical NEAR RPC; database guard rejects stale/non-matching evidence; verifier outage leaves lifecycle processing | RPC outage, finality semantics and provider metadata errors require operational monitoring |
| Partial settlement write | Evidence insert and paid/settled transition are tested as an atomic batch; forced batch failure must leave neither partial result | Database and migration correctness remain part of the trusted computing base |
| Concurrent reconciliation claims | Reconciliation tests cover job claiming, concurrency, lease expiry/recovery and worker authentication | A successful scheduled live run is not yet evidenced; configured Cron and queued work are not equivalent to execution proof |
| Unauthorized Worker invocation | Internal worker authentication and secret-based checks are covered by code-level tests | Secret exposure or misconfiguration can compromise background operations |
| Preview/Production environment confusion | Separate Pages branches and D1 bindings; judge guide directs evaluators to isolated Preview and prohibits customer funds | Operators can still select the wrong environment; production promotion requires a separate reviewed process |
| Secret leakage in client bundle or repository | Documentation requires server-side storage of merchant keys and Worker/session secrets; CI and build checks are part of validation | No claim of an independent secret-scanning audit or formal penetration test |

## Explicit assumptions

- The configured NEAR RPC endpoint returns authentic chain data and correctly represents final execution.
- Cloudflare Pages Functions, D1, Worker secrets and deployment permissions are not compromised.
- Merchant operators protect API keys and use server-side authentication for merchant API calls.
- The buyer's wallet and device correctly display and authorize the transaction the buyer intends to submit.
- The execution provider may be delayed, unavailable, incorrect or compromised; Pelargo must not treat its status as final settlement authority.

## Security properties demonstrated by tests

- Invalid merchant authentication is rejected.
- Buyer session validation and merchant order scoping are exercised.
- Cross-merchant retrieval is rejected in hosted acceptance.
- Provider SUCCESS paired with a mismatched finalized NEAR transfer does not settle the order and writes no settlement evidence.
- NEAR verifier unavailability leaves the order processing.
- A forced atomic settlement batch failure does not leave evidence or a paid/settled state behind.
- A matching finalized NEP-141 transfer can settle even when provider status remains PROCESSING.

These are deterministic tests using mocked provider/RPC responses and an in-memory migrated database unless explicitly identified as hosted acceptance. They are not a live adversarial assessment of provider, RPC infrastructure or production deployment. See [TESTING.md](TESTING.md).

## Out of scope / not claimed

No formal third-party audit, bug bounty, production incident response programme, mainnet readiness, arbitrary-chain verifier, provider failover, Pelargo-operated liquidity, smart-contract-enforced cross-chain proof or zero-trust infrastructure certification is claimed.
