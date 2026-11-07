# Verification and evidence matrix

This matrix separates source-code tests, hosted application checks, chain evidence and operational configuration. These evidence types are related but not interchangeable.

## Evidence matrix

| Claim | Verification method | Recorded result | What it proves | What it does not prove |
|---|---|---|---|---|
| Repository installs and builds | CI: frozen Bun install, type-check, security tests, API tests and frontend build | Passing CI recorded for recent documentation and release PRs; see linked PR checks | The checked commit passes the configured automated pipeline | Runtime correctness against every external service or production readiness |
| Merchant authentication and tenant isolation | API tests and hosted external-merchant smoke test | Seven hosted checks passed, including invalid-key rejection and cross-merchant isolation | The tested merchant API paths enforce the checked access boundaries | Complete security coverage of every endpoint or a formal audit |
| Buyer checkout-session binding | Security/API tests for signed session validation and order binding | Covered by CI test suite | Tested sessions are validated and scoped to their intended order | Protection after signing-secret compromise or on a compromised buyer device |
| Dry quote and hosted checkout surface | Main Preview judge walkthrough, stopping before committed quote | Walkthrough path documented in [JUDGE_GUIDE.md](JUDGE_GUIDE.md) | Merchant registration, destination configuration, signed session, buyer surface and dry quote preview | A committed quote, deposit instructions, transfer or settlement |
| Base Sepolia source deposit | Read-only evidence record for ORDER-35541967 | Source transaction 0x886ff617f13d6eddb23d376eaf2437a90082b610f8c006de743b5df1a5464d5c; Base Sepolia token contract 0x38d81431b9f76d9699af7517040d5221d9dea252; 1,012,633 atomic units | A recorded source-side deposit observation for the demonstrated route | That the merchant received the expected destination asset |
| NEAR destination settlement | Canonical NEAR RPC verification and persisted evidence for ORDER-35541967 | Transaction 9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS; NEP-141 contract usdc.tidepool-sandbox.testnet; recipient agentg.testnet; 1,000,000 atomic units; block 276599398 | Matching finalized destination transfer for the configured 1 USDC obligation | Mainnet operation, arbitrary NEAR tokens or other destination chains |
| End-to-end merchant lifecycle | Correlate ORDER-35541967 source evidence, destination evidence and Preview D1 state | Order paid; lifecycle settled; destination candidate equals persisted evidence transaction | The demonstrated Base Sepolia → NEAR testnet flow reached a persisted merchant settlement state | Production readiness, repeatability at scale or a guaranteed settlement time |
| Later source reconciliation after settlement | Merchant Verify source action and read-only Preview D1 evidence for ORDER-71455096 | Source transaction `0xbbccf1b245af1932f8feacb755d8574c6dd276965661123354f829ffb9f2ffd4` verified against the quote and recorded against the same order ID after its 5 USDC NEAR settlement; paid/settled state unchanged | Source provenance can be added after destination settlement without reopening the order; the merchant response stated the provider was not notified again | Provider notification behaviour for every possible status/race condition, or mainnet operation |
| Provider status is not settlement authority | Adversarial API integration tests | Provider SUCCESS + mismatched finalized NEAR transfer remains processing; zero settlement evidence; database guard rejects mismatched evidence | Pelargo's tested decision boundary is independent of provider SUCCESS | Live fault injection against a compromised provider |
| Verifier outage and atomicity | Mocked API integration tests | Verifier outage leaves processing; forced settlement batch failure leaves no partial evidence or paid state | Fail-closed behavior and atomic persistence in the tested scenarios | Every possible infrastructure failure mode |
| Positive control independent of provider status | Mocked API integration test | Matching finalized NEP-141 transfer can settle while provider status is PROCESSING | Settlement decision follows verified destination evidence, not provider status alone | That every provider status mapping is correct |
| Mobile wallet handoff | User-observed manual iPhone browser → MetaMask app acceptance | ORDER-68886375 has confirmed destination evidence for 1 USDC to agentg.testnet | One reported external mobile wallet handoff and subsequent successful Preview checkout | Complete source-to-destination evidence for that order, automated browser coverage or broad device compatibility |
| Scheduled reconciliation deployment | Read-only Preview Worker/D1 inspection | Preview Worker, isolated Preview D1, encrypted secret, five-minute Cron, migrations 0019/0020 and six queued eligible jobs observed | Worker configuration, schema and queued work exist | That a scheduled invocation successfully claimed and processed a real eligible payment |
| Production/mainnet | No production payment evidence | Mainnet committed quotes disabled; production branch remains separate | Production is deliberately outside this hackathon demonstration | Production readiness or live mainnet payment capability |

## Primary end-to-end records

Two records now provide explicit complete source-to-destination evidence:

- **ORDER-35541967:** 1 USDC delivered to `agentg.testnet`; source transaction `0x886ff617f13d6eddb23d376eaf2437a90082b610f8c006de743b5df1a5464d5c`; NEAR destination transaction `9myMAuSbY4NAcCWDkhZUWqQLGTW47Z2dkrxjhGgtJspS`.
- **ORDER-71455096:** 5 USDC delivered to `agentg.testnet`; source transaction `0xbbccf1b245af1932f8feacb755d8574c6dd276965661123354f829ffb9f2ffd4`; NEAR destination transaction `EhTBbho5ZWgEUL2G8X36AizRWRKWcsJTzXzV3CvxVQbm`. The source evidence was verified and persisted after destination settlement, without changing the paid/settled state.

The source and destination amounts differ because the route includes conversion and fees. The merchant's configured destination amount is the settlement obligation. See [JUDGE_GUIDE.md](JUDGE_GUIDE.md) for the full transaction, token, recipient, block and verification details.

## How to reproduce safely

- Use [the judge guide](JUDGE_GUIDE.md) to inspect the hosted checkout and stop at dry quote preview.
- Use the recorded transaction hashes above to inspect the already completed testnet payment. Do not initiate another payment to recreate the evidence.
- Use [TESTING.md](TESTING.md) for test commands and adversarial cases.
- Use [architecture.md](architecture.md) for component boundaries and [threat-model.md](threat-model.md) for trust assumptions and residual risks.

## Evidence discipline

- Label each result as automated test, hosted acceptance, manual user observation, chain transaction evidence or deployment/configuration inspection.
- Keep testnet evidence separate from mainnet claims.
- A successful build is not a payment test.
- A provider status is not chain evidence.
- A chain transaction hash without matching token, recipient, amount and final execution is not settlement proof.
- A configured Cron schedule is not a successful scheduled job run.
- Do not convert a single observation into a latency, reliability or throughput guarantee.
