# Pelargo — Hackathon Project Scope

A premium, non-custodial checkout widget built on intents. Merchants embed one script tag; buyers pay from any wallet and chain; merchants receive exact settlement without either party managing cross-chain complexity.

---

## 1. Hackathon Goal & Problem Statement

### The Problem
Cross-chain commerce today is fragmented:
- **Merchants** want stable, predictable settlement (typically USDC on their home chain) without managing multi-chain liquidity or custodial risk.
- **Buyers** hold assets across disparate chains (Ethereum, Base, Solana, NEAR, Arbitrum) and abandon checkout when forced to use bridges, DEXs, or wrap tokens manually.
- **Existing widgets** feel like noisy crypto trading desks rather than trusted, calm private banking checkout flows.

### The Pelargo Solution
- **Zero-friction embed**: One script tag and one button for any merchant.
- **Non-custodial by design**: Pelargo never holds or pools funds. Funds move directly from buyer to intent solvers to merchant.
- **Calm, private-banking UI**: Zero crypto jargon, strict design token discipline, generous whitespace, and responsive bottom-sheet presentation.

---

## 2. Hackathon Implementation (Stages 1–3 — Complete)

### Stage 1: Design System & Token Architecture
- [x] Pure CSS custom properties (`src/styles/tokens.css`) as the single source of truth for colors, radii, spacing, and timings.
- [x] Full Dark (default) and Light theme support with verified 4.5:1 text contrast ratios.
- [x] Motion-reduced media query compliance (`prefers-reduced-motion`).
- [x] Minimal inline SVG brand identity (lowercase `pelargo` wordmark with custom bird in flight mark).

### Stage 2: Core Checkout Widget
- [x] **Modal container**: Centered desktop dialog (`--modal-width: 400px`) transitioning to native bottom sheet under 480px viewport width.
- [x] **Focus trapping & keyboard access**: Full tab navigation loop, `Escape` key dismissal, visible 2px accent focus rings.
- [x] **Step 1 (Summary & Choose)**: Top 3 chain routes (USDC/Base, ETH/Ethereum, SOL/Solana) with quick selection.
- [x] **Step 2 (Token Picker)**: Real-time search across tokens and chains with chain-grouped views and empty search state.
- [x] **Step 3 (Confirm & Quote)**: Deterministic quote calculation with transparent 0.8% fee breakdown, live 42s countdown timer with <10s warning state.
- [x] **Step 4 (Settlement Progress)**: Calm 3-stage progress timeline (`Payment sent` → `Confirming` → `Delivered to merchant`) with pulsing indicator, `aria-live` screen reader updates, and an exit confirmation guard.
- [x] **Step 5 (Receipt)**: Animated success checkmark, order breakdown, and transaction link.
- [x] **Error & Edge States**:
  - `Quote expired`: Friendly rate-refresh mechanism.
  - `Payment failed`: Plain-language confirmation that funds remain in buyer's wallet with retry trigger.
  - `Skeleton loading`: 600ms shimmer states for route discovery.

### Stage 3: Demo Store & Review Panel
- [x] Realistic mock merchant storefront ("Northwind Goods") selling physical field technical journals in USDC.
- [x] Developer copyable integration code snippet.
- [x] Floating dev review panel enabling judges to immediately switch themes, jump to any of the 8 screens/states, and test merchant custom theme overrides.

---

## 3. Post-Hackathon Roadmap (Stages 4–6)

### Stage 4: Live Intent Solver Integration
- Connect widget backend to solver aggregation networks (e.g., Across Protocol, UniswapX, 1inch Fusion, or LI.FI).
- Generate dynamic deposit addresses with deterministic time-locked refunds.

### Stage 5: Multi-Chain Wallet Connection
- Embed lightweight wallet connectors (EIP-6963 multi-injected provider discovery, WalletConnect v2, Solana Wallet Adapter).
- One-click native signing from MetaMask, Phantom, Coinbase Wallet, or Rabby.

### Stage 6: Merchant Dashboard & Webhooks
- Merchant portal to configure destination payout token and chain (e.g., auto-settle to Arbitrum USDC).
- Signed webhook notifications for order fulfillment systems (Shopify, WooCommerce, custom backends).

---

## 4. Intentional Non-Goals (What We Explicitly Excluded)
- **No custodial contracts or escrow vaults**: Eliminates smart contract counterparty risk.
- **No trading terminology in buyer view**: Avoided "slippage", "gas priority", "AMM pools", and "liquidity providers".
- **No bloat UI libraries**: Zero heavy third-party UI dependencies; pure native CSS tokens for fast 360px–desktop performance.
